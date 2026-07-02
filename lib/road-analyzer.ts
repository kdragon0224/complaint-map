/**
 * 도로 분석 및 관리주체 추천 엔진 (서버 사이드 전용)
 *
 * 데이터 파일 키 약어 (압축 포맷):
 *   highway-grid.json:  r=ETC코드, n=노선명, k=km, a=lat, o=lng  — 고속국도 (직제 기반, 현행 유지)
 *   osm-road-grid.json: c=등급('n'국도|'p'지방도|'x'주요간선), r=노선번호(0=없음), n=도로명, a=lat, o=lng
 *
 * 관리주체 판정:
 *   - 고속국도: highway-jurisdiction.ts (직제세부운영계획 + 민자 운영사)
 *   - 그 외: 행정구역이 필요하므로 agency를 비워서 반환 → route.ts에서
 *     road-rules.ts 규칙 엔진으로 확정
 */

import fs from 'fs';
import path from 'path';
import { formatAgency } from './highway-jurisdiction';

const DATA_DIR = path.join(process.cwd(), 'public', 'data');
const GRID_SIZE = 0.1;
const SEARCH_RADIUS_M = 500;
const HIGHWAY_PRIORITY_THRESHOLD_M = 200; // 고속도로가 이 거리 이내면 OSM 탐색 생략

// ── 타입 ────────────────────────────────────────────────────────────────

export type RoadType = '고속국도' | '일반국도' | '지방도' | '도시고속화도로' | '시군도' | '기타';

export interface RoadCandidate {
  type: RoadType;
  routeNo: string;
  routeName: string;
  agency: string;      // 고속국도만 채워짐. 나머지는 route.ts에서 규칙 엔진으로 확정
  agencyFull: string;
  distanceM: number;
  km?: number;
  osmClass?: 'n' | 'p' | 'x';
  roadName?: string;   // OSM 도로명 (표시 보조)
}

export interface AnalysisResult {
  candidates: RoadCandidate[];
  recommendation: {
    agency: string;
    agencyFull: string;
    roadType: string;
    routeName: string;
    confidence: '높음' | '보통' | '낮음';
    reason: string;
    distanceM: number;
  } | null;
  altCandidates: RoadCandidate[];
}

// ── 유틸 ────────────────────────────────────────────────────────────────

function haversineM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function gridKey(lat: number, lng: number) {
  const r = (v: number) => Math.floor(v / GRID_SIZE) * GRID_SIZE;
  return `${r(lat).toFixed(1)}_${r(lng).toFixed(1)}`;
}

function neighborKeys(lat: number, lng: number): string[] {
  const keys: string[] = [];
  for (let dLat = -1; dLat <= 1; dLat++) {
    for (let dLng = -1; dLng <= 1; dLng++) {
      keys.push(gridKey(lat + dLat * GRID_SIZE, lng + dLng * GRID_SIZE));
    }
  }
  return [...new Set(keys)];
}

// ── 그리드 로더 (모듈 캐시 — 프로세스 재시작 전까지 유지) ─────────────

type HwPoint  = { r: string; n: string; k: number; a: number; o: number };
type OsmPoint = { c: 'n' | 'p' | 'x'; r: number; n: string; a: number; o: number };
type HwGrid   = Record<string, HwPoint[]>;
type OsmGrid  = Record<string, OsmPoint[]>;
type NodePoint = Record<string, string | number>;

let _hwGrid:  HwGrid  | null = null;
let _osmGrid: OsmGrid | null = null;
let _hwNodes: NodePoint[] | null = null;

function loadHwGrid(): HwGrid {
  if (!_hwGrid) _hwGrid = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'highway-grid.json'), 'utf-8'));
  return _hwGrid!;
}

function loadOsmGrid(): OsmGrid {
  if (!_osmGrid) _osmGrid = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'osm-road-grid.json'), 'utf-8'));
  return _osmGrid!;
}

function loadHwNodes(): NodePoint[] {
  if (!_hwNodes) _hwNodes = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'highway-nodes.json'), 'utf-8'));
  return _hwNodes!;
}

// ── 고속도로 탐색 (직제 기반 — 현행 유지) ────────────────────────────────

