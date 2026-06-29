import { NextRequest, NextResponse } from 'next/server';

// 고속도로 관련 키워드 — 이 단어가 place_name에 포함되면 우선순위 상승
const HIGHWAY_KEYWORDS = [
  'IC', 'JC', '인터체인지', '분기점', '휴게소', 'SA',
  '한국도로공사', '도로공사', '고속도로',
];

function highwayScore(doc: any): number {
  const name: string = (doc.place_name || doc.address_name || '').toUpperCase();
  const category: string = (doc.category_name || '').toUpperCase();
  for (const kw of HIGHWAY_KEYWORDS) {
    if (name.includes(kw.toUpperCase()) || category.includes(kw.toUpperCase())) return 1;
  }
  return 0;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const query = searchParams.get('query');

  if (!query) {
    return NextResponse.json({ error: '주소가 필요합니다.' }, { status: 400 });
  }

  const key = process.env.KAKAO_REST_API_KEY;
  if (!key || key === 'YOUR_KAKAO_REST_KEY') {
    return NextResponse.json({
      documents: [{ address_name: query, x: '126.9784', y: '37.5665' }]
    });
  }

  const headers = { Authorization: `KakaoAK ${key}` };
  const q = encodeURIComponent(query);

  // 1차: 주소 검색 (도로명/지번) — 숫자 포함 주소는 그대로 사용
  const addrRes = await fetch(
    `https://dapi.kakao.com/v2/local/search/address.json?query=${q}`,
    { headers }
  );
  const addrData = await addrRes.json();
  if (addrData.documents?.length > 0) {
    return NextResponse.json(addrData);
  }

  // 2차: 키워드 검색 — 여러 페이지 수집 후 고속도로 시설 우선 정렬
  const [page1, page2] = await Promise.all([
    fetch(`https://dapi.kakao.com/v2/local/search/keyword.json?query=${q}&size=10&page=1`, { headers })
      .then(r => r.json()),
    fetch(`https://dapi.kakao.com/v2/local/search/keyword.json?query=${q}&size=10&page=2`, { headers })
      .then(r => r.json()),
  ]);

  const combined: any[] = [
    ...(page1.documents || []),
    ...(page2.documents || []),
  ];

  if (combined.length === 0) {
    return NextResponse.json({ documents: [], meta: { total_count: 0 } });
  }

  // 고속도로 시설 우선, 같은 그룹 내에서는 원래 순서(카카오 관련도 순) 유지
  const sorted = [...combined].sort((a, b) => highwayScore(b) - highwayScore(a));

  const mapped = sorted.map((d: any) => ({
    address_name: d.address_name,
    place_name: d.place_name,
    x: d.x,
    y: d.y,
  }));

  return NextResponse.json({ documents: mapped, meta: page1.meta });
}
