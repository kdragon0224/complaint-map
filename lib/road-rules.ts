/**
 * 도로법 기반 관리주체 판정 규칙 엔진
 *
 * 도로법 제23조(도로관리청):
 *   - 고속국도: 국토교통부 → 한국도로공사 위임 (직제) / 민자: 운영사
 *   - 일반국도: 지방국토관리청. 단, 특별시·광역시·특별자치시 구간과
 *     시(市) 관할구역의 동(洞) 지역 구간은 해당 시장이 관리
 *   - 지방도: 도지사. 단, 시 관할구역의 동 지역 구간은 해당 시장
 *   - 시도·군도·구도: 해당 지자체장
 */

export interface RegionInfo {
  sido: string;     // 예: 전북특별자치도, 서울특별시
  sigungu: string;  // 예: 전주시 덕진구, 서초구
  dong: string;     // 예: 도도동, 내곡동, 봉동읍
}

// ── 지방국토관리청 관할 (일반국도, 도 지역 구간) ─────────────────────────
const RRO_BY_SIDO: Record<string, string> = {
  '서울특별시': '서울지방국토관리청',
  '인천광역시': '서울지방국토관리청',
  '경기도': '서울지방국토관리청',
  '강원특별자치도': '원주지방국토관리청',
  '강원도': '원주지방국토관리청',
  '대전광역시': '대전지방국토관리청',
  '세종특별자치시': '대전지방국토관리청',
  '충청북도': '대전지방국토관리청',
  '충청남도': '대전지방국토관리청',
  '전북특별자치도': '익산지방국토관리청',
  '전라북도': '익산지방국토관리청',
  '광주광역시': '익산지방국토관리청',
  '전라남도': '익산지방국토관리청',
  '부산광역시': '부산지방국토관리청',
  '대구광역시': '부산지방국토관리청',
  '울산광역시': '부산지방국토관리청',
  '경상북도': '부산지방국토관리청',
  '경상남도': '부산지방국토관리청',
  '제주특별자치도': '제주특별자치도',
};

// ── 도시고속화도로 → 관리기관 (시도|도로명 키) ───────────────────────────
const URBAN_EXPRESSWAYS: Record<string, string> = {
  '서울특별시|올림픽대로': '서울특별시 (서울시설공단)',
  '서울특별시|강변북로': '서울특별시 (서울시설공단)',
  '서울특별시|내부순환로': '서울특별시 (서울시설공단)',
  '서울특별시|동부간선로': '서울특별시 (서울시설공단)',
  '서울특별시|서부간선로': '서울특별시 (서울시설공단)',
  '서울특별시|서부간선도로': '서울특별시 (서울시설공단)',
  '서울특별시|북부간선로': '서울특별시 (서울시설공단)',
  '서울특별시|노들로': '서울특별시 (서울시설공단)',
  '서울특별시|경부간선도로': '서울특별시 (서울시설공단)',
  '서울특별시|서부간선지하도로': '서서울도시고속도로(주) (민자)',
  '서울특별시|분당내곡로': '서울특별시·성남시 (구간별 관리)',
  '서울특별시|분당수서로': '서울특별시·성남시 (구간별 관리)',
  '경기도|분당내곡로': '성남시 (분당~내곡 도시고속화도로)',
  '경기도|분당수서로': '성남시 (분당~수서 도시고속화도로)',
  '대구광역시|신천대로': '대구광역시 (대구공공시설관리공단)',
  '대구광역시|앞산순환로': '대구광역시',
  '부산광역시|동서고가로': '부산광역시 (부산시설공단)',
  '부산광역시|번영로': '부산광역시 (부산시설공단)',
  '부산광역시|관문대로': '부산광역시 (부산시설공단)',
  '부산광역시|광안대교': '부산광역시 (부산시설공단)',
  '부산광역시|을숙도대교': '부산울산고속도로(주) 외 (민자)',
  '인천광역시|인천대로': '인천광역시 (인천시설공단)',
  '대전광역시|갑천도시고속도로': '대전광역시 (대전시설관리공단)',
};

// ── 유틸 ────────────────────────────────────────────────────────────────

function isMetro(sido: string): boolean {
  return /특별시$|광역시$|특별자치시$/.test(sido);
}

/** 시(市) 지역의 동(洞) 구간 여부 — 시가 관리하는 국도·지방도 구간 */
function isCityDong(region: RegionInfo): boolean {
  const isCity = /시(\s|$)/.test(region.sigungu) || region.sigungu.endsWith('시');
  const isDong = region.dong.endsWith('동');
  return isCity && isDong;
}

/** 시군구에서 시·군 이름 추출 (예: "전주시 덕진구" → "전주시") */
function cityName(region: RegionInfo): string {
  if (isMetro(region.sido)) return region.sido;
  return region.sigungu.split(' ')[0] || region.sigungu;
}

// ── 판정 함수 ────────────────────────────────────────────────────────────

/** 일반국도 관리청 */
export function resolveNationalRoad(region: RegionInfo): string {
  if (isMetro(region.sido)) return `${region.sido} (시 관리 국도 구간)`;
  if (isCityDong(region)) return `${cityName(region)} (시 관리 국도 구간)`;
  return RRO_BY_SIDO[region.sido] ?? '지방국토관리청';
}

/** 지방도 관리청 */
export function resolveProvincialRoad(region: RegionInfo): string {
  if (isCityDong(region)) return `${cityName(region)} (시 관리 지방도 구간)`;
  return `${region.sido} (도로관리부서)`;
}

/** 주요 간선(무번호 trunk) — 도시고속화도로 테이블 매칭, 없으면 지자체 */
export function resolveArterial(name: string, region: RegionInfo): { agency: string; isUrbanExpressway: boolean } {
  const hit = URBAN_EXPRESSWAYS[`${region.sido}|${name}`];
  if (hit) return { agency: hit, isUrbanExpressway: true };
  return { agency: `${cityName(region)} 도로관리부서`, isUrbanExpressway: false };
}

/** 폴백 — 주변에 인식된 도로가 없을 때 */
export function resolveFallback(region: RegionInfo): string {
  return `${cityName(region)} 도로관리부서 (시군도 추정)`;
}
