# Monjo test-ad consent verification

Status: local preparation only. Both console-verification flags are literal `false`; no new Git save, build service run, Apple upload or console publication is performed by these files. The production workflow in `codemagic.yaml` stays separate and blocked.

## Build separation

| Build | Shared scheme | Native mode | Ad unit | Console gate |
|---|---|---|---|---|
| Release | Meonjeo | production | Monjo production interstitial | MonjoAdsConsentConfigurationVerified |
| AdTesting | Meonjeo-AdTesting | ad-testing | Google iOS test interstitial only | MonjoAdsTestConsentConfigurationVerified |
| Debug | Meonjeo | debug | Google iOS test interstitial only | MonjoAdsTestConsentConfigurationVerified |

All modes use the registered Monjo App ID `ca-app-pub-3186852093801241~6780777097`. AdTesting is optimized like Release, compiles with `MONJO_AD_TESTING`, and does **not** compile `DEBUG`. The normal archive scheme still selects Release. Debug-only UMP reset/geography launch arguments are excluded from AdTesting and Release. No consent, ATT or foreground gate is bypassed. Test mode also requires the production gate to remain literal false.

The test interstitial is exactly `ca-app-pub-3940256099942544/4411468910`. Both runtime and build checks reject a different unit, App ID, mismatched native mode or disabled ATT gating. The source preflight and signed-bundle validator reject the wrong mode, unexpanded IDs and a missing/string/numeric/false verification gate. The ordinary signed-IPA validator defaults to production, so a test binary fails unless its workflow explicitly selects `ADVERTISING_BUILD_MODE=ad-testing`.

## Activation order after approvals

1. Review and publish the app-scoped UMP messages/disclosures in AdMob after the owner's publication approval. Record the app, published message IDs/settings, privacy-policy destination, reviewer and publication time in the approval evidence. Publication is a prerequisite, not proof that a device received the form.
2. After checking that publication, edit **only** `MonjoAdsTestConsentConfigurationVerified` in `ios/Meonjeo/Info.plist` from `<false/>` to `<true/>`. Leave `MonjoAdsConsentConfigurationVerified` literal `<false/>` and all Release IDs/settings untouched. No environment variable or build argument substitutes for this review record.
3. Run `python3 scripts/verify-advertising-release.py --mode ad-testing`; it must pass. Run the same command without `--mode`; it must still report `BLOCKED`. The tests use temporary fixtures and do not flip either source gate.
4. With approved Git save/native CI, run `npm run test:ci` and the `ios-ad-testing` job in `.github/workflows/app-readiness.yml`. That local workflow proposal uses the same standard `macos-26` GitHub runner as the existing jobs, adds no credentials/signing/publishing, and calls `bash scripts/verify-ios-ad-testing-on-mac.sh`. It runs Swift tests in Debug, Release and AdTesting compilation modes, builds unsigned AdTesting Simulator/device products, validates their platform and test-only settings, and checks that the device binary is arm64. Both source gates can remain false for these checks. Artifacts are retained for 14 days. The existing Web, Release Simulator launch and Release device-archive jobs are preserved. Check the repository's available Actions allowance before starting; this does not start a paid Codemagic build. Verify new native results for the exact saved commit; the older Release CI result does not cover these changes. CI compilation alone does not exercise UMP forms.
5. Only after signing/build approval, merge the `meonjeo-ios-ad-testing` workflow from `ci/codemagic-ad-testing.yaml.example` into the root workflow collection. Preserve the production workflow. Set `RELEASE_BUILD_NUMBER` to an approved number confirmed unused in App Store Connect. The candidate currently has no publishing block and no automatic trigger.
6. After explicit approval to upload the exact QA build, enable only the commented App Store Connect publishing block. Both submission flags remain false. `submit_to_testflight: true` requests beta review, so it is unnecessary for this internal-only test. The export is marked `testFlightInternalTestingOnly`; verify that setting in the export log/options. Wait for Apple processing, verify the build number, test mode and IPA validation SHA-256, then add only the approved internal tester/group. Confirm installation of that exact build before recording device evidence.
7. After device evidence is reviewed, decide separately whether the production console gate can be enabled and a new Release binary built. Never select the AdTesting binary for App Store submission. If message/settings/disclosure changes invalidate the review, return the test gate to false until rechecked.

## Actual device verification

