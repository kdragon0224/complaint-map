// 지역별 통계 지도(components/RegionStatsMap.tsx)와 /stats 순위 목록이 함께 쓰는 권역 매핑.
// 특별시·광역시는 지도에서 소재지가 속한 도에 합산한다.
// 대전·세종은 충남·충북 사이에 있어 판단이 갈리지만, 둘 다 충남에서 분리된 곳이라 충남으로 묶었다.
// 카카오가 광주·전남을 "전남광주통합특별시" 하나로 반환하므로(lib/road-rules.ts의 행정구역 통합 대응과 동일)
// 그 값과 옛 이름(광주광역시)도 전남으로 합친다.
export const PROVINCE_OF: Record<string, string> = {
  '서울특별시': '경기도',
  '인천광역시': '경기도',
  '대전광역시': '충청남도',
  '세종특별자치시': '충청남도',
  '대구광역시': '경상북도',
  '부산광역시': '경상남도',
  '울산광역시': '경상남도',
  '광주광역시': '전라남도',
  '전남광주통합특별시': '전라남도',
};

export function provinceOf(sido: string): string {
  return PROVINCE_OF[sido] ?? sido;
}
