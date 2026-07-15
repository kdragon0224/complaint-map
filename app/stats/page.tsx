'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { supabase } from '@/lib/supabase';
import Link from 'next/link';

const KakaoMap = dynamic(() => import('@/components/KakaoMap'), { ssr: false });

const ADMIN_PASSWORD = '2504';

interface Log {
  id: number;
  queried_at: string;
  input_address: string | null;
  lat: number | null;
  lng: number | null;
  result_agency: string | null;
  result_agency_full: string | null;
  result_road_type: string | null;
  result_route_name: string | null;
  result_distance_m: number | null;
  confidence: string | null;
  found: boolean;
}

function formatDate(str: string) {
  const d = new Date(str);
  return d.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function formatDateShort(str: string) {
  const d = new Date(str);
  return d.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', month: '2-digit', day: '2-digit' });
}

export default function StatsPage() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [pw, setPw] = useState('');
  const [pwError, setPwError] = useState('');
  const [logs, setLogs] = useState<Log[]>([]);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<'overview' | 'logs'>('overview');
  const [selectedLog, setSelectedLog] = useState<Log | null>(null);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('query_logs')
      .select('*')
      .order('queried_at', { ascending: false })
      .limit(500);
    setLogs(data || []);
    setLoading(false);
  }, []);

  useEffect(() => { if (isAdmin) fetchLogs(); }, [isAdmin, fetchLogs]);

  const handleLogin = () => {
    if (pw === ADMIN_PASSWORD) { setIsAdmin(true); setPwError(''); }
    else setPwError('비밀번호가 틀렸습니다.');
  };

  // 통계 계산 (logs 변경 시에만 재계산)
  const { total, found, notFound, topAgencies, dailyEntries, maxDaily, hourCount, maxHour } = useMemo(() => {
    const total = logs.length;
    const found = logs.filter(l => l.found).length;

    const agencyCount: Record<string, number> = {};
    for (const l of logs) {
      if (l.result_agency_full) {
        agencyCount[l.result_agency_full] = (agencyCount[l.result_agency_full] || 0) + 1;
      }
    }
    const topAgencies = Object.entries(agencyCount).sort((a, b) => b[1] - a[1]).slice(0, 10);

    const dailyCount: Record<string, number> = {};
    const now = new Date();
    for (let i = 13; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      dailyCount[d.toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul', month: '2-digit', day: '2-digit' })] = 0;
    }
    for (const l of logs) {
      const key = formatDateShort(l.queried_at);
      if (key in dailyCount) dailyCount[key]++;
    }
    const dailyEntries = Object.entries(dailyCount);
    const maxDaily = Math.max(...dailyEntries.map(e => e[1]), 1);

    const hourCount = Array(24).fill(0);
    for (const l of logs) {
      const kh = (new Date(l.queried_at).getUTCHours() + 9) % 24;
      hourCount[kh]++;
    }

    return { total, found, notFound: total - found, topAgencies, dailyEntries, maxDaily, hourCount, maxHour: Math.max(...hourCount, 1) };
  }, [logs]);

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col">
        <header className="bg-[#0d2d6b] text-white px-4 py-2 flex items-center justify-between shadow-lg shrink-0">
          <div className="flex items-center gap-2.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/ex-logo.png" alt="EX" style={{ height: '13px', width: 'auto' }} />
            <h1 className="font-bold" style={{ fontSize: '14.6px' }}>이용 현황 통계</h1>
          </div>
          <Link href="/" className="bg-yellow-400 hover:bg-yellow-300 text-[#0d2d6b] text-xs font-bold px-3 py-1.5 rounded-full transition-colors">
            ← 앱으로
          </Link>
        </header>
        <div className="flex-1 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 w-full max-w-sm">
            <div className="text-center mb-5">
              <div className="text-4xl mb-2">📊</div>
              <h2 className="font-bold text-gray-800">관리자 로그인</h2>
              <p className="text-sm text-gray-400 mt-1">통계 페이지는 관리자만 열람 가능합니다</p>
            </div>
            <input
              type="password"
              value={pw}
              onChange={e => setPw(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleLogin()}
              placeholder="비밀번호 입력"
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 mb-2"
              autoFocus
            />
            {pwError && <p className="text-red-500 text-xs mb-2">{pwError}</p>}
            <button
              onClick={handleLogin}
              className="w-full bg-[#0d2d6b] text-white py-2.5 rounded-xl text-sm font-semibold"
            >
              확인
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-[#0d2d6b] text-white px-4 py-2 flex items-center justify-between shadow-lg shrink-0">
        <div className="flex items-center gap-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/ex-logo.png" alt="EX" style={{ height: '13px', width: 'auto' }} />
          <h1 className="font-bold" style={{ fontSize: '14.6px' }}>이용 현황 통계</h1>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/admin" className="text-blue-300 text-xs hover:text-white transition-colors">
            관리자 홈
          </Link>
          <Link href="/" className="bg-yellow-400 hover:bg-yellow-300 text-[#0d2d6b] text-xs font-bold px-3 py-1.5 rounded-full transition-colors">
            ← 앱으로
          </Link>
        </div>
      </header>

      <div className="max-w-3xl w-full mx-auto p-4 flex flex-col gap-4">
        {/* 탭 */}
        <div className="flex gap-2">
          {(['overview', 'logs'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${
                tab === t ? 'bg-[#0d2d6b] text-white' : 'bg-white text-gray-500 hover:bg-gray-100 border border-gray-100'
              }`}
            >
              {t === 'overview' ? '📊 통계 요약' : '📋 조회 기록'}
            </button>
          ))}
          <button onClick={fetchLogs} className="ml-auto text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1">
            🔄 새로고침
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <div className="w-8 h-8 border-4 border-blue-100 border-t-[#0d2d6b] rounded-full animate-spin" />
          </div>
        ) : tab === 'overview' ? (
          <>
            {/* 요약 카드 */}
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: '총 조회 수', value: total, color: 'text-[#0d2d6b]' },
                { label: '결과 있음', value: found, color: 'text-emerald-600' },
                { label: '결과 없음', value: notFound, color: 'text-red-400' },
              ].map(({ label, value, color }) => (
                <div key={label} className="bg-white rounded-2xl border border-gray-100 p-4 text-center shadow-sm">
                  <p className={`text-2xl font-bold ${color}`}>{value.toLocaleString()}</p>
                  <p className="text-xs text-gray-400 mt-1">{label}</p>
                </div>
              ))}
            </div>

            {/* 일별 조회 수 (최근 14일) */}
            <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
              <p className="text-sm font-semibold text-gray-700 mb-3">📅 일별 조회 수 (최근 14일)</p>
              <div className="flex items-end gap-1 h-24">
                {dailyEntries.map(([date, count]) => (
                  <div key={date} className="flex-1 flex flex-col items-center gap-1 min-w-0">
                    <div
                      className="w-full bg-[#0d2d6b] rounded-t-sm opacity-80 transition-all"
                      style={{ height: `${Math.round((count / maxDaily) * 80)}px`, minHeight: count > 0 ? '3px' : '0' }}
                    />
                    <p className="text-[9px] text-gray-400 truncate w-full text-center">{date.replace('.', '/')}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* 시간대별 */}
            <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
              <p className="text-sm font-semibold text-gray-700 mb-3">🕐 시간대별 조회 (0~23시)</p>
              <div className="flex items-end gap-0.5 h-16">
                {hourCount.map((cnt, h) => (
                  <div key={h} className="flex-1 flex flex-col items-center gap-0.5 min-w-0">
                    <div
                      className="w-full bg-blue-400 rounded-t-sm opacity-75"
                      style={{ height: `${Math.round((cnt / maxHour) * 52)}px`, minHeight: cnt > 0 ? '2px' : '0' }}
                    />
                    {h % 6 === 0 && <p className="text-[8px] text-gray-400">{h}시</p>}
                  </div>
                ))}
              </div>
            </div>

            {/* 기관별 TOP 10 */}
            <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
              <p className="text-sm font-semibold text-gray-700 mb-3">🏢 자주 조회된 관리기관 TOP 10</p>
              {topAgencies.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-4">데이터 없음</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {topAgencies.map(([agency, count], i) => (
                    <div key={agency} className="flex items-center gap-2">
                      <span className={`text-xs font-bold w-5 text-center ${i === 0 ? 'text-yellow-500' : i === 1 ? 'text-gray-400' : i === 2 ? 'text-amber-600' : 'text-gray-300'}`}>
                        {i + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-0.5">
                          <p className="text-xs text-gray-700 truncate">{agency}</p>
                          <p className="text-xs font-semibold text-gray-500 ml-2 shrink-0">{count}건</p>
                        </div>
                        <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-[#0d2d6b] rounded-full"
                            style={{ width: `${(count / (topAgencies[0][1] || 1)) * 100}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        ) : (
          /* 조회 기록 테이블 */
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="p-3 border-b border-gray-50">
              <p className="text-sm font-semibold text-gray-700">최근 조회 기록 (최대 500건)</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-gray-50 text-gray-500">
                    <th className="px-3 py-2 text-left font-semibold whitespace-nowrap">조회 시간</th>
                    <th className="px-3 py-2 text-left font-semibold whitespace-nowrap">입력 주소</th>
                    <th className="px-3 py-2 text-left font-semibold whitespace-nowrap">결과 기관</th>
                    <th className="px-3 py-2 text-left font-semibold whitespace-nowrap">노선</th>
                    <th className="px-3 py-2 text-left font-semibold whitespace-nowrap">이격</th>
                    <th className="px-3 py-2 text-left font-semibold whitespace-nowrap">신뢰도</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((l, i) => (
                    <tr
                      key={l.id}
                      onClick={() => setSelectedLog(l)}
                      className={`cursor-pointer hover:bg-blue-50 transition-colors ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}`}
                    >
                      <td className="px-3 py-2 whitespace-nowrap text-gray-500">{formatDate(l.queried_at)}</td>
                      <td className="px-3 py-2 max-w-[120px] truncate text-gray-700">{l.input_address || '-'}</td>
                      <td className={`px-3 py-2 max-w-[140px] truncate ${l.found ? 'text-gray-700' : 'text-red-400'}`}>
                        {l.result_agency_full || '결과 없음'}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap text-gray-500">{l.result_route_name || '-'}</td>
                      <td className="px-3 py-2 whitespace-nowrap text-gray-500">
                        {l.result_distance_m != null
                          ? l.result_distance_m >= 1000
                            ? `${(l.result_distance_m / 1000).toFixed(1)}km`
                            : `${Math.round(l.result_distance_m)}m`
                          : '-'}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                          l.confidence === '높음' ? 'bg-emerald-100 text-emerald-700'
                          : l.confidence === '보통' ? 'bg-amber-100 text-amber-700'
                          : l.confidence === '낮음' ? 'bg-red-100 text-red-600'
                          : 'bg-gray-100 text-gray-400'
                        }`}>
                          {l.confidence || '-'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {logs.length === 0 && (
                <p className="text-center text-gray-400 text-sm py-10">아직 조회 기록이 없습니다</p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* 당시 이용자 화면 재현 모달 */}
      {selectedLog && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
          onClick={() => setSelectedLog(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-xl w-full max-w-sm overflow-hidden max-h-[90vh] flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between shrink-0">
              <div>
                <p className="text-sm font-bold text-gray-800">조회 당시 결과 화면</p>
                <p className="text-[11px] text-gray-400">{formatDate(selectedLog.queried_at)} · {selectedLog.input_address || '핀 이동으로 조회'}</p>
              </div>
              <button
                onClick={() => setSelectedLog(null)}
                className="text-gray-400 hover:text-gray-600 text-xl leading-none px-1"
              >
                ×
              </button>
            </div>

            {selectedLog.lat != null && selectedLog.lng != null && (
              <div className="relative h-56 shrink-0">
                <KakaoMap lat={selectedLog.lat} lng={selectedLog.lng} />
              </div>
            )}

            <div className="p-4 overflow-y-auto">
              {selectedLog.found && selectedLog.result_agency_full ? (
                <div className={`rounded-2xl overflow-hidden shadow-sm border ${
                  !selectedLog.result_agency_full.startsWith('한국도로공사') ? 'border-amber-200' : 'border-blue-100'
                }`}>
                  <div className={`p-4 ${
                    !selectedLog.result_agency_full.startsWith('한국도로공사') ? 'bg-amber-50' : 'bg-gradient-to-br from-blue-50 to-indigo-50'
                  }`}>
                    <p className="text-base font-bold text-gray-900 leading-snug">{selectedLog.result_agency_full}</p>
                    <p className="mt-1 text-base font-bold text-gray-900">
                      {selectedLog.result_road_type && (
                        <span className={`text-xs px-1.5 py-0.5 rounded font-semibold mr-1.5 align-middle ${
                          selectedLog.result_road_type === '고속국도' ? 'bg-green-100 text-green-700'
                          : selectedLog.result_road_type === '일반국도' ? 'bg-blue-100 text-blue-700'
                          : selectedLog.result_road_type === '지방도' ? 'bg-purple-100 text-purple-700'
                          : selectedLog.result_road_type === '도시고속화도로' ? 'bg-orange-100 text-orange-700'
                          : 'bg-gray-100 text-gray-600'
                        }`}>
                          {selectedLog.result_road_type}
                        </span>
                      )}
                      {selectedLog.result_route_name?.replace(/\s*\(.*?\)/, '') || '-'}
                      {(() => {
                        const paren = selectedLog.result_route_name?.match(/\(([^)]+)\)/)?.[1];
                        if (!paren) return null;
                        return <span className="ml-1">{paren.includes('km') ? `${paren} 지점` : paren}</span>;
                      })()}
                    </p>

                    {selectedLog.result_distance_m != null && selectedLog.result_distance_m > 200 && (
                      <p className="mt-3 pt-3 border-t border-black/10 flex items-center gap-1.5 text-xs text-amber-600 font-medium">
                        <span>⚠️</span>
                        <span>
                          핀이 관리노선에서{' '}
                          {selectedLog.result_distance_m >= 1000
                            ? `${(selectedLog.result_distance_m / 1000).toFixed(1)}km`
                            : `${Math.round(selectedLog.result_distance_m)}m`} 떨어져 있습니다
                        </span>
                      </p>
                    )}

                    <div className="mt-3 pt-3 border-t border-black/10 flex items-center justify-between text-xs">
                      <span className="text-gray-500">신뢰도</span>
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                        selectedLog.confidence === '높음' ? 'bg-emerald-100 text-emerald-700'
                        : selectedLog.confidence === '보통' ? 'bg-amber-100 text-amber-700'
                        : selectedLog.confidence === '낮음' ? 'bg-red-100 text-red-600'
                        : 'bg-gray-100 text-gray-400'
                      }`}>
                        {selectedLog.confidence || '-'}
                      </span>
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-center text-gray-400 text-sm py-6">당시 결과 없음</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
