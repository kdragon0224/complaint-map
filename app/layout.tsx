import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "스마트 민원배부 지도",
  description: "민원 위치 기반 도로 관리주체 추천 시스템",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const kakaoKey = process.env.NEXT_PUBLIC_KAKAO_MAP_KEY || '';
  return (
    <html lang="ko" className="h-full">
      <head>
        {kakaoKey && kakaoKey !== 'YOUR_KAKAO_JS_KEY' && (
          <script
            type="text/javascript"
            src={`//dapi.kakao.com/v2/maps/sdk.js?appkey=${kakaoKey}&libraries=services`}
          />
        )}
      </head>
      <body className="h-full bg-gray-50">{children}</body>
    </html>
  );
}
