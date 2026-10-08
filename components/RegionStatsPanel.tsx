'use client';

import { useState, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { supabase } from '@/lib/supabase';
import { provinceOf } from '@/lib/sido-groups';

const RegionStatsMap = dynamic(() => import('@/components/RegionStatsMap'), { ssr: false });

// 월별 시도 조회 건수를 지도+순위로 보여주는 패널. /stats 의 "지역별 통계" 탭(관리자)과 공개 페이지 /region-stats 에서 함께 쓴다.
// 시도별 건수만 집계하므로 주소·좌표 같은 개별 조회 내용은 이 패널에서 읽지도, 보여주지도 않는다.
export default function RegionStatsPanel() {
  const [regionMonthly, setRegionMonthly] = useState<Record<string, Record<string, number>> | null>(null);
  const [regionLoading, setRegionLoading] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);
  const [hoveredSido, setHoveredSido] = useState<string | null>(null);

  const fetchRegionStats = useCallback(async () => {
    setRegionLoading(true);
    // sido/queried_at 두 컬럼만 — 전체 기간 집계용이라 overview의 500건 샘플과 별도로 전수 조회
    // Supabase는 한 번에 최대 1,000행만 돌려주므로(limit을 크게 줘도 잘림) 1,000행씩 페이지를 넘겨 전부 모은다
    const data: { sido: string | null; queried_at: string }[] = [];
    for (let from = 0; ; from += 1000) {
      const { data: page } = await supabase
        .from('query_logs').select('sido, queried_at').order('id', { ascending: true }).range(from, from + 999);
      if (!page || page.length === 0) break;
      data.push(...(page as { sido: string | null; queried_at: string }[]));
      if (page.length < 1000) break;
    }
    const byMonth: Record<string, Record<string, number>> = {};
    const ymFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit' });
    for (const row of data) {
      const parts = ymFormatter.formatToParts(new Date(row.queried_at as string));
      const ym = `${parts.find(p => p.type === 'year')?.value}-${parts.find(p => p.type === 'month')?.value}`;
      if (!byMonth[ym]) byMonth[ym] = {};
      const sido = row.sido as string | null;
      if (sido) byMonth[ym][sido] = (byMonth[ym][sido] || 0) + 1;
    }
    setRegionMonthly(byMonth);
    setSelectedMonth(prev => prev ?? Object.keys(byMonth).sort().pop() ?? null);
    setRegionLoading(false);
  }, []);

  useEffect(() => {
    if (regionMonthly === null) fetchRegionStats();
  }, [regionMonthly, fetchRegionStats]);

  return (
    <>
    {regionLoading || !regionMonthly ? (
      <div className="flex justify-center py-16">
        <div className="w-8 h-8 border-4 border-blue-100 border-t-[#0d2d6b] rounded-full animate-spin" />
      </div>
    ) : Object.keys(regionMonthly).length === 0 ? (
      <p className="text-sm text-gray-400 text-center py-8">데이터 없음</p>
    ) : (
      <>
        {/* 월 선택 */}
        <div className="bg-white rounded-2xl border border-gray-100 p-3 shadow-sm flex items-center justify-center gap-3">
          {(() => {
            const months = Object.keys(regionMonthly).sort();
            const idx = selectedMonth ? months.indexOf(selectedMonth) : -1;
            return (
              <>
                <button
                  disabled={idx <= 0}
                  onClick={() => setSelectedMonth(months[idx - 1])}
                  className="w-8 h-8 rounded-full bg-gray-50 text-gray-500 disabled:opacity-30 hover:bg-gray-100"
                >
                  ‹
                </button>
                <p className="text-sm font-bold text-[#0d2d6b] w-24 text-center">{selectedMonth}</p>
                <button
                  disabled={idx === -1 || idx >= months.length - 1}
                  onClick={() => setSelectedMonth(months[idx + 1])}
                  className="w-8 h-8 rounded-full bg-gray-50 text-gray-500 disabled:opacity-30 hover:bg-gray-100"
                >
                  ›
                </button>
              </>
            );
          })()}
        </div>

        {/* 지도 */}
        <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
          <p className="text-sm font-semibold text-gray-700 mb-1">
            🗺️ {selectedMonth} 권역별 조회 건수
          </p>
          <p className="text-[10px] text-gray-400 mb-3">특별시·광역시는 소재 도에 합산</p>
          <RegionStatsMap
            counts={selectedMonth ? regionMonthly[selectedMonth] ?? {} : {}}
            onHover={setHoveredSido}
          />
          {/* 공공누리 제1유형: 출처 표시 조건 */}
          <p className="text-[9px] text-gray-300 text-right mt-1">경계: 통계청 SGIS 행정구역경계(공공누리 제1유형) 단순화</p>
        </div>

        {/* 순위 목록 (정확한 숫자 확인용) */}
        <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
          <p className="text-sm font-semibold text-gray-700 mb-3">📋 {selectedMonth} 순위</p>
          {(() => {
            const counts = selectedMonth ? regionMonthly[selectedMonth] ?? {} : {};
            const ranked = Object.entries(counts).sort((a, b) => b[1] - a[1]);
            const top = ranked[0]?.[1] || 1;
            if (ranked.length === 0) return <p className="text-sm text-gray-400 text-center py-4">데이터 없음</p>;
            return (
              <div className="flex flex-col gap-2">
                {ranked.map(([sido, count]) => (
                  <div key={sido} className={`flex items-center gap-2 rounded-lg px-1 ${hoveredSido !== null && provinceOf(sido) === hoveredSido ? 'bg-blue-50' : ''}`}>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-0.5">
                        <p className="text-xs text-gray-700">{sido}</p>
                        <p className="text-xs font-semibold text-gray-500 ml-2 shrink-0">{count.toLocaleString()}건</p>
                      </div>
                      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full bg-[#0d2d6b] rounded-full" style={{ width: `${(count / top) * 100}%` }} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            );
          })()}
        </div>
      </>
    )}
    </>
  );
}
