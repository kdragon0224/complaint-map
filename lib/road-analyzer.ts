/**
 * 도로 분석 및 관리주체 추천 엔진 (서버 사이드 전용)
 *
 * 데이터 파일 키 약어 (압축 포맷):
 *   highway-grid.json:         r=routeNo, n=routeName, k=km, a=lat, o=lng
 *   national-road-grid.json:   r=routeNo, g=agency,    f=agencyFull, a=lat, o=lng
 *   provincial-road-grid.json: r=노선번호(숫자), g=도 인덱스(PROVINCES), a=lat, o=lng
 */

import fs from 'fs';
import path from 'path';
import { formatAgency } from './highway-jurisdiction';

const DATA_DIR = path.join(process.cwd(), 'public', 'data');
const GRID_SIZE = 0.1;
const SEARCH_RADIUS_M = 500;
const HIGHWAY_PRIORITY_THRESHOLD_M = 200; // 고속도로가 이 거리 이내면 국도 탐색 생략

// ── 타입 ────────────────────────────────────────────────────────────────

export interface RoadCandidate {
  type: '고속국도' | '일반국도' | '지방도' | '기타';
  routeNo: string;
  routeName: string;
  agency: string;
  agencyFull: string;
  distanceM: number;
  km?: number;
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

type HwPoint   = { r: string; n: string; k: number; a: number; o: number };
type NatPoint  = { r: string; g: string; f: string; a: number; o: number };
type ProvPoint = { r: number; g: number; a: number; o: number };
type HwGrid    = Record<string, HwPoint[]>;
type NatGrid   = Record<string, NatPoint[]>;
type ProvGrid  = Record<string, ProvPoint[]>;
type NodePoint = Record<string, string | number>;

// 지방도 관리 광역시·도 (provincial-road-grid.json 의 g 인덱스와 대응)
const PROVINCES = [
  '관할 시·도', '경기도', '강원특별자치도', '충청북도', '충청남도',
  '전북특별자치도', '전라남도', '경상북도', '경상남도', '제주특별자치도',
];

let _hwGrid:   HwGrid   | null = null;
let _natGrid:  NatGrid  | null = null;
let _provGrid: ProvGrid | null = null;
let _hwNodes:  NodePoint[] | null = null;

function loadHwGrid(): HwGrid {
  if (!_hwGrid) _hwGrid = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'highway-grid.json'), 'utf-8'));
  return _hwGrid!;
}

function loadNatGrid(): NatGrid {
  if (!_natGrid) _natGrid = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'national-road-grid.json'), 'utf-8'));
  return _natGrid!;
}

function loadProvGrid(): ProvGrid {
  if (!_provGrid) _provGrid = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'provincial-road-grid.json'), 'utf-8'));
  return _provGrid!;
}

function loadHwNodes(): NodePoint[] {
  if (!_hwNodes) _hwNodes = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'highway-nodes.json'), 'utf-8'));
  return _hwNodes!;
}

// ── 고속도로 탐색 ────────────────────────────────────────────────────────

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

// ── 국도 탐색 (고속도로 미발견 또는 200m 초과 시에만 실행) ───────────────

function findNearbyNationalRoads(lat: number, lng: number): RoadCandidate[] {
  const grid = loadNatGrid();
  const keys = neighborKeys(lat, lng);
  const results: RoadCandidate[] = [];
  const seen = new Set<string>();

  for (const key of keys) {
    for (const p of grid[key] ?? []) {
      const dist = haversineM(lat, lng, p.a, p.o);
      if (dist > SEARCH_RADIUS_M) continue;
      const uid = p.r;
      if (seen.has(uid)) continue;
      seen.add(uid);
      results.push({
        type: '일반국도',
        routeNo: p.r,
        routeName: `국도 ${p.r}호선`,
        agency: p.g,
        agencyFull: p.f,
        distanceM: Math.round(dist),
      });
    }
  }

  return results.sort((a, b) => a.distanceM - b.distanceM);
}

// ── 지방도 탐색 (고속도로·국도 모두 200m 초과 시에만 실행) ───────────────

function findNearbyProvincialRoads(lat: number, lng: number): RoadCandidate[] {
  const grid = loadProvGrid();
  const keys = neighborKeys(lat, lng);
  const results: RoadCandidate[] = [];
  const seen = new Set<number>();
  const best: Record<number, { dist: number; g: number }> = {};

  for (const key of keys) {
    for (const p of grid[key] ?? []) {
      const dist = haversineM(lat, lng, p.a, p.o);
      if (dist > SEARCH_RADIUS_M) continue;
      if (!(p.r in best) || dist < best[p.r].dist) {
        best[p.r] = { dist, g: p.g };
      }
    }
  }

  for (const [noStr, { dist, g }] of Object.entries(best)) {
    const no = Number(noStr);
    if (seen.has(no)) continue;
    seen.add(no);
    const routeName = no < 100 ? `국가지원지방도 ${no}호선` : `지방도 ${no}호선`;
    const agency = PROVINCES[g] ?? '관할 시·도';
    results.push({
      type: '지방도',
      routeNo: String(no),
      routeName,
      agency,
      agencyFull: agency === '관할 시·도' ? '관할 시·도 (도로관리부서)' : `${agency} (도로관리부서)`,
      distanceM: Math.round(dist),
    });
  }

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

  // 가까운 고속도로가 있으면 국도 탐색 생략 (JSON 파싱 회피)
  const skipNational = highways.length > 0 && highways[0].distanceM <= HIGHWAY_PRIORITY_THRESHOLD_M;
  const nationalRoads = skipNational ? [] : findNearbyNationalRoads(lat, lng);

  // 고속도로·국도가 모두 멀 때만 지방도 탐색
  const nearest = Math.min(
    highways[0]?.distanceM ?? Infinity,
    nationalRoads[0]?.distanceM ?? Infinity,
  );
  const provincialRoads = nearest <= HIGHWAY_PRIORITY_THRESHOLD_M ? [] : findNearbyProvincialRoads(lat, lng);

  const all = [...highways, ...nationalRoads, ...provincialRoads].sort((a, b) => a.distanceM - b.distanceM);

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