function findNearbyHighways(lat: number, lng: number): RoadCandidate[] {
  const grid = loadHwGrid();
  const nodes = loadHwNodes();
  const keys = neighborKeys(lat, lng);

  const nearPoints: { r: string; n: string; k: number; dist: number }[] = [];

  for (const key of keys) {
    for (const p of grid[key] ?? []) {
      const dist = haversineM(lat, lng, p.a, p.o);
      if (dist <= SEARCH_RADIUS_M) nearPoints.push({ r: p.r, n: p.n, k: p.k, dist });
    }
  }

  if (nearPoints.length === 0) return [];
  nearPoints.sort((a, b) => a.dist - b.dist);

  const results: RoadCandidate[] = [];
  const seen = new Set<string>();

  for (const pt of nearPoints) {
    if (seen.has(pt.r)) continue;
    seen.add(pt.r);

    const routeNodes = nodes.filter(n => n.routeNo === parseInt(pt.r).toString());
    const prevNode = routeNodes
      .filter(n => (n.km as number) <= pt.k)
      .sort((a, b) => (b.km as number) - (a.km as number))[0];

    const fallbackIc = prevNode ? String(prevNode.name) : undefined;
    const agency = formatAgency(pt.r, pt.k, fallbackIc);

    results.push({
      type: '고속국도',
      routeNo: pt.r,
      routeName: `${pt.n} (${pt.k.toFixed(1)}km)`,
      agency,
      agencyFull: agency,
      distanceM: Math.round(pt.dist),
      km: pt.k,
    });
  }

  return results;
}

// ── OSM 도로 탐색 (국도·지방도·주요간선 — 고속도로 200m 초과 시에만) ─────

function findNearbyOsmRoads(lat: number, lng: number): RoadCandidate[] {
  const grid = loadOsmGrid();
  const keys = neighborKeys(lat, lng);

  // 등급+번호+이름별 최근접 포인트
  const best: Record<string, { p: OsmPoint; dist: number }> = {};
  for (const key of keys) {
    for (const p of grid[key] ?? []) {
      const dist = haversineM(lat, lng, p.a, p.o);
      if (dist > SEARCH_RADIUS_M) continue;
      const uid = `${p.c}_${p.r}_${p.n}`;
      if (!(uid in best) || dist < best[uid].dist) best[uid] = { p, dist };
    }
  }

  const results: RoadCandidate[] = [];
  for (const { p, dist } of Object.values(best)) {
    if (p.c === 'n') {
      results.push({
        type: '일반국도',
        routeNo: String(p.r),
        routeName: `국도 ${p.r}호선${p.n ? ` (${p.n})` : ''}`,
        agency: '', agencyFull: '',
        distanceM: Math.round(dist),
        osmClass: 'n', roadName: p.n,
      });
    } else if (p.c === 'p') {
      const nm = p.r < 100 ? `국가지원지방도 ${p.r}호선` : `지방도 ${p.r}호선`;
      results.push({
        type: '지방도',
        routeNo: String(p.r),
        routeName: `${nm}${p.n ? ` (${p.n})` : ''}`,
        agency: '', agencyFull: '',
        distanceM: Math.round(dist),
        osmClass: 'p', roadName: p.n,
      });
    } else {
      results.push({
        type: '시군도', // route.ts에서 도시고속화도로 테이블 매칭 시 승격
        routeNo: '',
        routeName: p.n,
        agency: '', agencyFull: '',
        distanceM: Math.round(dist),
        osmClass: 'x', roadName: p.n,
      });
    }
  }

  // 같은 도로가 국도·지방도 중복 표기된 경우 가까운 것만 유지하도록 정렬
  return results.sort((a, b) => a.distanceM - b.distanceM);
}

// ── 신뢰도 계산 ──────────────────────────────────────────────────────────

function calcConfidence(
  top: RoadCandidate,
  candidates: RoadCandidate[],
): '높음' | '보통' | '낮음' {
  if (top.distanceM > 300) return '낮음';
  if (candidates.length >= 3 && candidates[1].distanceM < top.distanceM + 100) return '보통';
  if (top.distanceM <= 100) return '높음';
  return '보통';
}

// ── 메인 분석 함수 ───────────────────────────────────────────────────────

export function analyzeRoad(lat: number, lng: number): AnalysisResult {
  const highways = findNearbyHighways(lat, lng);

  // 가까운 고속도로가 있으면 OSM 탐색 생략 (7MB 파싱 회피)
  const skipOsm = highways.length > 0 && highways[0].distanceM <= HIGHWAY_PRIORITY_THRESHOLD_M;
  const osmRoads = skipOsm ? [] : findNearbyOsmRoads(lat, lng);

  const all = [...highways, ...osmRoads].sort((a, b) => a.distanceM - b.distanceM);

  if (all.length === 0) {
    return { candidates: [], recommendation: null, altCandidates: [] };
  }

  const top = all[0];
  const confidence = calcConfidence(top, all);

  return {
    candidates: all.slice(0, 5),
    recommendation: {
      agency: top.agency,
      agencyFull: top.agencyFull,
      roadType: top.type,
      routeName: top.routeName,
      confidence,
      reason: `민원 위치에서 ${top.distanceM}m 거리의 ${top.type}(${top.routeName})을 기준으로 추천`,
      distanceM: top.distanceM,
    },
    altCandidates: all.slice(1, 3),
  };
}
