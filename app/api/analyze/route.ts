import { NextRequest, NextResponse } from 'next/server';
import { analyzeRoad } from '@/lib/road-analyzer';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const lat = parseFloat(searchParams.get('lat') || '');
  const lng = parseFloat(searchParams.get('lng') || '');

  if (!lat || !lng || isNaN(lat) || isNaN(lng)) {
    return NextResponse.json({ error: '위도/경도가 필요합니다.' }, { status: 400 });
  }

  const result = analyzeRoad(lat, lng);
  return NextResponse.json(result);
}
