import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalPage, LegalSection } from '../legal-page';

export const metadata: Metadata = {
  title: '이용약관 | 먼저!',
  description: '먼저! 실시간 퀴즈 서비스의 이용 조건을 안내합니다.',
};

export default function TermsPage() {
  return <LegalPage title="이용약관" description="먼저!를 공정하고 즐겁게 이용하기 위한 기본 조건입니다.">
    <LegalSection title="1. 서비스">
      <p>먼저!는 게스트 또는 Google 연동 계정으로 이용하는 실시간 1대1 퀴즈, 레이팅, 랭킹, 칭호와 관련 기능을 제공합니다. 운영상 필요한 경우 기능과 문제 구성을 변경할 수 있습니다.</p>
    </LegalSection>
    <LegalSection title="2. 계정과 데이터">
      <p>게스트 계정은 브라우저 데이터 삭제나 기기 변경 시 복구되지 않을 수 있습니다. Google 연동 후에는 지원되는 범위에서 진행 데이터를 이어서 이용할 수 있습니다. 이용자는 설정에서 계정과 데이터를 삭제할 수 있습니다.</p>
    </LegalSection>
    <LegalSection title="3. 금지 행위">
      <ul>
        <li>자동 입력, 통신 조작, 정답 추출 등 공정한 대전을 방해하는 행위</li>
        <li>다른 이용자를 괴롭히거나 서비스 운영을 방해하는 행위</li>
        <li>취약점 악용, 비정상 요청, 계정·데이터의 무단 접근</li>
        <li>법령 또는 타인의 권리를 침해하는 행위</li>
      </ul>
    </LegalSection>
    <LegalSection title="4. 레이팅과 운영 조치">
      <p>레이팅과 랭킹은 게임 규칙에 따라 산정되며, 오류·부정 이용·무효 경기가 확인되면 정정될 수 있습니다. 중대한 위반이 있으면 매칭 제한, 기록 조정 또는 이용 제한을 적용할 수 있습니다.</p>
    </LegalSection>
    <LegalSection title="5. 문제와 신고">
      <p>문제의 오류나 부적절한 내용은 앱의 신고 기능으로 알려주세요. 확인 후 수정 또는 비공개 처리할 수 있습니다.</p>
    </LegalSection>
    <LegalSection title="6. 서비스 중단과 책임">
      <p>점검, 통신 장애, 재난 등 불가피한 사유로 서비스가 일시 중단될 수 있습니다. 운영팀은 고의 또는 중대한 과실이 없는 한 무료 서비스 이용 중 발생한 간접 손해에 책임을 지지 않습니다.</p>
    </LegalSection>
    <LegalSection title="7. 문의와 준거">
      <p>문의는 <Link href="/support">고객지원</Link>에서 접수합니다. 본 약관은 대한민국 법령을 기준으로 해석합니다.</p>
    </LegalSection>
  </LegalPage>;
}
