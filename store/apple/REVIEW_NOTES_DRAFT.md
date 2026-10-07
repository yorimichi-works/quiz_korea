# App Review notes draft

**Do not submit until the advertising build, consent setup and production services pass the device test plan.** Owner-approved contact fields are saved privately in App Store Connect; do not copy personal contact information, credentials, or unverified test claims here.

## English reviewer notes (draft)

Meonjeo! is a Korean-language, real-time, one-to-one buzzer quiz game. Players compete to reach five correct answers or exhaust the opponent's lives. The backend decides buzzer order, answers and match results.

Core play is available as a guest; no sign-in credentials are required for guest access. On the home screen, tap “온라인 매치” to join matchmaking. A second connected player is required to complete a match. Before submission, we will verify reviewer access and arrange an appropriate multiplayer test window if needed.

On iOS, Settings (“설정”) offers “Apple로 계속하기” to retain progress. The native iOS app uses Sign in with Apple and Firebase Authentication. Account deletion is accessible in Settings → “계정 및 데이터 삭제”; Apple-linked users reauthenticate and revoke their Apple authorization during deletion.

The app also uses a native share sheet, haptic feedback, persistent web session, network-status display and pull-to-refresh. The game is hosted at https://meonjeo.syamo.chatgpt.site and requires an internet connection. It has no in-app purchases.

The advertising release uses a native AdMob interstitial only when leaving a normally completed live match for Home. It never interrupts questions or matchmaking. The initial policy requires at least three normal completed matches and a 180-second interval; an unavailable ad is skipped. ATT authorization and the applicable Google UMP consent state are required before advertising requests. Declining tracking skips ads and preserves core gameplay. Settings includes advertising privacy options when required. The console consent configuration and device behavior must be verified before this draft is submitted.

Support: https://meonjeo.syamo.chatgpt.site/support
Privacy: https://meonjeo.syamo.chatgpt.site/privacy
Deletion instructions: https://meonjeo.syamo.chatgpt.site/account-deletion

## Before copying into App Store Connect

- Replace the multiplayer-access sentence with a verified, practical reviewer procedure
- Confirm the final TestFlight build exposes every feature above
- Recheck the privately saved, owner-approved reviewer contact fields
- Recheck “Sign-in required” against actual guest access; provide a safe review account only if a required feature needs it
- Keep submission on manual release if the owner has not authorized immediate automatic publication
- Check current 4.2 minimum-functionality guidance; native share/haptics alone do not guarantee approval
- Never put Apple ID passwords, one-time codes, signing material, or API tokens into these notes
