'use client';

import { useEffect, useRef, useState } from 'react';
import { isCoarsePointer } from '@/lib/device';

interface AddressInfo {
  road: string;
  jibun: string;
}

interface Props {
  lat: number;
  lng: number;
  onPinMove?: (lat: number, lng: number) => void;
  onAddressChange?: (info: AddressInfo) => void;
}

declare global {
  interface Window {
    kakao: any;
  }
}

function loadKakaoScript(appKey: string): Promise<void> {
  return new Promise((resolve) => {
    // LatLng 클래스까지 준비되어야 완전 로드 (maps 객체만으로는 미완성일 수 있음)
    if (window.kakao?.maps?.LatLng) { resolve(); return; }
    if (window.kakao?.maps?.load) { window.kakao.maps.load(() => resolve()); return; }
    const existing = document.getElementById('kakao-map-sdk');
    if (existing) {
      const check = setInterval(() => {
        if (window.kakao?.maps?.LatLng) { clearInterval(check); resolve(); }
        else if (window.kakao?.maps?.load) { clearInterval(check); window.kakao.maps.load(() => resolve()); }
      }, 100);
      return;
    }
    const script = document.createElement('script');
    script.id = 'kakao-map-sdk';
    script.src = `//dapi.kakao.com/v2/maps/sdk.js?appkey=${appKey}&libraries=services&autoload=false`;
    script.onload = () => {
      window.kakao.maps.load(() => resolve());
    };
    document.head.appendChild(script);
  });
}

function reverseGeocode(kakao: any, lat: number, lng: number, cb: (info: { road: string; jibun: string }) => void) {
  const geocoder = new kakao.maps.services.Geocoder();
  geocoder.coord2Address(lng, lat, (result: any[], status: string) => {
    if (status === kakao.maps.services.Status.OK && result[0]) {
      cb({
        road: result[0].road_address?.address_name || '',
        jibun: result[0].address?.address_name || '',
      });
    }
  });
}

