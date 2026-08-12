'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { isCoarsePointer } from '@/lib/device';

const KakaoMap = dynamic(() => import('@/components/KakaoMap'), { ssr: false });

interface BranchContact {
  label: string;
  phone: string;
}

interface Recommendation {
  agency: string;
  agencyFull: string;
  roadType: string;
  routeName: string;
  confidence: '높음' | '보통' | '낮음';
  reason: string;
  distanceM: number;
  contacts?: BranchContact[];
}

interface SearchResult {
  lat: number;
  lng: number;
  recommendation: Recommendation | null;
}

interface GeocodeCandidate {
  label: string;
  lat: number;
  lng: number;
}

const DEFAULT_LAT = 37.5665;
const DEFAULT_LNG = 126.9784;

export default function Home() {
  const [address, setAddress] = useState('');
  const [pinLat, setPinLat] = useState(DEFAULT_LAT);
  const [pinLng, setPinLng] = useState(DEFAULT_LNG);
  const [showMap, setShowMap] = useState(false);
  const [result, setResult] = useState<SearchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [pinAddress, setPinAddress] = useState<{ road: string; jibun: string } | null>(null);
  const [isTouch, setIsTouch] = useState(false);
  const [lastQuery, setLastQuery] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<GeocodeCandidate[] | null>(null);
  const requestIdRef = useRef(0);

  useEffect(() => {
    setIsTouch(isCoarsePointer());
  }, []);

  const search = useCallback(async (params: { query: string } | { lat: number; lng: number }) => {
    // 핀을 여러 번 옮기면 매번 새 요청이 나가는데, 네트워크 지연으로 이전 요청 응답이
    // 나중에 도착하면 최신 결과를 오래된 결과로 덮어써버릴 수 있음
    // → 요청마다 순번을 매겨, 가장 마지막에 보낸 요청의 응답만 반영
    const reqId = ++requestIdRef.current;
    setLoading(true);
    setError('');
    setCandidates(null);
    try {
      const qs = 'query' in params
        ? `query=${encodeURIComponent(params.query)}`
        : `lat=${params.lat}&lng=${params.lng}`;
      const res = await fetch(`/api/search?${qs}`);
      if (reqId !== requestIdRef.current) return; // 그 사이 더 최신 요청이 나감 — 이 응답은 폐기
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || '주소를 찾을 수 없습니다.');
        return;
      }
      const data: SearchResult & { ambiguous?: GeocodeCandidate[] } = await res.json();
      if (reqId !== requestIdRef.current) return;
      if (data.ambiguous) {
        setCandidates(data.ambiguous);
        setResult(null);
        return;
      }
      setResult(data);
      setLastQuery('query' in params ? params.query : null);
      if ('query' in params) {
        setPinLat(data.lat);
        setPinLng(data.lng);
        setShowMap(true);
      }
    } catch {
      if (reqId !== requestIdRef.current) return;
      setError('검색 중 오류가 발생했습니다.');
    } finally {
      if (reqId === requestIdRef.current) setLoading(false);
    }
  }, []);

  const selectCandidate = useCallback((c: GeocodeCandidate) => {
    setCandidates(null);
    setLastQuery(null);
    search({ lat: c.lat, lng: c.lng });
    setPinLat(c.lat);
    setPinLng(c.lng);
    setShowMap(true);
  }, [search]);

  // 오류 신고 게시판의 "지도에서 위치 확인" 링크(?lat=&lng=)로 진입 시 해당 위치 표시
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const lat = params.get('lat');
    const lng = params.get('lng');
    if (lat && lng) {
      const la = parseFloat(lat);
      const lo = parseFloat(lng);
      if (!isNaN(la) && !isNaN(lo)) {
        setPinLat(la);
        setPinLng(lo);
        setShowMap(true);
        search({ lat: la, lng: lo });
      }
    }
  }, [search]);

  const handleSearch = () => {
    if (!address.trim()) return;
    search({ query: address.trim() });
  };

  const handlePinMove = useCallback((lat: number, lng: number) => {
    setPinLat(lat);
    setPinLng(lng);
    setAddress(''); // 핀 이동 시 이전 검색어를 지워 "핀 위치 기준"임을 명확히 함
    search({ lat, lng });
  }, [search]);

  const rec = result?.recommendation;
  const isPrivate = rec && !rec.agencyFull.startsWith('한국도로공사');

  const reportHref = (() => {
    if (!result || !rec) return '/feedback';
    const params = new URLSearchParams({
      reportLat: String(result.lat),
      reportLng: String(result.lng),
      reportRoadType: rec.roadType,
      reportRouteName: rec.routeName,
      reportAgency: rec.agencyFull,
    });
    if (lastQuery) params.set('reportQuery', lastQuery);
    return `/feedback?${params.toString()}`;
  })();

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">

      {/* 헤더 */}
      <header className="bg-[#0d2d6b] text-white px-4 py-2 flex items-center justify-between shadow-lg z-10 shrink-0">
        <div className="flex items-center gap-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/ex-logo.png" alt="EX" style={{ height: '13px', width: 'auto', flexShrink: 0 }} />
          <div>
            <h1 className="font-bold leading-tight tracking-tight" style={{ fontSize: '14.6px' }}>
              <span className="whitespace-nowrap">민원알림 내비게이션</span>{' '}
              <span className="text-blue-200 font-normal whitespace-nowrap" style={{ fontSize: '11px' }}>(한국도로공사 전북본부 제작)</span>
            </h1>
          </div>
        </div>
        <Link href="/admin" className="bg-yellow-400 hover:bg-yellow-300 text-[#0d2d6b] text-xs font-bold px-3 py-1.5 rounded-full transition-colors shrink-0 whitespace-nowrap shadow-sm">
          ⚙️ 관리자
        </Link>
      </header>

      <main className="flex-1 flex flex-col lg:flex-row overflow-hidden" style={{ height: 'calc(100vh - 56px)' }}>

        {/* 좌측 패널 */}
        <div className="w-full lg:w-[380px] shrink-0 flex flex-col bg-white shadow-md z-10 overflow-y-auto order-2 lg:order-1 h-[45vh] lg:h-auto lg:max-h-full">

          {/* 검색 */}
          <div className="p-4 border-b border-gray-100">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2">민원발생 지명 또는 주소</p>
            <div className="flex gap-2">
              <input
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                placeholder="주소, IC·JC명 또는 노선명+이정 (예: 중부선 220)"
                className="flex-1 border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-gray-50"
              />
              <button
                onClick={handleSearch}
                disabled={loading}
                className="bg-[#0d2d6b] hover:bg-[#1a3f8f] active:bg-[#0a2459] text-white px-5 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-40 transition-colors shadow-sm"
              >
                {loading ? '⏳' : '검색'}
              </button>
            </div>
            {error && (
              <p className="text-red-500 text-xs mt-2 flex items-center gap-1">
                ⚠️ {error}
              </p>
            )}
            {showMap && !loading && (
              <div className="mt-2 text-xs">
                {pinAddress ? (
                  <div className="space-y-0.5">
                    {pinAddress.road && (
                      <p className="text-gray-600 flex items-start gap-1">
                        <span className="shrink-0 bg-blue-100 text-blue-700 font-semibold px-1 rounded">도로명</span>
                        <span>{pinAddress.road}</span>
                      </p>
                    )}
                    {pinAddress.jibun && (
                      <p className="text-gray-500 flex items-start gap-1">
                        <span className="shrink-0 bg-gray-100 text-gray-600 font-semibold px-1 rounded">지번</span>
                        <span>{pinAddress.jibun}</span>
                      </p>
                    )}
                    {!pinAddress.road && !pinAddress.jibun && (
                      <p className="text-gray-400">주소 정보 없음</p>
                    )}
                  </div>
                ) : (
                  <p className="text-gray-400">
                    {isTouch ? '📍 지도를 움직이면 위치를 보정할 수 있습니다' : '📍 핀을 드래그하면 위치를 보정할 수 있습니다'}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* 로딩 */}
          {loading && (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 py-10">
              <div className="w-10 h-10 border-4 border-blue-100 border-t-[#0d2d6b] rounded-full animate-spin" />
              <p className="text-sm text-gray-400">도로 정보 분석 중...</p>
            </div>
          )}

          {/* 동일 지번 다중 후보 선택 */}
          {candidates && !loading && (
            <div className="flex-1 flex flex-col p-4">
              <div className="rounded-2xl overflow-hidden shadow-sm border border-amber-200">
                <div className="p-3 bg-amber-50 border-b border-amber-100">
                  <p className="text-sm font-bold text-gray-800">⚠️ 동일한 지번이 여러 곳에 있어요</p>
                  <p className="text-xs text-gray-500 mt-0.5">찾으시는 위치를 선택해주세요</p>
                </div>
                <div className="divide-y divide-gray-100">
                  {candidates.map((c, i) => {
                    const sido = c.label.split(' ')[0];
                    const rest = c.label.slice(sido.length).trim();
                    return (
                      <button
                        key={i}
                        onClick={() => selectCandidate(c)}
                        className="w-full text-left px-4 py-3 hover:bg-blue-50 transition-colors flex items-start gap-2"
                      >
                        <span className="shrink-0 mt-0.5">📍</span>
                        <span className="text-sm text-gray-700">
                          <span className="font-bold text-gray-900">{sido}</span> {rest}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* 결과 */}
          {result && !loading && (
            <div className="flex-1 flex flex-col p-4">
              {rec ? (
                <div className={`rounded-2xl overflow-hidden shadow-sm border ${
                  isPrivate ? 'border-amber-200' : 'border-blue-100'
                }`}>
                  <div className={`p-4 ${
                    isPrivate ? 'bg-amber-50' : 'bg-gradient-to-br from-blue-50 to-indigo-50'
                  }`}>
                    {/* 1줄: 기관명 */}
                    <p className="text-base font-bold text-gray-900 leading-snug">{rec.agencyFull}</p>

                    {/* 2줄: 노선 + 이정 */}
                    <p className="mt-1 text-base font-bold text-gray-900">
                      <span className={`text-xs px-1.5 py-0.5 rounded font-semibold mr-1.5 align-middle ${
                        rec.roadType === '고속국도' ? 'bg-green-100 text-green-700'
                        : rec.roadType === '일반국도' ? 'bg-blue-100 text-blue-700'
                        : rec.roadType === '지방도' ? 'bg-purple-100 text-purple-700'
                        : rec.roadType === '도시고속화도로' ? 'bg-orange-100 text-orange-700'
                        : 'bg-gray-100 text-gray-600'
                      }`}>
                        {rec.roadType}
                      </span>
                      {rec.routeName.replace(/\s*\(.*?\)/, '')}
                      {(() => {
                        const paren = rec.routeName.match(/\(([^)]+)\)/)?.[1];
                        if (!paren) return null;
                        // km 이정은 "지점", 도로명은 그대로 표시
                        return <span className="ml-1">{paren.includes('km') ? `${paren} 지점` : paren}</span>;
                      })()}
                    </p>

                    {/* 이격 경고 */}
                    {rec.distanceM > 200 && (
                      <p className="mt-3 pt-3 border-t border-black/10 flex items-center gap-1.5 text-xs text-amber-600 font-medium">
                        <span>⚠️</span>
                        <span>
                          핀이 관리노선에서{' '}
                          {rec.distanceM >= 1000
                            ? `${(rec.distanceM / 1000).toFixed(1)}km`
                            : `${Math.round(rec.distanceM)}m`} 떨어져 있습니다
                        </span>
                      </p>
                    )}

                    {/* 담당 연락처 (전북본부 지사만 노출) */}
                    {rec.contacts && rec.contacts.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-black/10 flex flex-col gap-1.5">
                        {rec.contacts.map((c) => (
                          <a
                            key={c.label}
                            href={`tel:${c.phone}`}
                            className="flex items-center justify-between rounded-lg bg-white/70 hover:bg-white px-2.5 py-1.5 text-xs transition-colors"
                          >
                            <span className="font-semibold text-gray-700">{c.label}</span>
                            <span className="font-semibold text-blue-700">{c.phone}</span>
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                  <Link
                    href={reportHref}
                    className="block text-center py-2 text-xs font-semibold text-gray-500 hover:text-red-500 hover:bg-red-50 border-t border-black/5 transition-colors"
                  >
                    ⚠️ 이 결과가 잘못됐나요?
                  </Link>
                </div>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center gap-3 py-8 text-center">
                  <div className="text-4xl">🔍</div>
                  <p className="text-gray-500 text-sm font-medium">주변 500m 내 도로 정보 없음</p>
                  <p className="text-gray-400 text-xs">핀을 이동하거나 주소를 재검색해 주세요</p>
                  <Link
                    href={reportHref}
                    className="text-xs font-semibold text-gray-500 hover:text-red-500 underline"
                  >
                    ⚠️ 이 위치의 정보를 신고하기
                  </Link>
                </div>
              )}
            </div>
          )}

          {/* 초기 상태 */}
          {!showMap && !loading && (
            <div className="flex-1 flex flex-col items-center justify-center gap-4 py-10 text-center px-6">
              <div className="w-16 h-16 bg-blue-50 rounded-2xl flex items-center justify-center text-3xl">🗺️</div>
              <div>
                <p className="text-gray-600 font-medium text-sm">민원 위치를 입력하세요</p>
                <p className="text-gray-400 text-xs mt-1 leading-relaxed">
                  주소, IC·JC명 또는 노선명+이정으로 검색하면<br />담당 관리주체를 자동으로 추천합니다
                </p>
              </div>
            </div>
          )}
        </div>

        {/* 지도 */}
        <div className="flex-1 relative bg-gray-200 order-1 lg:order-2 min-h-[40vh] lg:min-h-0">
          {showMap ? (
            <>
              <KakaoMap lat={pinLat} lng={pinLng} onPinMove={handlePinMove} onAddressChange={setPinAddress} />
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 pointer-events-none">
                <div className="bg-black/60 text-white text-xs px-3 py-1.5 rounded-full whitespace-nowrap backdrop-blur-sm flex items-center gap-1.5">
                  <span>📍</span>
                  <span>{isTouch ? '지도를 움직여 핀 위치를 조정하세요' : '핀 드래그 또는 우클릭으로 위치를 보정할 수 있습니다'}</span>
                </div>
              </div>
            </>
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
              <div className="text-7xl opacity-20">🗺️</div>
              <p className="text-sm text-gray-400 opacity-60">주소 검색 후 지도가 표시됩니다</p>
            </div>
          )}
        </div>

      </main>
    </div>
  );
}
