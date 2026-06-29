'use client';

import { useState, useCallback, useEffect } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';

const KakaoMap = dynamic(() => import('@/components/KakaoMap'), { ssr: false });

interface RoadCandidate {
  type: string;
  routeNo: string;
  routeName: string;
  agency: string;
  agencyFull: string;
  distanceM: number;
}

interface Recommendation {
  agency: string;
  agencyFull: string;
  roadType: string;
  routeName: string;
  confidence: '높음' | '보통' | '낮음';
  reason: string;
  distanceM: number;
}

interface AnalysisResult {
  candidates: RoadCandidate[];
  recommendation: Recommendation | null;
  altCandidates: RoadCandidate[];
}

const DEFAULT_LAT = 37.5665;
const DEFAULT_LNG = 126.9784;

export default function Home() {
  const [address, setAddress] = useState('');
  const [pinLat, setPinLat] = useState(DEFAULT_LAT);
  const [pinLng, setPinLng] = useState(DEFAULT_LNG);
  const [showMap, setShowMap] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [pinAddress, setPinAddress] = useState<{ road: string; jibun: string } | null>(null);
  const [agencyPhone, setAgencyPhone] = useState<string | null>(null);
  const [agencyAddress, setAgencyAddress] = useState<string | null>(null);

  useEffect(() => {
    const agencyFull = result?.recommendation?.agencyFull;
    if (!agencyFull) { setAgencyPhone(null); setAgencyAddress(null); return; }

    const kakao = (window as any).kakao;
    if (!kakao?.maps?.services?.Places) return;

    const ps = new kakao.maps.services.Places();
    ps.keywordSearch(agencyFull, (data: any[], status: string) => {
      if (status === kakao.maps.services.Status.OK && data[0]) {
        setAgencyPhone(data[0].phone || null);
        setAgencyAddress(data[0].road_address_name || data[0].address_name || null);
      } else {
        setAgencyPhone(null);
        setAgencyAddress(null);
      }
    }, { size: 1 });
  }, [result?.recommendation?.agencyFull]);

  const analyze = useCallback(async (lat: number, lng: number, addr?: string) => {
    setLoading(true);
    setResult(null);
    try {
      const params = new URLSearchParams({ lat: String(lat), lng: String(lng) });
      if (addr) params.set('address', addr);
      const res = await fetch(`/api/analyze?${params}`);
      const data = await res.json();
      setResult(data);
    } catch {
      setError('분석 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  }, []);

  const handleSearch = async () => {
    if (!address.trim()) return;
    setError('');
    setLoading(true);
    try {
      const res = await fetch(`/api/geocode?query=${encodeURIComponent(address)}`);
      const data = await res.json();
      const doc = data.documents?.[0];
      if (!doc) { setError('주소를 찾을 수 없습니다.'); setLoading(false); return; }
      const lat = parseFloat(doc.y);
      const lng = parseFloat(doc.x);
      setPinLat(lat);
      setPinLng(lng);
      setShowMap(true);
      await analyze(lat, lng, address.trim());
    } catch {
      setError('주소 검색 중 오류가 발생했습니다.');
      setLoading(false);
    }
  };

  const handlePinMove = useCallback((lat: number, lng: number) => {
    setPinLat(lat);
    setPinLng(lng);
    analyze(lat, lng);
  }, [analyze]);

  const rec = result?.recommendation;
  const isPrivate = rec && !rec.agencyFull.startsWith('한국도로공사');

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">

      {/* 헤더 */}
      <header className="bg-[#0d2d6b] text-white px-4 py-2 flex items-center justify-between shadow-lg z-10 shrink-0">
        <div className="flex items-center gap-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/ex-logo.png" alt="EX" style={{ height: '13px', width: 'auto', flexShrink: 0 }} />
          <div>
            <h1 className="font-bold leading-tight tracking-tight" style={{ fontSize: '14.6px' }}>
              도로 관리주체 확인앱{' '}
              <span className="text-blue-200 font-normal" style={{ fontSize: '11px' }}>(한국도로공사 전북본부 제작)</span>
            </h1>
          </div>
        </div>
        <Link href="/feedback" className="bg-yellow-400 hover:bg-yellow-300 text-[#0d2d6b] text-xs font-bold px-3 py-1.5 rounded-full transition-colors shrink-0 whitespace-nowrap shadow-sm">
          🚨 오류 신고하기
        </Link>
      </header>

      <main className="flex-1 flex flex-col lg:flex-row overflow-hidden" style={{ height: 'calc(100vh - 56px)' }}>

        {/* 좌측 패널 */}
        <div className="w-full lg:w-[380px] shrink-0 flex flex-col bg-white shadow-md z-10 overflow-y-auto order-2 lg:order-1 max-h-[45vh] lg:max-h-full">

          {/* 검색 */}
          <div className="p-4 border-b border-gray-100">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2">민원발생 지명 또는 주소</p>
            <div className="flex gap-2">
              <input
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                placeholder="주소 또는 IC·JC 명칭 입력"
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
                  <p className="text-gray-400">📍 핀을 드래그하면 위치를 보정할 수 있습니다</p>
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
                    {/* 기관명 */}
                    <p className="text-xl font-bold text-gray-900 leading-snug">{rec.agencyFull}</p>

                    {/* 전화번호 — 기관명 바로 아래 강조 */}
                    {agencyPhone && (
                      <a
                        href={`tel:${agencyPhone}`}
                        className="mt-2 inline-flex items-center gap-2 text-lg font-bold text-blue-700 hover:text-blue-900 transition-colors"
                      >
                        <span>📞</span>
                        <span>{agencyPhone}</span>
                      </a>
                    )}

                    {/* 구분선 */}
                    <div className="mt-3 pt-3 border-t border-black/10 space-y-1.5">
                      {/* 노선 + 이정 */}
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-xs px-2 py-0.5 rounded-md font-medium ${
                          rec.roadType === '고속국도' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'
                        }`}>
                          {rec.roadType}
                        </span>
                        <span className="text-sm text-gray-700 font-medium">
                          {rec.routeName.replace(/\(.*?\)/, '').trim()}
                        </span>
                        <span className="text-sm font-bold text-gray-900">
                          {rec.routeName.match(/\(([^)]+)\)/)?.[1]} 지점
                        </span>
                      </div>

                      {/* 주소 */}
                      {agencyAddress && (
                        <p className="flex items-start gap-1.5 text-xs text-gray-400">
                          <span className="shrink-0">📍</span>
                          <span>{agencyAddress}</span>
                        </p>
                      )}

                      {/* 이격 경고 — 200m 초과 시만 */}
                      {rec.distanceM > 200 && (
                        <p className="flex items-center gap-1.5 text-xs text-amber-600 font-medium">
                          <span>⚠️</span>
                          <span>
                            핀이 관리노선에서{' '}
                            {rec.distanceM >= 1000
                              ? `${(rec.distanceM / 1000).toFixed(1)}km`
                              : `${Math.round(rec.distanceM)}m`} 떨어져 있습니다
                          </span>
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center gap-3 py-8 text-center">
                  <div className="text-4xl">🔍</div>
                  <p className="text-gray-500 text-sm font-medium">주변 500m 내 도로 정보 없음</p>
                  <p className="text-gray-400 text-xs">핀을 이동하거나 주소를 재검색해 주세요</p>
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
                  주소 또는 IC·JC 이름으로 검색하면<br />담당 관리주체를 자동으로 추천합니다
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
                  <span>핀 드래그 또는 우클릭으로 위치를 보정할 수 있습니다</span>
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
