'use client';

import { provinceOf, PROVINCE_OF } from '@/lib/sido-groups';
import { KOREA_MAP } from '@/lib/korea-map-paths';

// 경계선은 통계청 행정구역경계를 단순화한 것(lib/korea-map-paths.ts, scripts/build-korea-map.py로 생성).
// 특별시·광역시는 소재 도 영역에 합쳐져 있고, 제주는 지도에 그리지 않는다(제주 조회 기록은 지도에 표시하지 않음).

const SHORT: Record<string, string> = {
  '경기도': '경기', '강원특별자치도': '강원', '충청남도': '충남', '충청북도': '충북',
  '경상북도': '경북', '경상남도': '경남', '전북특별자치도': '전북', '전라남도': '전남',
  '서울특별시': '서울', '인천광역시': '인천', '대전광역시': '대전', '세종특별자치시': '세종',
  '대구광역시': '대구', '부산광역시': '부산', '울산광역시': '울산', '광주광역시': '광주',
};

// 도별로 합산된 특별시·광역시 이름 ("서울·인천 포함"). 전남광주통합특별시는 광주를 이미 포함하므로 광주만 표기.
const ABSORBED_NOTE: Record<string, string> = {};
for (const sido of Object.keys(PROVINCE_OF)) {
  if (sido === '전남광주통합특별시') continue;
  const p = PROVINCE_OF[sido];
  ABSORBED_NOTE[p] = (ABSORBED_NOTE[p] ? ABSORBED_NOTE[p] + '·' : '') + SHORT[sido];
}

function colorFor(ratio: number) {
  // ratio 0~1 — 낮으면 연한 파랑, 높으면 진한 남색 (사이트 포인트 컬러 #0d2d6b 톤 유지)
  if (ratio <= 0) return '#eef1f8';
  const stops = [
    [219, 229, 250], // 연함
    [150, 175, 225],
    [80, 110, 190],
    [13, 45, 107], // #0d2d6b
  ];
  const t = Math.min(1, ratio) * (stops.length - 1);
  const i = Math.floor(t);
  const f = t - i;
  const a = stops[i];
  const b = stops[Math.min(i + 1, stops.length - 1)];
  const mix = a.map((v, idx) => Math.round(v + (b[idx] - v) * f));
  return `rgb(${mix[0]}, ${mix[1]}, ${mix[2]})`;
}

// 자동 계산한 숫자 위치(도형 안에서 가장 넓은 지점)가 눈으로 보기엔 치우쳐 보이는 권역만 손으로 조금씩 옮긴다.
// SVG 단위 [dx, dy] — +dx 오른쪽, +dy 아래.
const LABEL_OFFSET: Record<string, [number, number]> = {
  '경기도': [12, 22],
  '전북특별자치도': [-16, -10],
  '경상남도': [16, 10],
};

interface Props {
  counts: Record<string, number>; // 시도 -> 해당 월 조회 건수 (특별시·광역시도 원래 이름 그대로 들어온다)
  onHover?: (province: string | null) => void;
}

export default function RegionStatsMap({ counts: rawCounts, onHover }: Props) {
  const counts: Record<string, number> = {};
  for (const [sido, n] of Object.entries(rawCounts)) {
    const key = provinceOf(sido);
    counts[key] = (counts[key] ?? 0) + n;
  }
  // 색 농도 기준은 지도에 그려진 권역만으로 잡는다 (제주 등 안 그리는 지역의 건수가 기준을 왜곡하지 않도록)
  const max = Math.max(1, ...KOREA_MAP.provinces.map(p => counts[p.province] ?? 0));

  return (
    <svg
      viewBox={`0 0 ${KOREA_MAP.width} ${KOREA_MAP.height}`}
      className="w-full max-w-lg mx-auto h-auto select-none"
      role="img"
      aria-label="권역별 조회 건수 지도"
    >
      {KOREA_MAP.provinces.map(({ province, d }) => (
        <path
          key={province}
          d={d}
          fillRule="evenodd"
          fill={colorFor((counts[province] ?? 0) / max)}
          stroke="#ffffff"
          strokeWidth={1.2}
          strokeLinejoin="round"
          className="cursor-default transition-opacity hover:opacity-80"
          onMouseEnter={() => onHover?.(province)}
          onMouseLeave={() => onHover?.(null)}
        />
      ))}

      {/* 숫자는 이웃 도형에 가리지 않도록 도형을 전부 그린 뒤 얹는다 */}
      {KOREA_MAP.provinces.map(({ province, cx: baseX, cy: baseY }) => {
        const count = counts[province] ?? 0;
        const dark = count / max > 0.55;
        const note = ABSORBED_NOTE[province];
        const [dx, dy] = LABEL_OFFSET[province] ?? [0, 0];
        const cx = baseX + dx;
        const y = baseY + dy + (note ? -9 : 0);
        return (
          <g key={province} pointerEvents="none" textAnchor="middle">
            <text x={cx} y={y - 7} fontSize={16} fontWeight={600} fill={dark ? '#ffffff' : '#334155'}>
              {SHORT[province]}
            </text>
            <text x={cx} y={y + 17} fontSize={22} fontWeight={700} fill={dark ? '#ffffff' : '#0d2d6b'}>
              {count.toLocaleString()}
            </text>
            {note && (
              <text x={cx} y={y + 34} fontSize={13} fill={dark ? '#dbe5fa' : '#64748b'}>
                {note} 포함
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
