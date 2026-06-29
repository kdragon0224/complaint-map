import { NextRequest, NextResponse } from 'next/server';
import { analyzeRoad } from '@/lib/road-analyzer';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const lat = parseFloat(searchParams.get('lat') || '');
  const lng = parseFloat(searchParams.get('lng') || '');
  const inputAddress = searchParams.get('address') || null;

  if (!lat || !lng || isNaN(lat) || isNaN(lng)) {
    return NextResponse.json({ error: '위도/경도가 필요합니다.' }, { status: 400 });
  }

  const result = analyzeRoad(lat, lng);
  const rec = result.recommendation;

  // 백그라운드로 로그 저장 (실패해도 응답에 영향 없음)
  supabase.from('query_logs').insert({
    input_address: inputAddress,
    lat,
    lng,
    result_agency: rec?.agency ?? null,
    result_agency_full: rec?.agencyFull ?? null,
    result_road_type: rec?.roadType ?? null,
    result_route_name: rec?.routeName ?? null,
    result_distance_m: rec?.distanceM ?? null,
    confidence: rec?.confidence ?? null,
    found: !!rec,
  }).then(() => {});

  return NextResponse.json(result);
}
