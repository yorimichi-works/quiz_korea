# Owner-only advertising test build 3

Verified checkpoint: 2026-10-07 05:50 UTC. This is an internal test release; production ad serving and final App Review remain disabled.

- App: 먼저!, bundle `com.yorimichiworks.meonjeo`, version `1.0.0 (3)`
- Signed source commit: `2b65007fcce47eed2acef2e04a3bfb067c4bebe3`
- [Final source CI](https://github.com/yorimichi-works/quiz_korea/actions/runs/37576139511): all four jobs passed; 210 JavaScript/contract tests, 21 Swift tests in each Debug/Release/AdTesting mode, Simulator build and launch, device arm64 archive and separate AdTesting products
- [Signed build](https://codemagic.io/app/6ac58fdc25a3667d1df1ff62/build/6ac5d9e47394575b200be716): finished in 3m 42s using the existing approved certificate and provisioning profile
- Signed IPA SHA-256: `bf1deeb1ea463c40e45d9919b8e14b8d373c9a94cc89ddca7c88899999ceaa7b`
- Expanded signed-bundle validation passed with `advertising_mode: ad-testing` and `test_ads_only: true`; test unit only, registered Monjo App ID and production gate false were enforced
- Apple upload succeeded at 05:38:19 UTC. Apple processing completed. Build 3 is marked internal and testing in `Monjo Owner QA`; exactly one owner tester and one build, automatic future-build distribution disabled. The owner's tester status was reloaded and confirmed invited. Installation or a test session has not been observed

## Published prerequisites

- [Web and privacy policy](https://meonjeo.syamo.chatgpt.site/privacy): Sites version37, source `d4bbeef86d870839e7f1bda8bb20132c691bab6a`, published successfully. The approved advertising-recipient paragraph matches the compiled Worker, and all changed static deployment assets match the candidate
- Automated anonymous policy-body retrieval was blocked with HTTP403/error1010. No bypass was attempted; access from the installed app must still be checked
- Monjo-only EU and US UMP messages were published and their on-state read back at 05:21:02/05:21:53 UTC. Google indicated roughly one hour for propagation. The exact settings and remaining EU detail-read limitation are recorded in `AD_TEST_CONSENT_VERIFICATION_20261007.json`
- The reviewed 13 App Privacy types were published and verified after reloading App Store Connect. Device ID is the only type declared as tracking. Diagnostic types are not linked to users; the other approved types are linked

## Device acceptance still required

1. Confirm TestFlight version 1.0.0 (3) and that every displayed ad is marked as a Google test ad
2. Verify ATT denied/restricted keeps ads disabled and leaves the game usable; interrupted consent and background/return navigation must remain safe
3. Verify ads only after a completed normal match when leaving the result screen, with the three-match threshold and 180-second cooldown. Unready or failed ads must skip without blocking play
4. Open the privacy policy from the actual app. Record regional UMP text, language, consent choices and the settings entry that reopens privacy options. A missing form outside the configured region or during message propagation is not proof of regional verification
5. Complete the owner's Firebase Apple-provider secret setup on the owner's own computer, then verify native sign-in and account revocation/deletion only with an explicitly authorized test account

After those results are reviewed, a separate production Release build and final App Review submission are still necessary. Never select this internal test-only binary for App Store release.

## Remaining store fields

Update at 06:37 UTC: the approved Advertising=Yes response was saved, then verified after reload by reopening the questionnaire (true selected, false unselected). The Marketing URL `https://yorimichi-works.jp` was saved and confirmed unchanged after reload with Save disabled. App version 1.0.0 remains prepare-for-submission. Ratings are 16+ globally, 15+ in Korea and 18+ in Brazil. Apple's final questionnaire also displayed sales restrictions for Afghanistan and Morocco; the 173 selected distribution territories must not be equated with effective legal availability. No country settings were changed in this metadata update. At 06:39 UTC, anonymous HTTP GET of https://yorimichi-works.jp/app-ads.txt returned 200 with text/plain and the exact record `google.com, pub-3186852093801241, DIRECT, f08c47fec0942fa0`, matching the current AdMob publisher. No company-site change was needed. AdMob store association and app review remain to be completed after a public App Store listing exists.
