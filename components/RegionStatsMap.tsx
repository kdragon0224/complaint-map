'use client';

// 대한민국 17개 시도를 "정확한 경계"가 아니라 상대적 위치를 살린 간략화된 격자(카토그램)로
// 배치한다 — 실제 해안선·경계선 좌표 데이터 없이도 "대략 어디쯤"인지 한눈에 들어오게 하기 위함.
// col: 서쪽(0)→동쪽, row: 북쪽(0)→남쪽.
const SIDO_GRID: { sido: string; col: number; row: number; rowSpan?: number }[] = [
  { sido: '강원특별자치도', col: 3, row: 0 },
  { sido: '인천광역시', col: 0, row: 1 },
  { sido: '서울특별시', col: 1, row: 1 },
  { sido: '경기도', col: 2, row: 1 },
  { sido: '충청북도', col: 3, row: 1 },
  { sido: '충청남도', col: 1, row: 2 },
  { sido: '세종특별자치시', col: 2, row: 2 },
  { sido: '경상북도', col: 4, row: 2 },
  { sido: '전북특별자치도', col: 1, row: 3 },
  { sido: '대전광역시', col: 2, row: 3 },
  { sido: '대구광역시', col: 4, row: 3 },
  { sido: '전남광주통합특별시', col: 1, row: 4, rowSpan: 2 },
  { sido: '경상남도', col: 4, row: 4 },
  { sido: '울산광역시', col: 5, row: 4 },
  { sido: '부산광역시', col: 5, row: 5 },
  { sido: '제주특별자치도', col: 1, row: 7 },
];

const CELL = 72;
const PAD = 16;
const COLS = 6;
const ROWS = 8;

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

interface Props {
  counts: Record<string, number>; // sido -> 해당 월 조회 건수
  onHover?: (sido: string | null) => void;
}

// 카카오가 광주·전남을 "전남광주통합특별시"로 반환한다 (lib/road-rules.ts의 행정구역 통합 대응과 동일).
// 옛 이름(광주광역시/전라남도)으로 저장된 값이 섞여 있어도 통합 칸으로 합산한다.
const MERGED_SIDO: Record<string, string> = {
  '광주광역시': '전남광주통합특별시',
  '전라남도': '전남광주통합특별시',
};
const SHORT_LABEL: Record<string, string> = { '전남광주통합특별시': '전남·광주' };

export default function RegionStatsMap({ counts: rawCounts, onHover }: Props) {
  const counts: Record<string, number> = {};
  for (const [sido, n] of Object.entries(rawCounts)) {
    const key = MERGED_SIDO[sido] ?? sido;
    counts[key] = (counts[key] ?? 0) + n;
  }
  const max = Math.max(1, ...Object.values(counts));
  const width = PAD * 2 + COLS * CELL;
  const height = PAD * 2 + ROWS * CELL;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto select-none" role="img" aria-label="시도별 조회 건수 지도">
      {SIDO_GRID.map(({ sido, col, row, rowSpan = 1 }) => {
        const cellH = CELL * rowSpan - 6;
        const x = PAD + col * CELL;
        const y = PAD + row * CELL;
        const count = counts[sido] ?? 0;
        const ratio = count / max;
        return (
          <g
            key={sido}
            transform={`translate(${x}, ${y})`}
            onMouseEnter={() => onHover?.(sido)}
            onMouseLeave={() => onHover?.(null)}
            className="cursor-default"
          >
            <rect
              width={CELL - 6}
              height={cellH}
              rx={10}
              fill={colorFor(ratio)}
              stroke="#c7cfe0"
              strokeWidth={1}
            />
            <text
              x={(CELL - 6) / 2}
              y={cellH / 2 - 6}
              textAnchor="middle"
              fontSize={12}
              fill={ratio > 0.55 ? '#ffffff' : '#334155'}
              fontWeight={600}
            >
              {SHORT_LABEL[sido] ?? sido.replace(/(특별자치|광역|특별)?(시|도)$/, '')}
            </text>
            <text
              x={(CELL - 6) / 2}
              y={cellH / 2 + 14}
              textAnchor="middle"
              fontSize={15}
              fill={ratio > 0.55 ? '#ffffff' : '#0d2d6b'}
              fontWeight={700}
            >
              {count.toLocaleString()}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
