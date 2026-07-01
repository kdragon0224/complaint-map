import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "도로 관리주체 확인앱",
  description: "민원 위치를 입력하면 담당 도로 관리주체(한국도로공사 지사 또는 민자도로 운영사)와 연락처를 자동으로 안내합니다.",
  openGraph: {
    title: "도로 관리주체 확인앱",
    description: "민원 위치를 입력하면 담당 도로 관리주체와 연락처를 자동으로 안내합니다.",
    siteName: "한국도로공사 전북본부",
    locale: "ko_KR",
    type: "website",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const kakaoKey = process.env.NEXT_PUBLIC_KAKAO_MAP_KEY || '';
  return (
    <html lang="ko" className="h-full">
      <head>
        {kakaoKey && kakaoKey !== 'YOUR_KAKAO_JS_KEY' && (
          <script
            id="kakao-map-sdk"
            type="text/javascript"
            src={`//dapi.kakao.com/v2/maps/sdk.js?appkey=${kakaoKey}&libraries=services&autoload=false`}
            async
          />
        )}
      </head>
      <body className="h-full bg-gray-50">{children}</body>
    </html>
  );
}
