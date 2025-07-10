import { kv } from '@vercel/kv';
import { db } from '@vercel/postgres';
import axios from 'axios';
import chromium from '@sparticuz/chromium';
import playwright from 'playwright-core';
import { NextResponse } from 'next/server';

export const maxDuration = 300;

const AI_USER_AGENTS = [
  { name: 'GPTBot', value: 'Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/41.0.2272.96 Mobile Safari/537.36 (compatible; GPTBot/1.0; +http://www.openai.com/bot.html)' },
  { name: 'Google-Extended', value: 'Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/41.0.2272.96 Mobile Safari/537.36 (compatible; Google-Extended; +http://www.google.com/bot.html)' },
  { name: 'anthropic-ai', value: 'anthropic-ai' },
  { name: 'cohere-ai', value: 'cohere-ai' },
  { name: 'PerplexityBot', value: 'PerplexityBot/1.0 (+https://about.perplexity.ai/perplexity-bot)' },
  { name: 'YouBot', value: 'Mozilla/5.0 (compatible; YouBot/1.0; +http://about.you.com/youbot)' },
  { name: 'magpie-crawler', value: 'magpie-crawler/1.0 (+https://www.magpie-crawler.com)' },
  { name: 'CCBot', value: 'CCBot/2.0 (https://commoncrawl.org/faq/)'},
  { name: 'Bytespider', value: 'Bytespider' },
];

async function saveResult(scanId: string, result: { url: string; isBlocked: boolean; blockingMethod: string; details: string; }) {
  const { url, isBlocked, blockingMethod, details } = result;
  await db.sql`
    INSERT INTO ScanResults (scan_id, url, is_blocked, blocking_method, details)
    VALUES (${scanId}, ${url}, ${isBlocked}, ${blockingMethod}, ${details})
    ON CONFLICT (scan_id, url) DO NOTHING;
  `;
}

export async function GET() {
  // Retrieve stringified job payload from queue
  const rawJobPayload = await kv.rpop('scan_queue');

  if (!rawJobPayload) {
    return NextResponse.json({ message: 'No jobs in queue.' });
  }

  // Parse the stringified payload. This is necessary because jobs are added with JSON.stringify().
  let jobPayload: { scanId: string; url: string };
  try {
    // Ensure rawJobPayload is treated as a string before parsing
    jobPayload = JSON.parse(String(rawJobPayload));
  } catch (error) {
    console.error("Failed to parse job payload:", rawJobPayload, error);
    // Consider how to handle malformed job payloads. For now, returning an error.
    // Alternatively, could move to a dead-letter queue or log and discard.
    return NextResponse.json({ message: 'Malformed job payload in queue.' }, { status: 500 });
  }

  const { scanId, url } = jobPayload;

  try {
    const robotsUrl = new URL('/robots.txt', url).toString();
    try {
      const robotsRes = await axios.get(robotsUrl, { timeout: 5000 });
      const robotsTxt = robotsRes.data;

      const universalBlockRegex = /User-agent: \*\s*Disallow: \//i;
      if (universalBlockRegex.test(robotsTxt.replace(/\s/g, ''))) {
        await saveResult(scanId, { url, isBlocked: true, blockingMethod: 'robots.txt', details: 'All crawlers blocked via wildcard (*)' });
        return NextResponse.json({ message: 'Job processed.' });
      }

      for (const agent of AI_USER_AGENTS) {
        const agentRegex = new RegExp(`User-agent: ${agent.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*Disallow: /`, 'i');
        if (agentRegex.test(robotsTxt.replace(/\s/g, ''))) {
          await saveResult(scanId, { url, isBlocked: true, blockingMethod: 'robots.txt', details: `Specifically blocked: ${agent.name}` });
          return NextResponse.json({ message: 'Job processed.' });
        }
      }
    } catch (error) {
        // Log if robots.txt fetch fails, then proceed with Playwright checks.
        console.warn(`Failed to fetch or parse robots.txt for ${url}:`, error instanceof Error ? error.message : String(error));
        // Optionally, save a specific state if needed, e.g.:
        // await saveResult(scanId, { url, isBlocked: false, blockingMethod: 'robots.txt', details: 'robots.txt not accessible or parse error' });
        // For now, we just log and proceed to Playwright check as per original logic.
    }
    
    let browser = null; // Initialize browser to null
    try {
      browser = await playwright.chromium.launch({
        args: chromium.args,
        executablePath: await chromium.executablePath(),
        headless: true,
      });

      for (const agent of AI_USER_AGENTS) {
        let context = null;
        try {
          context = await browser.newContext({ userAgent: agent.value });
          const page = await context.newPage();

          const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });

          if (response && !response.ok()) {
            await saveResult(scanId, { url, isBlocked: true, blockingMethod: 'HTTP Status', details: `Blocked with status ${response.status()} (as ${agent.name})` });
            // If blocked for one agent, no need to check others via Playwright for this URL.
            return NextResponse.json({ message: 'Job processed, Playwright block detected.' });
          }

          const bodyContent = (await page.content()).toLowerCase();
          if (bodyContent.includes('access denied') || bodyContent.includes('forbidden') || bodyContent.includes('not permitted')) {
            await saveResult(scanId, { url, isBlocked: true, blockingMethod: 'JavaScript/HTML', details: `Blocked via page content (as ${agent.name})` });
            // If blocked for one agent, no need to check others via Playwright for this URL.
            return NextResponse.json({ message: 'Job processed, Playwright block detected.' });
          }
        } finally {
          if (context) {
            await context.close();
          }
        }
      }
      // If loop completes, no Playwright blocking was detected for any agent
      await saveResult(scanId, { url, isBlocked: false, blockingMethod: 'none', details: 'No Playwright blocking detected for any AI user agent.' });

    } finally {
        if(browser) await browser.close();
    }

  } catch (error) {
    // CORRECTED: This block now properly handles the error type without 'any'.
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`Failed to process ${url}`, error);
    await saveResult(scanId, { url, isBlocked: false, blockingMethod: 'error', details: `Scan failed: ${errorMessage.substring(0, 200)}` });
  }

  return NextResponse.json({ message: 'Job processed.' });
}