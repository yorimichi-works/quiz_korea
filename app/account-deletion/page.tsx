import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalPage, LegalSection } from '../legal-page';

export const metadata: Metadata = {
  title: '계정 및 데이터 삭제 | 먼저!',
  description: '먼저! 계정과 연결된 게임 데이터를 직접 삭제하는 방법입니다.',
};

export default function AccountDeletionPage() {
  return <LegalPage title="계정 및 데이터 삭제" description="앱 안에서 계정과 연결된 데이터를 즉시 삭제할 수 있습니다.">
    <div className="legal-actions">
      <Link className="legal-danger" href="/game.html?account=delete">계정 삭제 화면 열기</Link>
      <Link className="legal-secondary" href="/support">삭제 관련 문의</Link>
    </div>
    <LegalSection title="삭제되는 정보">
      <ul>
        <li>게스트 또는 Google 연동 Firebase 계정</li>
        <li>레이팅, 랭크 포인트, 칭호와 전적</li>
        <li>매칭 대기, 대전 기록, 대전 이벤트와 세션</li>
        <li>계정에 연결된 신고 및 퀴즈 타임 기록</li>
      </ul>
    </LegalSection>
    <LegalSection title="삭제 방법">
      <ol>
        <li>위의 ‘계정 삭제 화면 열기’를 누릅니다.</li>
        <li>삭제되는 내용을 확인하고 체크합니다.</li>
        <li>‘완전히 삭제’를 누릅니다. Google 계정은 본인 확인 창이 다시 열릴 수 있습니다.</li>
      </ol>
      <p>삭제는 되돌릴 수 없습니다. Google 자체 계정은 삭제되지 않으며, 먼저!에 연결된 인증 계정과 게임 데이터만 삭제됩니다.</p>
    </LegalSection>
  </LegalPage>;
}
