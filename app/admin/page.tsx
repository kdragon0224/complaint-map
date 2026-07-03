'use client';

import Link from 'next/link';

export default function AdminPage() {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-[#0d2d6b] text-white px-4 py-2 flex items-center justify-between shadow-lg shrink-0">
        <div className="flex items-center gap-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/ex-logo.png" alt="EX" style={{ height: '13px', width: 'auto' }} />
          <h1 className="font-bold" style={{ fontSize: '14.6px' }}>관리자 페이지</h1>
        </div>
        <Link href="/" className="bg-yellow-400 hover:bg-yellow-300 text-[#0d2d6b] text-xs font-bold px-3 py-1.5 rounded-full transition-colors">
          ← 앱으로
        </Link>
      </header>

      <main className="flex-1 max-w-2xl w-full mx-auto p-4 flex flex-col gap-4">
        <Link
          href="/feedback"
          className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 flex items-center gap-4 hover:border-blue-300 hover:shadow-md transition-all"
        >
          <div className="w-12 h-12 rounded-xl bg-red-50 flex items-center justify-center text-2xl shrink-0">🚨</div>
          <div>
            <p className="font-bold text-gray-800">오류 신고 게시판</p>
            <p className="text-xs text-gray-400 mt-0.5">사용자 신고 내역 확인 및 관리 (삭제는 관리자 로그인 필요)</p>
          </div>
        </Link>

        <Link
          href="/stats"
          className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 flex items-center gap-4 hover:border-blue-300 hover:shadow-md transition-all"
        >
          <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center text-2xl shrink-0">📊</div>
          <div>
            <p className="font-bold text-gray-800">이용 현황 통계</p>
            <p className="text-xs text-gray-400 mt-0.5">조회 건수, 시간대별, 기관별 TOP 10 (관리자 로그인 필요)</p>
          </div>
        </Link>
      </main>
    </div>
  );
}
