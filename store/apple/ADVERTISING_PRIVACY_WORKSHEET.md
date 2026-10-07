# Advertising build App Privacy review draft

Not saved to App Store Connect. The current published answers describe build 2 without advertising. This draft combines that audited data flow with the exact Google Mobile Ads 13.11.0 and UMP 3.1.0 manifests retained in `ios/SDKPrivacy/`.

All rows below are collected. Purpose names are Apple's fields. Linked and tracking are independent answers.

| Data type | Purposes | Linked | Tracking | Change |
|---|---|---|---|---|
| Name | App Functionality | Yes | No | Unchanged |
| Email Address | App Functionality | Yes | No | Unchanged |
| User ID | App Functionality, Analytics, Product Personalization | Yes | No | Unchanged; no Firebase UID sent in ad requests |
| Gameplay Content | App Functionality, Analytics, Product Personalization | Yes | No | Unchanged; no game-result targeting sent to AdMob |
| Customer Support | App Functionality | Yes | No | Unchanged |
| Product Interaction | App Functionality, Analytics, Third-Party Advertising, Developer's Advertising or Marketing | Yes | No | Adds the SDK's advertising purposes |
| Other Data Types | App Functionality | Yes | No | Existing authentication IP/user-agent processing |
| Coarse Location | App Functionality, Analytics, Third-Party Advertising, Developer's Advertising or Marketing | Yes | No | New; GMA linked, UMP unlinked; combined answer linked |
| Device ID | Analytics, Third-Party Advertising, Developer's Advertising or Marketing | Yes | Yes | New; exact GMA manifest explicitly declares tracking |
| Advertising Data | Analytics, Third-Party Advertising, Developer's Advertising or Marketing | Yes | No | New |
| Performance Data | App Functionality, Analytics, Third-Party Advertising, Developer's Advertising or Marketing | No | No | New; UMP adds functionality |
| Crash Data | Analytics | No | No | New |
| Other Diagnostic Data | Analytics, Third-Party Advertising, Developer's Advertising or Marketing | No | No | New |

The SDK declares Developer's Advertising or Marketing even though this app does not configure a separate acquisition campaign. This draft retains the vendor declaration rather than silently excluding it. Confirm final app-specific answers against the integrated archive and configured service; a generic SDK manifest is evidence of its declared practices, not proof of every observed network event.

The app does not add name, email, Firebase UID, answers, scores or match identifiers to ad requests. Web-only clients and older native builds do not use the new native advertising integration.

## Consent and release conditions

1. Verified, app-specific UMP messages and reviewed privacy text are required before enabling the release flag
2. ATT must be authorized before UMP/GMA initialization in this initial implementation; denial or restriction skips ads and permits play
3. UMP consent information is refreshed each launch, and `canRequestAds` gates GMA requests
4. Publisher first-party ID and publisher personalization remain disabled; requests carry NPA and use a PG content cap
5. NPA does not mean no collection or no tracking; the Device ID tracking answer above remains Yes
6. A changed ATT choice, consent choice, document, screen or native presentation state invalidates inappropriate advertising work

## Other submission changes

- Age questionnaire: advertising changes from No to Yes; keep other approved content answers unless review shows a new reason to change them
- Update the Korean public privacy policy and Google consent-message policy link before activating ads
- Provide a Korean explanation for Google messages that may appear in English, and a re-entry point for required privacy options
- Do not claim physical-device consent, ad delivery, account deletion, or App Review passed until each is actually verified

Sources: [Google SDK disclosure](https://developers.google.com/admob/ios/privacy/data-disclosure), [Google UMP](https://developers.google.com/admob/ios/privacy), [Apple App Privacy](https://developer.apple.com/app-store/app-privacy-details/), [Apple ATT](https://developer.apple.com/app-store/user-privacy-and-data-use/)
