/**
 * 도로 분석 및 관리주체 추천 엔진
 * 서버 사이드에서만 실행 (그리드 JSON 파일 읽기)
 */

import fs from 'fs';
import path from 'path';
import { formatAgency } from './highway-jurisdiction';

const DATA_DIR = path.join(process.cwd(), 'public', 'data');
const GRID_SIZE = 0.1;
const SEARCH_RADIUS_M = 500; // 탐색 반경 500m

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

// ── 그리드 로더 (모듈 캐시로 재사용) ──────────────────────────────────

type GridPoint = Record<string, string | number>;
type Grid = Record<string, GridPoint[]>;

let _natGrid: Grid | null = null;
let _hwGrid: Grid | null = null;
let _hwNodes: GridPoint[] | null = null;

function loadNatGrid(): Grid {
  if (!_natGrid) {
    _natGrid = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'national-road-grid.json'), 'utf-8'));
  }
  return _natGrid!;
}

function loadHwGrid(): Grid {
  if (!_hwGrid) {
    _hwGrid = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'highway-grid.json'), 'utf-8'));
  }
  return _hwGrid!;
}

function loadHwNodes(): GridPoint[] {
  if (!_hwNodes) {
    _hwNodes = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'highway-nodes.json'), 'utf-8'));
  }
  return _hwNodes!;
}

// ── 주변 도로 탐색 ──────────────────────────────────────────────────────

function findNearbyNationalRoads(lat: number, lng: number): RoadCandidate[] {
  const grid = loadNatGrid();
  const keys = neighborKeys(lat, lng);
  const results: RoadCandidate[] = [];
  const seen = new Set<string>();

  for (const key of keys) {
    const points = grid[key] || [];
    for (const p of points) {
      const dist = haversineM(lat, lng, p.lat as number, p.lng as number);
      if (dist > SEARCH_RADIUS_M) continue;
      // 같은 노선의 가장 가까운 포인트만
      const uid = `${p.type}_${p.routeNo}`;
      if (seen.has(uid)) continue;
      seen.add(uid);
      results.push({
        type: '일반국도',
        routeNo: String(p.routeNo),
        routeName: `국도 ${p.routeNo}호선`,
        agency: String(p.agency),
        agencyFull: String(p.agencyFull),
        distanceM: Math.round(dist),
      });
    }
  }

  return results.sort((a, b) => a.distanceM - b.distanceM);
}

function findNearbyHighways(lat: number, lng: number): RoadCandidate[] {
  const grid = loadHwGrid();
  const nodes = loadHwNodes();
  const keys = neighborKeys(lat, lng);
  const results: RoadCandidate[] = [];
  const seen = new Set<string>();

  // 중심선 포인트에서 가장 가까운 구간 탐색
  const nearPoints: { routeNo: string; routeName: string; km: number; dist: number }[] = [];
  for (const key of keys) {
    const points = grid[key] || [];
    for (const p of points) {
      const dist = haversineM(lat, lng, p.lat as number, p.lng as number);
      if (dist > SEARCH_RADIUS_M) continue;
      nearPoints.push({
        routeNo: String(p.routeNo),
        routeName: String(p.routeName),
        km: p.km as number,
        dist,
      });
    }
  }
  if (nearPoints.length === 0) return [];

  nearPoints.sort((a, b) => a.dist - b.dist);

  for (const pt of nearPoints) {
    const uid = pt.routeNo;
    if (seen.has(uid)) continue;
    seen.add(uid);

    // 이정(km)에 해당하는 담당 지사 찾기 (jurisdiction 테이블 우선)
    const routeNodes = nodes.filter(
      (n) => n.routeNo === parseInt(pt.routeNo).toString()
    );
    const prevNode = routeNodes
      .filter((n) => (n.km as number) <= pt.km)
      .sort((a, b) => (b.km as number) - (a.km as number))[0];

    const fallbackIc = prevNode ? String(prevNode.name) : undefined;
    const agency = formatAgency(pt.routeNo, pt.km, fallbackIc);

    results.push({
      type: '고속국도',
      routeNo: pt.routeNo,
      routeName: `${pt.routeName} (${pt.km.toFixed(1)}km)`,
      agency,
      agencyFull: agency,
      distanceM: Math.round(pt.dist),
      km: pt.km,
    });
  }

  return results;
}

// ── 신뢰도 계산 ─────────────────────────────────────────────────────────

function calcConfidence(
  top: RoadCandidate,
  candidates: RoadCandidate[]
): '높음' | '보통' | '낮음' {
  if (top.distanceM > 300) return '낮음';
  if (candidates.length >= 3 && candidates[1].distanceM < top.distanceM + 100) return '보통';
  if (top.distanceM <= 100) return '높음';
  return '보통';
}

// ── 메인 분석 함수 ──────────────────────────────────────────────────────

export function analyzeRoad(lat: number, lng: number): AnalysisResult {
  const highways = findNearbyHighways(lat, lng);
  const nationalRoads = findNearbyNationalRoads(lat, lng);

  // 고속국도 우선, 그다음 국도
  const all = [...highways, ...nationalRoads].sort(
    (a, b) => a.distanceM - b.distanceM
  );

  if (all.length === 0) {
    return {
      candidates: [],
      recommendation: null,
      altCandidates: [],
    };
  }

  const top = all[0];
  const confidence = calcConfidence(top, all);

  const reason =
    `민원 위치에서 ${top.distanceM}m 거리의 ` +
    `${top.type}(${top.routeName})을 기준으로 추천`;

  return {
    candidates: all.slice(0, 5),
    recommendation: {
      agency: top.agency,
      agencyFull: top.agencyFull,
      roadType: top.type,
      routeName: top.routeName,
      confidence,
      reason,
      distanceM: top.distanceM,
    },
    altCandidates: all.slice(1, 3),
  };
}
