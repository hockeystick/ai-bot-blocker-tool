import { kv } from '@vercel/kv';
import { NextResponse } from 'next/server';
import { nanoid } from 'nanoid';
import Papa from 'papaparse';

export const runtime = 'edge';

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json({ error: 'No file uploaded.' }, { status: 400 });
    }

    const text = await file.text();
    const parsedCsv = Papa.parse<string[]>(text, { header: false });
    const urls = Array.from(new Set(
      parsedCsv.data
        .flat()
        .filter(url => typeof url === 'string' && url.trim().startsWith('http'))
        .map(url => url.trim())
    ));

    if (urls.length === 0) {
        return NextResponse.json({ error: 'No valid URLs found in CSV.' }, { status: 400 });
    }

    const scanId = nanoid(16);

    const pipeline = kv.pipeline();
    urls.forEach(url => {
      const job = { scanId, url };
      pipeline.lpush('scan_queue', JSON.stringify(job));
    });
    pipeline.set(`scan:${scanId}:total`, urls.length);
    await pipeline.exec();

    return NextResponse.json({
      message: 'Scan started.',
      scanId: scanId,
      initialUrls: urls,
    });
  } catch (error) {
    console.error('Error starting scan:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}