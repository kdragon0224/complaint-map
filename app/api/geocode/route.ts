import { NextRequest, NextResponse } from 'next/server';

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

  // 주소검색 + 키워드검색 동시 실행
  const [addrData, kwData] = await Promise.all([
    fetch(`https://dapi.kakao.com/v2/local/search/address.json?query=${q}`, { headers })
      .then(r => r.json()).catch(() => ({ documents: [] })),
    fetch(`https://dapi.kakao.com/v2/local/search/keyword.json?query=${q}&size=15`, { headers })
      .then(r => r.json()).catch(() => ({ documents: [] })),
  ]);

  // 주소 결과가 있으면 바로 반환 (숫자 포함 주소는 정확도 높음)
  if (addrData.documents?.length > 0) {
    return NextResponse.json(addrData);
  }

  const docs: any[] = kwData.documents || [];
  if (docs.length === 0) {
    return NextResponse.json({ documents: [], meta: { total_count: 0 } });
  }

  // 고속도로 시설 우선 정렬
  const sorted = [...docs].sort((a, b) => highwayScore(b) - highwayScore(a));

  return NextResponse.json({
    documents: sorted.map((d: any) => ({
      address_name: d.address_name,
      place_name: d.place_name,
      x: d.x,
      y: d.y,
    })),
    meta: kwData.meta,
  });
}
