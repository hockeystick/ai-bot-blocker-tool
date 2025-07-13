import { kv } from '@vercel/kv';
import { db } from '@vercel/postgres';
import axios from 'axios';
import chromium from '@sparticuz/chromium';
import playwright from 'playwright-core';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 60; // Reduced from 300 to 60 seconds
export const dynamic = 'force-dynamic';

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
  const startTime = Date.now();
  
  // Get job from queue
  const jobPayload = await kv.rpop('scan_queue') as { scanId: string; url: string } | null;

  if (!jobPayload) {
    return NextResponse.json({ message: 'No jobs in queue.' });
  }

  const { scanId, url } = jobPayload;
  
  // Validate URL
  try {
    new URL(url);
  } catch {
    await saveResult(scanId, { 
      url, 
      isBlocked: false, 
      blockingMethod: 'error', 
      details: 'Invalid URL format' 
    });
    return NextResponse.json({ message: 'Invalid URL processed.' });
  }

  try {
    // Check robots.txt with shorter timeout
    const robotsUrl = new URL('/robots.txt', url).toString();
    try {
      const robotsRes = await axios.get(robotsUrl, { 
        timeout: 3000,
        maxRedirects: 3,
        validateStatus: (status) => status < 500 // Accept 4xx as valid responses
      });
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
    } catch { 
        // CORRECTED: This block now has no unused variables.
        /* Ignore robots.txt errors and proceed */ 
    }
    
    let browser;
    try {
      browser = await playwright.chromium.launch({
        args: chromium.args,
        executablePath: await chromium.executablePath(),
        headless: true, // CORRECTED: Changed from chromium.headless to true
      });

      const context = await browser.newContext({ userAgent: AI_USER_AGENTS[0].value });
      const page = await context.newPage();
      
      // Set shorter timeout for page load
      const response = await page.goto(url, { 
        waitUntil: 'domcontentloaded', 
        timeout: 15000 // Reduced from 20000 to 15000
      });
      
      // Check if we've exceeded our time budget
      const elapsed = Date.now() - startTime;
      if (elapsed > 45000) { // 45 second timeout
        throw new Error('Processing timeout exceeded');
      }

      if (response && !response.ok()) {
        await saveResult(scanId, { url, isBlocked: true, blockingMethod: 'HTTP Status', details: `Blocked with status ${response.status()} (as GPTBot)` });
      } else {
        const bodyContent = (await page.content()).toLowerCase();
        
        // More comprehensive content analysis
        const blockingIndicators = [
          'access denied', 'forbidden', 'not permitted', 'blocked',
          'bot detected', 'automated traffic', 'suspicious activity',
          'captcha', 'cloudflare', 'rate limit', 'too many requests'
        ];
        
        const foundIndicator = blockingIndicators.find(indicator => 
          bodyContent.includes(indicator)
        );
        
        if (foundIndicator) {
          await saveResult(scanId, { 
            url, 
            isBlocked: true, 
            blockingMethod: 'Content Detection', 
            details: `Blocking detected: "${foundIndicator}" found in page content` 
          });
        } else {
          await saveResult(scanId, { 
            url, 
            isBlocked: false, 
            blockingMethod: 'Passed All Tests', 
            details: `No blocking detected. Page loaded successfully as ${AI_USER_AGENTS[0].name}` 
          });
        }
      }
    } finally {
        if(browser) await browser.close();
    }

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const elapsed = Date.now() - startTime;
    
    console.error(`Failed to process ${url} after ${elapsed}ms:`, error);
    
    // Determine if it's a timeout or other error
    const isTimeout = errorMessage.includes('timeout') || 
                     errorMessage.includes('Timeout') || 
                     elapsed > 45000;
    
    await saveResult(scanId, { 
      url, 
      isBlocked: false, 
      blockingMethod: isTimeout ? 'timeout' : 'error', 
      details: isTimeout 
        ? `Request timed out after ${Math.round(elapsed/1000)}s`
        : `Error: ${errorMessage.substring(0, 150)}` 
    });
  }

  return NextResponse.json({ message: 'Job processed.' });
}