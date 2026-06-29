import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const query = searchParams.get('query');

  if (!query) {
    return NextResponse.json({ error: '주소가 필요합니다.' }, { status: 400 });
  }

  const key = process.env.KAKAO_REST_API_KEY;
  if (!key || key === 'YOUR_KAKAO_REST_KEY') {
    // API 키 미설정 시 더미 응답 (개발용)
    return NextResponse.json({
      documents: [
        { address_name: query, x: '126.9784', y: '37.5665' }
      ]
    });
  }

  const headers = { Authorization: `KakaoAK ${key}` };
  const q = encodeURIComponent(query);

  // 1차: 주소 검색 (도로명/지번)
  const addrRes = await fetch(
    `https://dapi.kakao.com/v2/local/search/address.json?query=${q}`,
    { headers }
  );
  const addrData = await addrRes.json();
  if (addrData.documents?.length > 0) {
    return NextResponse.json(addrData);
  }

  // 2차: 키워드 검색 (장소명 - 시청, IC, JC 등)
  const kwRes = await fetch(
    `https://dapi.kakao.com/v2/local/search/keyword.json?query=${q}`,
    { headers }
  );
  const kwData = await kwRes.json();
  // 키워드 결과를 주소 검색 형식으로 변환
  if (kwData.documents?.length > 0) {
    const mapped = kwData.documents.map((d: any) => ({
      address_name: d.address_name,
      place_name: d.place_name,
      x: d.x,
      y: d.y,
    }));
    return NextResponse.json({ documents: mapped, meta: kwData.meta });
  }

  return NextResponse.json({ documents: [], meta: { total_count: 0 } });
}
