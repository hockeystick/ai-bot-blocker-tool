import { db } from '@vercel/postgres';
import { kv } from '@vercel/kv';
import { NextResponse } from 'next/server';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const scanId = searchParams.get('scanId');

    if (!scanId) {
      return NextResponse.json({ error: 'scanId is required' }, { status: 400 });
    }

    const { rows: results } = await db.sql`
        SELECT url, is_blocked as "isBlocked", blocking_method as "blockingMethod", details 
        FROM ScanResults WHERE scan_id = ${scanId};
    `;

    const totalJobs = await kv.get<number>(`scan:${scanId}:total`) || 0;
    const isComplete = results.length >= totalJobs && totalJobs > 0;
    
    if (isComplete) {
      await kv.del(`scan:${scanId}:total`);
    }

    return NextResponse.json({
      results: results,
      isComplete: isComplete,
    });
  } catch (error) {
    console.error("Error fetching results:", error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}