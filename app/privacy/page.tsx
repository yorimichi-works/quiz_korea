import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalPage, LegalSection } from '../legal-page';

export const metadata: Metadata = {
  title: '개인정보 처리방침 | 먼저!',
  description: '먼저!가 수집하고 이용하는 정보와 이용자의 권리를 안내합니다.',
};

export default function PrivacyPage() {
  return <LegalPage title="개인정보 처리방침" description="먼저!의 게임, 계정, 광고 기능에서 처리하는 정보와 선택 방법을 안내합니다.">
    <LegalSection title="1. 처리하는 정보">
      <ul>
        <li>게스트 또는 Google·Apple 연동 계정을 구분하기 위한 Firebase 사용자 식별자</li>
        <li>레이팅, 랭크 포인트, 칭호, 승패와 대전 진행 기록</li>
        <li>오류·문제·이용자 신고에 사용자가 직접 입력한 내용</li>
        <li>서비스 안정성과 부정 이용 방지를 위한 요청 시각, 응답 상태와 대전 이벤트</li>
        <li>퀴즈 타임 배너 표시·클릭과 대전 완료 등 서비스 이용 이벤트</li>
        <li>인증과 서비스 요청 과정에서 자동 처리되는 IP 주소, 브라우저·기기 및 사용자 에이전트 정보</li>
      </ul>
      <p>Google 또는 Apple 연동 시 이메일 주소와 표시 이름을 Firebase Authentication이 처리하며 계정 화면에 표시할 수 있습니다. Apple의 ‘이메일 가리기’를 선택하면 중계 이메일 주소를 사용합니다. 먼저!의 게임 데이터베이스에는 이메일 주소와 계정 표시 이름을 별도로 저장하지 않습니다. 네트워크 정보 역시 게임 전적 데이터베이스에 별도 프로필로 저장하지 않으며, 인증·호스팅 사업자가 보안과 서비스 제공에 필요한 기간 동안 처리할 수 있습니다.</p>
    </LegalSection>
    <LegalSection title="2. 이용 목적">
      <p>계정과 게임 진행의 유지, 실시간 매칭과 승패 판정, 순위 제공, 고객지원, 오류 조사, 부정 이용 방지와 서비스 이용 현황 분석에 사용합니다.</p>
    </LegalSection>
    <LegalSection title="3. 보관과 삭제">
      <p>게임 데이터는 이용자가 계정을 삭제하거나 서비스 제공 목적이 끝날 때까지 보관합니다. 설정의 ‘계정 및 데이터 삭제’를 실행하면 계정 식별자에 연결된 전적, 레이팅, 칭호, 대전 기록과 신고 내역을 삭제합니다. Apple 연동 계정은 iOS 앱에서 본인 확인 후 Apple 인증 토큰을 해지하고 연결된 Firebase 인증 계정도 삭제합니다. 인증·호스팅 사업자의 보안 로그와 백업은 각 사업자의 보관 정책에 따라 처리됩니다. 법령상 보관 의무가 있는 정보는 해당 기간 동안 분리 보관할 수 있습니다.</p>
    </LegalSection>
    <LegalSection title="4. 외부 서비스">
      <p>인증에는 Google Firebase Authentication을 사용하며, iOS 앱의 Apple 로그인에는 Apple의 Sign in with Apple을 사용합니다. iOS 앱은 WKWebView로 게임을 표시합니다. 서비스 제공을 위해 클라우드 호스팅 및 데이터베이스 인프라를 이용합니다. Android 앱은 Trusted Web Activity 또는 Custom Tabs 방식으로 앱 URL을 기기의 웹 브라우저에 전달합니다. 각 사업자와 브라우저는 서비스 제공에 필요한 범위에서 정보를 처리합니다.</p>
    </LegalSection>
    <LegalSection title="5. iOS 앱의 광고와 선택">
      <p>광고를 지원하는 iOS 버전은 Google AdMob의 Google Mobile Ads SDK와 User Messaging Platform(UMP)을 사용합니다. 정상적으로 끝난 대전의 결과 화면에서 홈으로 이동할 때 준비된 광고를 제한된 빈도로 표시하며, 문제를 풀거나 상대와 대전하는 동안에는 표시하지 않습니다. 웹과 광고 기능이 없는 이전 앱 버전에는 이 네이티브 광고 기능이 적용되지 않습니다.</p>
      <p>광고 제공, 광고 실적 측정, 오류 진단과 부정 이용 방지를 위해 Google은 IP 주소와 그로부터 추정한 대략적인 위치, 기기·앱 식별자, 광고 표시·상호작용 정보, 앱 성능과 오류 정보를 처리할 수 있습니다. 먼저!는 게임 계정의 이름, 이메일 주소나 Firebase 사용자 식별자를 광고 요청에 추가하지 않습니다. 광고 관련 정보의 보관과 처리는 Google의 정책도 적용됩니다.</p>
      <p>이 광고 버전은 맞춤 광고를 요청하지 않지만, Google의 광고 SDK가 광고 측정 등에 기기 식별자를 사용할 수 있으므로 광고를 요청하기 전에 iOS의 앱 추적 권한을 확인합니다. 추적을 허용하지 않으면 광고를 생략합니다. 거주 지역에서 필요한 경우 Google의 개인정보 선택 화면도 표시하며, 필요한 선택이 확인된 뒤에만 광고를 요청합니다. 해당 화면은 지역에 따라 영어 등 Google이 지원하는 언어로 표시될 수 있습니다.</p>
      <p>선택 변경이 필요한 경우 앱 설정의 ‘광고 개인정보 설정’에서 Google의 선택 화면을 다시 열 수 있습니다. 필요한 동의가 없거나 광고를 준비하지 못한 경우 광고를 생략하며, 게임 이용은 계속할 수 있습니다. 게임 계정을 삭제하는 것과 Google의 광고 관련 설정 변경은 별개의 절차입니다.</p>
      <p><a href="https://policies.google.com/privacy" target="_blank" rel="noreferrer">Google 개인정보처리방침</a> · <a href="https://policies.google.com/technologies/ads" target="_blank" rel="noreferrer">Google 광고 정보</a></p>
    </LegalSection>
    <LegalSection title="6. 이용자의 권리">
      <p>이용자는 앱 설정에서 로그아웃하거나 계정과 데이터를 삭제할 수 있습니다. 로그아웃만으로는 계정이나 저장 데이터가 삭제되지 않습니다. 그 밖의 열람·정정·삭제 문의는 <Link href="/support">고객지원</Link>을 이용해 주세요.</p>
    </LegalSection>
    <LegalSection title="7. 아동의 이용">
      <p>거주 국가의 법률상 보호자 동의가 필요한 이용자는 보호자의 동의를 받아야 합니다. 보호자는 고객지원을 통해 관련 정보의 삭제를 요청할 수 있습니다.</p>
    </LegalSection>
    <LegalSection title="8. 변경 안내">
      <p>중요한 변경이 있을 경우 적용 전에 서비스 화면 또는 이 페이지에서 알립니다.</p>
    </LegalSection>
  </LegalPage>;
}
