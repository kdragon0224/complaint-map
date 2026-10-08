'use client';

import { useEffect, useState } from 'react';

// 홍보(사용법) 영상 팝업. 영상은 소리가 없다. 화면이 세로로 긴 기기(휴대폰)면 세로형, 아니면 가로형을 보여준다.
// 파일: public/videos/promo-{portrait,landscape}.mp4 (원본을 1280px/720px 폭으로 재압축한 것, 원본은 NAS 보관)

interface Props {
  onClose: () => void;
}

export default function PromoVideoModal({ onClose }: Props) {
  const [portrait, setPortrait] = useState<boolean | null>(null);

  useEffect(() => {
    setPortrait(window.matchMedia('(max-width: 767px)').matches);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const kind = portrait ? 'portrait' : 'landscape';

  return (
    <div
      className="fixed inset-0 z-[1000] bg-black/70 flex items-center justify-center p-3"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="사용법 영상"
    >
      <div
        className="bg-white rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-full"
        style={{ width: portrait ? 'min(92vw, 360px)' : 'min(94vw, 960px)' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-2.5 bg-[#0d2d6b] text-white shrink-0">
          <span className="text-sm font-bold">▶ 사용법 영상 (약 1분)</span>
          <button
            onClick={onClose}
            className="text-white/80 hover:text-white text-xl leading-none px-1"
            aria-label="닫기"
          >
            ✕
          </button>
        </div>
        {portrait !== null && (
          <video
            key={kind}
            src={`/videos/promo-${kind}.mp4`}
            poster={`/videos/promo-${kind}.jpg`}
            controls
            autoPlay
            muted
            playsInline
            preload="metadata"
            className="w-full bg-black min-h-0"
            style={{ maxHeight: '78vh' }}
          />
        )}
        <p className="text-[11px] text-gray-500 text-center py-1.5 shrink-0">소리 없는 영상입니다</p>
      </div>
    </div>
  );
}
