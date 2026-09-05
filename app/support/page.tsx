import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalPage, LegalSection } from '../legal-page';

export const metadata: Metadata = {
  title: '고객지원 | 먼저!',
  description: '먼저! 문제 신고, 오류 제보와 계정 관련 지원 안내입니다.',
};

export default function SupportPage() {
  return <LegalPage title="고객지원" description="문제 오류, 대전 문제, 계정과 개인정보 문의를 운영팀에 보낼 수 있습니다.">
    <div className="legal-actions">
      <Link className="legal-primary" href="/game.html?support=1">앱에서 문의 보내기</Link>
      <Link className="legal-secondary" href="/account-deletion">계정 삭제 안내</Link>
    </div>
    <LegalSection title="문의할 때 알려주면 좋은 정보">
      <ul>
        <li>문제가 발생한 대략적인 시각과 화면</li>
        <li>문제 문구 또는 대전 상황</li>
        <li>재현 순서와 기대했던 동작</li>
      </ul>
      <p>비밀번호, 인증 코드, 결제 정보 등 민감한 정보는 보내지 마세요.</p>
    </LegalSection>
    <LegalSection title="신고 처리">
      <p>앱에서 전송한 신고는 운영 데이터베이스에 안전하게 저장됩니다. 접수 내용을 검토해 문제 수정, 기록 확인 또는 필요한 운영 조치를 진행합니다.</p>
    </LegalSection>
  </LegalPage>;
}
