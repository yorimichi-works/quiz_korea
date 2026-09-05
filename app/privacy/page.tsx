import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalPage, LegalSection } from '../legal-page';

export const metadata: Metadata = {
  title: '개인정보 처리방침 | 먼저!',
  description: '먼저!가 수집하고 이용하는 정보와 이용자의 권리를 안내합니다.',
};

export default function PrivacyPage() {
  return <LegalPage title="개인정보 처리방침" description="먼저!는 실시간 퀴즈 대전을 제공하는 데 필요한 최소한의 정보만 처리합니다.">
    <LegalSection title="1. 처리하는 정보">
      <ul>
        <li>게스트 또는 Google 연동 계정을 구분하기 위한 Firebase 사용자 식별자</li>
        <li>레이팅, 랭크 포인트, 칭호, 승패와 대전 진행 기록</li>
        <li>오류·문제·이용자 신고에 사용자가 직접 입력한 내용</li>
        <li>서비스 안정성과 부정 이용 방지를 위한 요청 시각, 응답 상태와 대전 이벤트</li>
        <li>인증과 서비스 요청 과정에서 자동 처리되는 IP 주소, 브라우저·기기 및 사용자 에이전트 정보</li>
      </ul>
      <p>Google 이메일과 표시 이름은 계정 화면에 표시될 수 있으나, 먼저!의 게임 데이터베이스에는 별도로 저장하지 않습니다. 네트워크 정보 역시 게임 전적 데이터베이스에 별도 프로필로 저장하지 않으며, 인증·호스팅 사업자가 보안과 서비스 제공에 필요한 기간 동안 처리할 수 있습니다.</p>
    </LegalSection>
    <LegalSection title="2. 이용 목적">
      <p>계정과 게임 진행의 유지, 실시간 매칭과 승패 판정, 순위 제공, 고객지원, 오류 조사, 부정 이용 방지에 사용합니다.</p>
    </LegalSection>
    <LegalSection title="3. 보관과 삭제">
      <p>게임 데이터는 이용자가 계정을 삭제하거나 서비스 제공 목적이 끝날 때까지 보관합니다. 설정의 ‘계정 및 데이터 삭제’를 실행하면 계정 식별자에 연결된 전적, 레이팅, 칭호, 대전 기록과 신고 내역을 삭제합니다. 법령상 보관 의무가 있는 정보는 해당 기간 동안 분리 보관할 수 있습니다.</p>
    </LegalSection>
    <LegalSection title="4. 외부 서비스">
      <p>인증에는 Google Firebase Authentication을 사용하며, 서비스 제공을 위해 클라우드 호스팅 및 데이터베이스 인프라를 이용합니다. Android 앱은 Trusted Web Activity 또는 Custom Tabs 방식으로 앱 URL을 기기의 웹 브라우저에 전달합니다. 각 사업자와 브라우저는 서비스 제공에 필요한 범위에서 정보를 처리합니다.</p>
    </LegalSection>
    <LegalSection title="5. 이용자의 권리">
      <p>이용자는 앱 설정에서 계정 연동을 해제하거나 계정과 데이터를 삭제할 수 있습니다. 그 밖의 열람·정정·삭제 문의는 <Link href="/support">고객지원</Link>을 이용해 주세요.</p>
    </LegalSection>
    <LegalSection title="6. 아동의 이용">
      <p>거주 국가의 법률상 보호자 동의가 필요한 이용자는 보호자의 동의를 받아야 합니다. 보호자는 고객지원을 통해 관련 정보의 삭제를 요청할 수 있습니다.</p>
    </LegalSection>
    <LegalSection title="7. 변경 안내">
      <p>중요한 변경이 있을 경우 적용 전에 서비스 화면 또는 이 페이지에서 알립니다.</p>
    </LegalSection>
  </LegalPage>;
}
