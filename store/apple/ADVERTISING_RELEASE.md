# Monjo initial advertising release

Status: implementation candidate, not submitted for review. The earlier 1.0.0 (2) binary and its saved privacy answers describe the version without advertising. The first public release now requires advertising, so build 2 is not the final submission candidate.

## Existing design and chosen scope

The existing main and submission branches, the retained Sites history, the original common README, and the five game design specifications were checked. They contain a reference to existing stamina/advertising but no concrete advertising placement, reward amount, recovery interval, or SDK integration. The existing title specification prohibits advertising prompts during competitive questions. Paid cosmetic button plans do not define ad rewards.

The initial implementation therefore adds one native iOS interstitial placement at the transition from a normally completed match result to Home. It does not create stamina, rewarded items, purchases, banners, or a new rematch protocol.

- Frequency policy: every three normal live completions, at least 180 seconds since the preceding ad
- No first-match, in-match, between-question, matchmaking, forfeit, disconnect, cancelled-match, or QA-mode interstitials
- If an eligible ad is not already ready, continue without waiting for a download
- Navigation resumes once after a confirmed dismissal or skip; no matching behind an active native modal
- Ad callbacks never apply score, rating, rank, lives, or account changes

## Registered identifiers

These are public advertising configuration identifiers, not credentials.

- App: `먼저!`, iOS, initially unlisted in the store
- AdMob App ID: `ca-app-pub-3186852093801241~6780777097`
- Unit: `meonjeo_ios_match_end_interstitial`
- Production unit: `ca-app-pub-3186852093801241/3315999799`
- Debug test interstitial: `ca-app-pub-3940256099942544/4411468910`
- No mediation partners or rewarded units are configured
- AdMob's unit frequency cap is not enabled; the client policy enforces frequency

Debug uses the registered app identifier for UMP configuration and Google's dedicated test ad unit. Production ad impressions/clicks must not be generated as a development test.

## Consent and data handling

Use the official Google Mobile Ads and User Messaging Platform SDKs. The native implementation must keep publisher first-party ID and publisher personalization disabled before SDK startup, request non-personalized ads, limit ad content to PG, and pass no Firebase UID, name, email, or game-result targeting data to the ad request. No user age is inferred from the store content rating, and no child/adult certification is fabricated.

Non-personalized requests alone do not establish that tracking or collection is absent. Google documents potential collection of IP-derived coarse location, device identifiers, advertising interactions, crash information, performance information, and other product interactions. The final App Privacy mapping must include the integrated SDK and configured data flow, not only the game's own database.

The exact Google Mobile Ads 13.11.0 artifact declares linked Device ID collection for tracking. The initial implementation therefore requires ATT authorization before any Google Mobile Ads initialization or request, even while requesting non-personalized ads. Denied or restricted permission skips advertising and preserves gameplay. UMP choices do not replace ATT permission. Foreground and presentation checks must also honor permission revocation.

UMP refreshes consent information each app launch and supplies the necessary consent form and privacy-options status. Ad requests are allowed only when the verified app configuration and the current `canRequestAds` state permit them. The game remains usable when requests are unavailable or disallowed. Consent forms and ad presentations must finish before a new competitive match can start.

The app provides a short Korean explanation and an advertising privacy-settings entry. Google's European consent message does not support Korean; English is the proposed fallback. The US message supports English and Spanish variants. The Korean explanation does not act as consent or replace Google's choices.

## Console configuration still pending

At the latest check, the Monjo app has no published UMP message. Other apps' messages must not be reused or edited for it.

Planned app-only messages:

1. European regulations: EEA, UK, Switzerland; English default; consent, refusal, and options available
2. US state regulations: the applicable supported states; English default; re-entry through the app's privacy-options action

The advertising privacy policy draft must be reviewed and published before linking and publishing these messages. Do not change global account data-sharing or other apps' consent configuration.

`MonjoAdsConsentConfigurationVerified` remains a literal `false` until the console setup is verified. Native runtime skips UMP and advertising initialization while false. `scripts/verify-advertising-release.py` also blocks the signed upload workflow, so an unconfigured candidate cannot be uploaded as the advertising release. This flag never replaces runtime consent.

## Store and public-site follow-through

- Re-evaluate the age questionnaire's advertising answer as Yes
- Prepare and obtain confirmation of the advertising build's exact App Privacy answers; preserve build 2's history
- Publish the reviewed advertising privacy policy and retain its rollback source
- Verify the company site's existing `app-ads.txt` is publicly served and contains the registered publisher
- Use a verified Developer Website / Marketing URL that allows AdMob to discover that file
- After the store listing is public, associate the store ID with AdMob and complete its app verification/review
- Recheck the previously confirmed 173 territories after the browser recovers; exclude China mainland and Vietnam, and keep Mac/Vision Pro distribution off

AdMob registration and app-store upload do not prove live ad approval, fill, revenue, or App Review approval.

## Required verification

- JS behavioral tests: stale responses, repeated result exits, eligibility, frequency, unavailable ads, wrong-document callbacks, foreground recovery, and no duplicate reward application
- Native policy tests and Swift compilation against the pinned SDK versions
- Simulator and arm64 Archive checks for the final commit
- Test ads on an authorized physical test device; consent refusal/change, backgrounding, external ad clicks, and two-device match timing
- Existing real Apple sign-in, guest progression merge, reauthentication and account-deletion checks remain required

## Primary references

- [Google Mobile Ads setup](https://developers.google.com/admob/ios/quick-start)
- [Interstitial lifecycle and placement](https://developers.google.com/admob/ios/interstitial)
- [UMP integration](https://developers.google.com/admob/ios/privacy)
- [Publisher first-party identifier controls](https://developers.google.com/admob/ios/privacy/strategies)
- [SDK data disclosure](https://developers.google.com/admob/ios/privacy/data-disclosure)
- [UMP languages](https://support.google.com/admob/answer/10107561?hl=en)
- [app-ads.txt setup](https://support.google.com/admob/answer/9363762?hl=en-GB)
- [Apple tracking and privacy requirements](https://developer.apple.com/app-store/user-privacy-and-data-use/)
