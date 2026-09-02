import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Quiz Battle — 빠른 대전',
  description:
    '한국어 문제를 먼저 읽고 버튼을 눌러 5문제 선취를 노리는 1대1 실시간 퀴즈 배틀 프로토타입.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
