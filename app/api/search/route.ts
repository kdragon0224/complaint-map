import { NextRequest, NextResponse } from 'next/server';
import { analyzeRoad } from '@/lib/road-analyzer';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const HIGHWAY_KEYWORDS = [
  'IC', 'JC', '인터체인지', '분기점', '휴게소', 'SA',
  '한국도로공사', '도로공사', '고속도로',
];

function highwayScore(doc: { place_name?: string; address_name?: string; category_name?: string }): number {
  const name = (doc.place_name || doc.address_name || '').toUpperCase();
  const cat = (doc.category_name || '').toUpperCase();
  return HIGHWAY_KEYWORDS.some(kw => name.includes(kw.toUpperCase()) || cat.includes(kw.toUpperCase())) ? 1 : 0;
}

async function geocode(
  query: string,
  key: string,
): Promise<{ lat: number; lng: number; placeName?: string } | null> {
  const q = encodeURIComponent(query);
  const headers = { Authorization: `KakaoAK ${key}` };

  const [addrData, kwData] = await Promise.all([
    fetch(`https://dapi.kakao.com/v2/local/search/address.json?query=${q}`, { headers })
      .then(r => r.json()).catch(() => ({ documents: [] })),
    fetch(`https://dapi.kakao.com/v2/local/search/keyword.json?query=${q}&size=15`, { headers })
      .then(r => r.json()).catch(() => ({ documents: [] })),
  ]);

  const addrDoc = addrData.documents?.[0];
  if (addrDoc) {
    return { lat: parseFloat(addrDoc.y), lng: parseFloat(addrDoc.x) };
  }

  const kwDocs: any[] = kwData.documents || [];
  if (kwDocs.length === 0) return null;

  const sorted = [...kwDocs].sort((a, b) => highwayScore(b) - highwayScore(a));
  const doc = sorted[0];
  return { lat: parseFloat(doc.y), lng: parseFloat(doc.x), placeName: doc.place_name };
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const query = searchParams.get('query');
  const latParam = searchParams.get('lat');
  const lngParam = searchParams.get('lng');
  const key = process.env.KAKAO_REST_API_KEY ?? '';

  let lat: number;
  let lng: number;
  let placeName: string | undefined;
  let inputAddress: string | null = null;

  if (query) {
    inputAddress = query;
    if (!key) {
      return NextResponse.json({ error: 'API 키 미설정' }, { status: 500 });
    }
    const geo = await geocode(query, key);
    if (!geo) {
      return NextResponse.json({ error: '주소를 찾을 수 없습니다.' }, { status: 404 });
    }
    lat = geo.lat;
    lng = geo.lng;
    placeName = geo.placeName;
  } else if (latParam && lngParam) {
    lat = parseFloat(latParam);
    lng = parseFloat(lngParam);
    if (isNaN(lat) || isNaN(lng)) {
      return NextResponse.json({ error: '좌표 형식이 잘못되었습니다.' }, { status: 400 });
    }
  } else {
    return NextResponse.json({ error: '주소 또는 좌표가 필요합니다.' }, { status: 400 });
  }

  const roadResult = analyzeRoad(lat, lng);

  // 검색어가 고속도로 시설(IC/JC/TG 등)이면 500m 내 고속국도 후보를 우선 추천
  // (지오코딩 핀이 램프 인근에 찍혀 국도·지방도가 더 가까운 경우 보정)
  const HW_FACILITY = /(IC|JC|JCT|TG|나들목|분기점|영업소|톨게이트|휴게소)\s*$/i;
  if (query && HW_FACILITY.test(query.trim()) && roadResult.recommendation?.roadType !== '고속국도') {
    const hw = roadResult.candidates.find(c => c.type === '고속국도');
    if (hw) {
      roadResult.recommendation = {
        agency: hw.agency,
        agencyFull: hw.agencyFull,
        roadType: hw.type,
        routeName: hw.routeName,
        confidence: '보통',
        reason: `검색어가 고속도로 시설이므로 ${hw.distanceM}m 거리의 고속국도(${hw.routeName})를 우선 추천`,
        distanceM: hw.distanceM,
      };
    }
  }

  const rec = roadResult.recommendation;

  // 백그라운드 로그 저장 (nolog=1 이면 생략 — 자동 테스트용)
  if (!searchParams.get('nolog')) supabase.from('query_logs').insert({
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

  return NextResponse.json({ lat, lng, placeName, ...roadResult });
}
