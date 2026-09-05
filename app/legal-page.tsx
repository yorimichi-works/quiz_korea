import type { ReactNode } from 'react';
import Link from 'next/link';

export function LegalPage({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <main className="legal-page">
      <header className="legal-header">
        <Link className="legal-brand" href="/">먼저!</Link>
        <Link className="legal-back" href="/">게임으로 돌아가기</Link>
      </header>
      <article className="legal-card">
        <p className="legal-kicker">MEONJEO · PLAYER SAFETY</p>
        <h1>{title}</h1>
        <p className="legal-lead">{description}</p>
        {children}
        <p className="legal-updated">시행일: 2026년 9월 5일 · 운영: 먼저! 운영팀</p>
      </article>
      <nav className="legal-nav" aria-label="정책 및 지원">
        <Link href="/privacy">개인정보 처리방침</Link>
        <Link href="/terms">이용약관</Link>
        <Link href="/support">고객지원</Link>
        <Link href="/account-deletion">계정 삭제</Link>
      </nav>
    </main>
  );
}

export function LegalSection({ title, children }: { title: string; children: ReactNode }) {
  return <section className="legal-section"><h2>{title}</h2>{children}</section>;
}
