import type { Metadata } from 'next';
import './globals.css';

const siteUrl = 'https://meonjeo.syamo.chatgpt.site';
const title = '먼저! — 실시간 1대1 버저 퀴즈';
const description = '알았다면, 먼저 눌러라. 문제를 먼저 알아채고 누르는 한국어 1대1 실시간 버저 퀴즈.';

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  applicationName: '먼저!',
  title,
  description,
  openGraph: {
    title,
    description,
    type: 'website',
    locale: 'ko_KR',
    url: siteUrl,
    siteName: '먼저!',
    images: [{ url: '/og.png', width: 1200, height: 630, alt: '먼저! 실시간 1대1 버저 퀴즈' }],
  },
  twitter: {
    card: 'summary_large_image',
    title,
    description,
    images: ['/og.png'],
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
