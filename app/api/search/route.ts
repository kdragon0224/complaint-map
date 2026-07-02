import { NextRequest, NextResponse } from 'next/server';
import { analyzeRoad } from '@/lib/road-analyzer';
import {
  RegionInfo,
  resolveNationalRoad,
  resolveProvincialRoad,
  resolveArterial,
  resolveFallback,
} from '@/lib/road-rules';
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

/** 좌표 → 행정구역 (시도/시군구/동) — 도로법 규칙 판정용 */
async function fetchRegion(lat: number, lng: number, key: string): Promise<RegionInfo | null> {
  try {
    const res = await fetch(
      `https://dapi.kakao.com/v2/local/geo/coord2regioncode.json?x=${lng}&y=${lat}`,
      { headers: { Authorization: `KakaoAK ${key}` } },
    );
    const data = await res.json();
    // B(법정동) 우선, 없으면 H(행정동)
    const doc = (data.documents ?? []).find((d: any) => d.region_type === 'B') ?? data.documents?.[0];
    if (!doc) return null;
    return {
      sido: doc.region_1depth_name ?? '',
      sigungu: doc.region_2depth_name ?? '',
      dong: doc.region_3depth_name ?? '',
    };
  } catch {
    return null;
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

  // ── 관리주체 확정 (고속국도 외 — 도로법 규칙 엔진) ─────────────────
  // 고속국도가 아니거나 결과가 없으면 행정구역을 조회해 규칙으로 판정
  const needsRegion =
    !roadResult.recommendation ||
    roadResult.candidates.some(c => c.type !== '고속국도' && !c.agencyFull);

  if (needsRegion && key) {
    const region = await fetchRegion(lat, lng, key);
    if (region) {
      for (const c of roadResult.candidates) {
        if (c.agencyFull) continue;
        if (c.osmClass === 'n') {
          c.agencyFull = resolveNationalRoad(region);
        } else if (c.osmClass === 'p') {
          c.agencyFull = resolveProvincialRoad(region);
        } else if (c.osmClass === 'x') {
          const r = resolveArterial(c.roadName ?? c.routeName, region);
          c.agencyFull = r.agency;
          if (r.isUrbanExpressway) c.type = '도시고속화도로';
        }
        c.agency = c.agencyFull;
      }
      // 추천도 갱신 (top 후보 기준)
      const top = roadResult.candidates[0];
      if (roadResult.recommendation && top && roadResult.recommendation.roadType !== '고속국도') {
        roadResult.recommendation.agency = top.agency;
        roadResult.recommendation.agencyFull = top.agencyFull;
        roadResult.recommendation.roadType = top.type;
        roadResult.recommendation.routeName = top.routeName;
      }
      // 인식된 도로가 없으면 시군구 폴백 — "정보 없음" 제거
      if (!roadResult.recommendation) {
        roadResult.recommendation = {
          agency: resolveFallback(region),
          agencyFull: resolveFallback(region),
          roadType: '시군도',
          routeName: `${region.sigungu} 관내 도로`,
          confidence: '낮음',
          reason: '주변 500m 내 인식된 간선도로가 없어 관할 지자체를 안내',
          distanceM: 0,
        };
      }
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
