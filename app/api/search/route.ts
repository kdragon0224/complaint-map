import { NextRequest, NextResponse } from 'next/server';
import { analyzeRoad } from '@/lib/road-analyzer';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// 기관별 전화번호·주소 캐시 (프로세스 재시작 전까지 유지, ~30개 기관으로 충분)
const placeCache = new Map<string, { phone: string | null; address: string | null }>();

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

async function fetchPlaceInfo(
  agencyFull: string,
  key: string,
): Promise<{ phone: string | null; address: string | null }> {
  if (placeCache.has(agencyFull)) return placeCache.get(agencyFull)!;
  try {
    const res = await fetch(
      `https://dapi.kakao.com/v2/local/search/keyword.json?query=${encodeURIComponent(agencyFull)}&size=1`,
      { headers: { Authorization: `KakaoAK ${key}` } },
    );
    const data = await res.json();
    const place = data.documents?.[0];
    const result = {
      phone: place?.phone || null,
      address: place?.road_address_name || place?.address_name || null,
    };
    placeCache.set(agencyFull, result);
    return result;
  } catch {
    return { phone: null, address: null };
  }
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
  const rec = roadResult.recommendation;

  // 도로 분석 + 전화번호 조회 결과를 함께 반환 (이미 analyzeRoad는 동기)
  const placeInfo = rec?.agencyFull && key
    ? await fetchPlaceInfo(rec.agencyFull, key)
    : { phone: null, address: null };

  // 백그라운드 로그 저장
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

  return NextResponse.json({
    lat,
    lng,
    placeName,
    ...roadResult,
    agencyPhone: placeInfo.phone,
    agencyAddress: placeInfo.address,
  });
}
