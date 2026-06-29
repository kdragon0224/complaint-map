/**
 * CSV 전처리 스크립트
 * 실행: node scripts/preprocess-csv.mjs
 *
 * 출력:
 *   public/data/highway-nodes.json       - 고속도로 IC/JC 이정 정보 (소형)
 *   public/data/national-road-grid.json  - 국도 관리주체 그리드 인덱스
 *   public/data/highway-grid.json        - 고속도로 중심선 그리드 인덱스
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'public', 'data');
const SRC_DIR = path.join(__dirname, '../../참고자료/자료');

// 그리드 셀 크기: 0.1도 ≈ 약 11km
const GRID_SIZE = 0.1;

function gridKey(lat, lng) {
  const r = (v) => Math.floor(v / GRID_SIZE) * GRID_SIZE;
  return `${r(lat).toFixed(1)}_${r(lng).toFixed(1)}`;
}

function parseCSV(text) {
  const lines = text.trim().split('\n');
  const headers = lines[0].replace(/^﻿/, '').split(',').map(h => h.trim());
  return lines.slice(1).map(line => {
    const vals = line.split(',');
    const obj = {};
    headers.forEach((h, i) => { obj[h] = (vals[i] || '').trim(); });
    return obj;
  });
}

function toUTF8(filePath) {
  // maxBuffer 100MB로 설정 (대용량 파일 대응)
  return execSync(`iconv -f EUC-KR -t UTF-8 "${filePath}"`, {
    maxBuffer: 100 * 1024 * 1024,
  }).toString();
}

// ── 1. 고속도로 IC/JC 이정 정보 (43KB, 그대로 JSON 변환) ──────────────
console.log('1/3 고속도로 노드 이정 정보 처리 중...');
const nodeCSV = toUTF8(path.join(SRC_DIR, '한국도로공사_노선별 노드 이정 정보_20250630.csv'));
const nodeRows = parseCSV(nodeCSV);

const highwayNodes = nodeRows.map(r => ({
  id: r['노드(ID)'],
  name: r['노드명'],          // 예: 구서IC, 동대구JC
  routeNo: r['노선번호'],
  routeName: r['도로명'],     // 예: 경부선
  typeCode: r['도로등급구분코드'],
  typeName: r['상세코드명'],  // 고속국도
  km: parseFloat(r['도로이정']) || 0,
}));

fs.writeFileSync(
  path.join(DATA_DIR, 'highway-nodes.json'),
  JSON.stringify(highwayNodes, null, 0)
);
console.log(`   → ${highwayNodes.length}개 노드 저장`);

// ── 2. 국도 중심선 그리드 인덱스 (1.3MB → 격자 분할) ─────────────────
console.log('2/3 국도 중심선 그리드 인덱싱 중...');
const natText = fs.readFileSync(
  path.join(SRC_DIR, '국도중심선_1km간격_전국.csv'), 'utf-8'
);
const natRows = parseCSV(natText);

const natGrid = {};
let natCount = 0;
for (const r of natRows) {
  const lat = parseFloat(r['위도']);
  const lng = parseFloat(r['경도']);
  if (!lat || !lng) continue;
  const key = gridKey(lat, lng);
  if (!natGrid[key]) natGrid[key] = [];
  natGrid[key].push({
    type: r['도로종류'],         // 일반국도
    routeNo: r['노선번호'],
    agency: r['관리기관'],       // 서울
    agencyFull: r['관리기관_풀네임'], // 서울지방국토관리청
    lat,
    lng,
  });
  natCount++;
}

fs.writeFileSync(
  path.join(DATA_DIR, 'national-road-grid.json'),
  JSON.stringify(natGrid, null, 0)
);
console.log(`   → ${natCount}개 포인트, ${Object.keys(natGrid).length}개 그리드 셀 저장`);

// ── 3. 고속도로 중심선 그리드 인덱스 (4.5MB → 격자 분할) ────────────
console.log('3/3 고속도로 중심선 그리드 인덱싱 중...');
const etcText = toUTF8(path.join(SRC_DIR, 'ETC_도로중심선_1년_1년_2025.csv'));
const etcRows = parseCSV(etcText);

const etcGrid = {};
let etcCount = 0;
for (const r of etcRows) {
  // X좌표값=위도, Y좌표값=경도 (WGS84)
  const lat = parseFloat(r['X좌표값']);
  const lng = parseFloat(r['Y좌표값']);
  if (!lat || !lng || lat < 33 || lat > 39 || lng < 124 || lng > 132) continue;
  const key = gridKey(lat, lng);
  if (!etcGrid[key]) etcGrid[key] = [];
  etcGrid[key].push({
    routeNo: r['노선번호'],
    routeName: r['도로명'],  // 경부선
    km: parseFloat(r['이정']) || 0,
    lat,
    lng,
  });
  etcCount++;
}

fs.writeFileSync(
  path.join(DATA_DIR, 'highway-grid.json'),
  JSON.stringify(etcGrid, null, 0)
);
console.log(`   → ${etcCount}개 포인트, ${Object.keys(etcGrid).length}개 그리드 셀 저장`);

// ── 메타 파일 ──────────────────────────────────────────────────────────
const meta = {
  generatedAt: new Date().toISOString(),
  gridSize: GRID_SIZE,
  counts: {
    highwayNodes: highwayNodes.length,
    nationalRoadPoints: natCount,
    highwayPoints: etcCount,
  }
};
fs.writeFileSync(path.join(DATA_DIR, 'meta.json'), JSON.stringify(meta, null, 2));

console.log('\n✅ 전처리 완료');
console.log(JSON.stringify(meta.counts, null, 2));
