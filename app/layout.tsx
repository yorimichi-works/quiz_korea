import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Quiz Battle — 빠른 대전',
  description:
    '한국어 문제를 먼저 읽고 버튼을 눌러 최대 20라운드에서 5문제 선취를 노리는 1대1 실시간 퀴즈 배틀 프로토타입.',
  openGraph: {
    title: 'Quiz Battle — 빠른 대전',
    description: '5문제 선취 · 최대 20라운드의 1대1 실시간 퀴즈 배틀',
    images: ['https://quiz-korea-battle.syamo.chatgpt.site/og.png'],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Quiz Battle — 빠른 대전',
    description: '5문제 선취 · 최대 20라운드의 1대1 실시간 퀴즈 배틀',
    images: ['https://quiz-korea-battle.syamo.chatgpt.site/og.png'],
  },
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
