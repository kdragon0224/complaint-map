'use client';

import { useEffect, useRef } from 'react';

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
    if (window.kakao?.maps) { resolve(); return; }
    const existing = document.getElementById('kakao-map-sdk');
    if (existing) {
      const check = setInterval(() => {
        if (window.kakao?.maps) { clearInterval(check); resolve(); }
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
  const mapRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const onPinMoveRef = useRef(onPinMove);
  const onAddressChangeRef = useRef(onAddressChange);
  onPinMoveRef.current = onPinMove;
  onAddressChangeRef.current = onAddressChange;

  useEffect(() => {
    if (!containerRef.current) return;
    const appKey = process.env.NEXT_PUBLIC_KAKAO_MAP_KEY || '';
    if (!appKey || appKey === 'YOUR_KAKAO_JS_KEY') return;

    loadKakaoScript(appKey).then(() => {
      if (!containerRef.current) return;
      const { kakao } = window;
      const center = new kakao.maps.LatLng(lat, lng);

      if (!mapRef.current) {
        mapRef.current = new kakao.maps.Map(containerRef.current, { center, level: 4 });
        mapRef.current.relayout();
        kakao.maps.event.addListener(mapRef.current, 'rightclick', (e: any) => {
          const latlng = e.latLng;
          markerRef.current?.setPosition(latlng);
          onPinMoveRef.current?.(latlng.getLat(), latlng.getLng());
          reverseGeocode(kakao, latlng.getLat(), latlng.getLng(), (addr) => {
            onAddressChangeRef.current?.(addr);
          });
        });
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

  return <div ref={containerRef} className="absolute inset-0" />;
}
