# Advertising candidate validation — 2026-10-07

Baseline: build 2 source `5de3b4a1a4d97be7d85a227b9f1b97d7550c1c17`. All 211 baseline tracked files matched Git blob hashes before creating this isolated candidate. Original sources and build 2 artifacts were retained.

Completed locally on the final candidate:

- `npm run test:ci`: 204 passed, 0 failed
- `npm run lint`: passed
- `npx tsc --noEmit --incremental false`: passed
- `NODE_OPTIONS=--max-old-space-size=1024 npm run build`: passed
- GMA 13.11.0 and UMP 3.1.0 official archives matched their SPM SHA-256 checksums; original device and Simulator privacy manifests retained
- Native configuration/plist parsing, PBX references, shell syntax and JavaScript bridge regressions passed
- Web behavioral coverage includes completed-match polling retirement, stale async cancellation, single reward application, advertisement frequency, consent/ATT denial, unavailable ads, lost callbacks, clean-bootstrap bridge failure, restored native modals and account deletion of local ad history
- Existing gameplay/server/migration files remain preserved; the two intentional app.js successors have explicit baseline and reviewed hash records

The first concurrent lint/type/build attempt was killed with exit 137. Lint and type checking passed when retried sequentially. The unrestricted sequential Web build also exited 137 during SSR; constraining the Node heap to 1024 MiB completed the full build. This is recorded as a resource-limit recovery, not a passing result for the interrupted commands.

Pending:

- Mac CI: 14 Swift ad-policy tests, actual SDK resolution, Simulator compilation/launch and arm64 Archive
- Monjo-specific UMP message creation/publication and reviewed advertising privacy disclosures
- Physical-device ATT/UMP refusal, consent changes, test-ad presentation, background/foreground recovery and two-device timing
- Owner's Firebase Apple key entry and physical Apple sign-in/guest merge/token revocation/deletion verification
- Signed advertising build and Apple processing; final App Review submission

`MonjoAdsConsentConfigurationVerified` is false. Neither consent nor advertising SDK communication is enabled by this candidate, and the signed-upload preflight refuses an advertising release until the configuration flag is explicitly verified. Unsigned CI may compile the candidate while the flag remains false. No real user account was deleted or changed during these tests.