export default function KakaoMap({ lat, lng, onPinMove, onAddressChange }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const pinRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const touchInitRef = useRef(false);
  const draggingRef = useRef(false);
  const touchActiveRef = useRef(false);
  const onPinMoveRef = useRef(onPinMove);
  const onAddressChangeRef = useRef(onAddressChange);
  onPinMoveRef.current = onPinMove;
  onAddressChangeRef.current = onAddressChange;

  // 중앙 고정핀 오버레이 표시 여부 (터치 기기)
  const [centerPinMode, setCenterPinMode] = useState(false);
  useEffect(() => { setCenterPinMode(isCoarsePointer()); }, []);

  useEffect(() => {
    if (!containerRef.current) return;
    const appKey = process.env.NEXT_PUBLIC_KAKAO_MAP_KEY || '';
    if (!appKey || appKey === 'YOUR_KAKAO_JS_KEY') return;

    loadKakaoScript(appKey).then(() => {
      if (!containerRef.current) return;
      const { kakao } = window;
      const center = new kakao.maps.LatLng(lat, lng);
      const touchMode = isCoarsePointer();

      if (!mapRef.current) {
        mapRef.current = new kakao.maps.Map(containerRef.current, { center, level: 4 });
        mapRef.current.relayout();

        if (touchMode) {
          // 모바일: 지도를 움직여 중앙 고정핀으로 위치 지정
          // 카카오의 dragstart/dragend/idle 순서는 신뢰할 수 없음 — 연속된 터치 중 잠깐
          // 멈칫하면 손가락이 안 떨어졌는데도 내부적으로 드래그가 "끝난" 것처럼 이벤트가 뜨기도 함.
          // → 카카오 이벤트 대신 실제 브라우저 touchstart/touchend로 손가락이 화면에
          //   닿아있는지 직접 추적하고, "손을 뗀 뒤에 뜨는 idle"만 최종 위치로 확정한다.
          containerRef.current.addEventListener('touchstart', () => { touchActiveRef.current = true; }, { passive: true });
          containerRef.current.addEventListener('touchend', () => { touchActiveRef.current = false; }, { passive: true });
          containerRef.current.addEventListener('touchcancel', () => { touchActiveRef.current = false; }, { passive: true });

          kakao.maps.event.addListener(mapRef.current, 'dragstart', () => {
            draggingRef.current = true;
            if (pinRef.current) pinRef.current.style.transform = 'translate(-50%, -100%) translateY(-8px)';
          });
          kakao.maps.event.addListener(mapRef.current, 'idle', () => {
            if (!draggingRef.current) return;
            if (touchActiveRef.current) return; // 아직 손가락이 화면에 닿아있음 — 최종 위치 아님
            draggingRef.current = false;
            if (pinRef.current) pinRef.current.style.transform = 'translate(-50%, -100%)';
            const c = mapRef.current.getCenter();
            onPinMoveRef.current?.(c.getLat(), c.getLng());
            reverseGeocode(kakao, c.getLat(), c.getLng(), (addr) => {
              onAddressChangeRef.current?.(addr);
            });
          });
        } else {
          // PC: 우클릭으로 핀 이동
          kakao.maps.event.addListener(mapRef.current, 'rightclick', (e: any) => {
            const latlng = e.latLng;
            markerRef.current?.setPosition(latlng);
            onPinMoveRef.current?.(latlng.getLat(), latlng.getLng());
            reverseGeocode(kakao, latlng.getLat(), latlng.getLng(), (addr) => {
              onAddressChangeRef.current?.(addr);
            });
          });
        }
      }

      if (touchMode) {
        // 중앙 고정핀 모드: 마커 없이 지도 중심만 이동
        // 드래그 직후에는 지도 중심 == 새 좌표이므로 재조회 생략 (중복 방지)
        const cur = mapRef.current.getCenter();
        const moved = Math.abs(cur.getLat() - lat) > 1e-7 || Math.abs(cur.getLng() - lng) > 1e-7;
        if (moved || !touchInitRef.current) {
          touchInitRef.current = true;
          if (moved) mapRef.current.setCenter(center);
          reverseGeocode(kakao, lat, lng, (addr) => {
            onAddressChangeRef.current?.(addr);
          });
        }
        return;
      }

      if (!markerRef.current) {
        markerRef.current = new kakao.maps.Marker({ position: center, draggable: true });
        markerRef.current.setMap(mapRef.current);
        kakao.maps.event.addListener(markerRef.current, 'dragend', () => {
          const pos = markerRef.current.getPosition();
          onPinMoveRef.current?.(pos.getLat(), pos.getLng());
          reverseGeocode(kakao, pos.getLat(), pos.getLng(), (addr) => {
            onAddressChangeRef.current?.(addr);
          });
        });
        // 초기 위치 주소
        reverseGeocode(kakao, lat, lng, (addr) => {
          onAddressChangeRef.current?.(addr);
        });
      } else {
        markerRef.current.setPosition(center);
        mapRef.current.setCenter(center);
        reverseGeocode(kakao, lat, lng, (addr) => {
          onAddressChangeRef.current?.(addr);
        });
      }
    });
  }, [lat, lng]);

  return (
    <div className="absolute inset-0">
      <div ref={containerRef} className="absolute inset-0" />
      {centerPinMode && (
        <div
          ref={pinRef}
          className="absolute left-1/2 top-1/2 z-10 pointer-events-none transition-transform duration-150"
          style={{ transform: 'translate(-50%, -100%)' }}
        >
          {/* 핀 꼭짓점이 지도 중앙에 오도록 배치 */}
          <svg width="36" height="46" viewBox="0 0 36 46" fill="none">
            <path
              d="M18 0C8.06 0 0 8.06 0 18c0 12.3 15.02 26.4 16.66 27.9a2 2 0 0 0 2.68 0C20.98 44.4 36 30.3 36 18 36 8.06 27.94 0 18 0Z"
              fill="#0d2d6b"
            />
            <circle cx="18" cy="18" r="7" fill="white" />
          </svg>
          {/* 중앙 지점 그림자 */}
          <div className="absolute left-1/2 -translate-x-1/2 -bottom-1 w-3 h-1.5 bg-black/25 rounded-full blur-[1px]" />
        </div>
      )}
    </div>
  );
}
