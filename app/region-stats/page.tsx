'use client';

import Link from 'next/link';
import RegionStatsPanel from '@/components/RegionStatsPanel';

// 공개 페이지(비밀번호 없음) — 시도별 월간 조회 건수 집계만 보여준다. 개별 조회 기록·시간대 통계는 /stats(관리자 전용)에만 있다.
export default function RegionStatsPage() {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-[#0d2d6b] text-white px-4 py-2 flex items-center justify-between shadow-lg shrink-0">
        <div className="flex items-center gap-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/ex-logo.png" alt="EX" style={{ height: '13px', width: 'auto' }} />
          <h1 className="font-bold" style={{ fontSize: '14.6px' }}>지역별 이용 현황</h1>
        </div>
        <Link href="/" className="bg-yellow-400 hover:bg-yellow-300 text-[#0d2d6b] text-xs font-bold px-3 py-1.5 rounded-full transition-colors">
          ← 앱으로
        </Link>
      </header>
      <div className="max-w-3xl w-full mx-auto p-4 flex flex-col gap-4">
        <RegionStatsPanel />
      </div>
    </div>
  );
}