- Confirm developer bridge diagnostics report `adBuildMode: ad-testing`, `testAdsOnly: true`, `configurationGate: MonjoAdsTestConsentConfigurationVerified` and `configurationVerified: true`. These are status fields, not player-facing controls. A false gate must leave SDK startup and consent requests blocked.
- From the normal menu consent boundary, test ATT allowed, denied/restricted and interrupted/background flows. Denied/restricted must leave UMP/GMA blocked while gameplay remains usable. ATT still precedes UMP, then GMA only after UMP allows requests.
- On the owner's device in Japan, record the actual UMP result after a successful consent-information update, including whether a form and privacy-options entry point are required. An EEA-targeted form may correctly be absent there. Form absence alone cannot distinguish a valid no-form result from a blocked ATT/configuration gate, failed update or unpublished/mistargeted message. Record those statuses as well. AdTesting cannot force geography or reset UMP via launch arguments.
- Confirm the displayed interstitial is a Google test ad, only at the existing post-match exit boundary. Verify dismissal/failure, repeat taps, navigation/background, cooldown and privacy-options changes. No real-unit fallback exists.
- Retain device/OS/build number, region, ATT status, relevant consent result, diagnostics and evidence timestamps. These checks are pending until performed on the signed installed binary.

## Regional form evidence without an overseas device

This plan does not require an overseas physical device or travel. The owner's signed AdTesting installation in Japan and the official UMP Debug Simulator geography tests answer different questions:

| Evidence | What it verifies | What it does not establish |
|---|---|---|
| Signed AdTesting on the owner's iPhone in Japan, without geography overrides | The exact installed QA build, real-device ATT/lifecycle behavior, and UMP's unforced response for that device/session | That an EEA/US-specific form was displayed; an absent EU form does not count as an EU-flow pass |
| Debug Simulator with UMP `.EEA` or `.regulatedUSState` | Delivery and interaction of the published app-scoped messages under the chosen simulated applicability, including language, links, choices and privacy-options behavior | Physical presence abroad, real-region detection on an overseas device, or a signed TestFlight device pass |
| Unsigned GitHub native CI | Compilation, policy/configuration checks, mode separation, platform metadata and arm64 archive architecture | Network-delivered UMP UI, signed installation, ATT permission on a physical iPhone or TestFlight completion |

After approved publication and verification of the test console gate, use the `Meonjeo` scheme with the **Debug** configuration in an iOS Simulator. Google treats Simulators as test devices automatically; no physical device identifier needs registration. Use the registered Monjo App ID and Google test ad unit. Keep the normal ATT/UMP checks: a Simulator session that cannot obtain ATT authorization is recorded as blocked, never bypassed or counted as a form pass. [Google's testing guide](https://developers.google.com/admob/ios/privacy#testing)

- **EEA:** the existing `-MonjoUMPDebugEEA` launch argument selects official UMP `.EEA`. Record the actual displayed form, its choices/links and privacy-options behavior, plus Simulator OS, commit/build, published message reference, forced geography and timestamp.
- **US regulated state:** UMP 3.1.0 supports official `.regulatedUSState` (available since 2.7.0); `.other` is a separate suppression/control case. US behavior can include the privacy-options entry point rather than an initial blocking form. The current app has no US geography launch argument. At the authorized Debug-testing step, use a temporary Debug-only test change to select `.regulatedUSState` inside the existing `#if DEBUG && !MONJO_AD_TESTING` block, then test `.other` separately. Record that exact test change and the observed outcome; do not label US coverage complete before that run. This documentation change does not add or enable that test code. [Google's US-message testing instructions](https://developers.google.com/admob/ios/privacy/us-iab-support#test_your_us_states_regulations_messaging) and [geography enum](https://developers.google.com/admob/ios/privacy/api/reference/Enums/UMPDebugGeography)
- **Fresh consent case:** `-MonjoUMPResetConsent` is Debug-only and may be used for a separate first-run test. Remove it for persisted-consent/relaunch coverage. A UMP reset is not an ATT reset; report the actual ATT status independently. Keep reset/forced geography out of AdTesting and Release, including shared archive schemes and CI build arguments.

Retain the Japan real-device result and the EEA/US Simulator results as separate rows in the test evidence. Together they support device behavior and regional form integration without requiring overseas hardware. They do not prove every geographic targeting decision or replace the review of published console settings/disclosures. The source test gate and production gate remain false until their respective approved checks are completed; no form testing has run as part of this local preparation.

## References

- [Google iOS test ads](https://developers.google.com/admob/ios/test-ads)
- [Google UMP setup and consent testing](https://developers.google.com/admob/ios/privacy)
- [Codemagic build-ipa configuration option](https://github.com/codemagic-ci-cd/cli-tools/blob/master/docs/xcode-project/build-ipa.md)
- [Codemagic internal TestFlight export and publishing flags](https://docs.codemagic.io/yaml-publishing/app-store-connect/)
