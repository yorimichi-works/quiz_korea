#!/bin/bash
set -euo pipefail

fail() { printf 'error: %s\n' "$1" >&2; exit 1; }
app_id="${MONJO_ADMOB_APP_ID:-}"
unit_id="${MONJO_INTERSTITIAL_AD_UNIT_ID:-}"
[[ "$app_id" =~ ^ca-app-pub-[0-9]{16}~[0-9]{10}$ ]] || fail 'A valid MONJO_ADMOB_APP_ID is required.'
[[ "$unit_id" =~ ^ca-app-pub-[0-9]{16}/[0-9]{10}$ ]] || fail 'A valid MONJO_INTERSTITIAL_AD_UNIT_ID is required.'
[[ "${MONJO_ADS_TRACKING_ENABLED:-}" == YES ]] || fail 'This reviewed first-release configuration requires explicit ATT authorization before advertising.'
[[ "$app_id" == 'ca-app-pub-3186852093801241~6780777097' ]] || fail 'Use the exact registered Monjo app ID so UMP loads the correct messages.'
conditions=" ${SWIFT_ACTIVE_COMPILATION_CONDITIONS:-} "
case "${CONFIGURATION:-}" in
  Debug)
    expected_mode=debug
    expected_unit='ca-app-pub-3940256099942544/4411468910'
    [[ "$conditions" == *' DEBUG '* && "$conditions" != *' MONJO_AD_TESTING '* ]] || fail 'Debug requires only its DEBUG mode condition.'
    ;;
  AdTesting)
    expected_mode=ad-testing
    expected_unit='ca-app-pub-3940256099942544/4411468910'
    [[ "$conditions" == *' MONJO_AD_TESTING '* && "$conditions" != *' DEBUG '* ]] || fail 'AdTesting requires MONJO_AD_TESTING without DEBUG consent overrides.'
    ;;
  Release)
    expected_mode=production
    expected_unit='ca-app-pub-3186852093801241/3315999799'
    [[ "$conditions" != *' DEBUG '* && "$conditions" != *' MONJO_AD_TESTING '* ]] || fail 'Production cannot compile a test/debug advertising mode.'
    ;;
  *) fail 'Unreviewed AdMob build configuration.' ;;
esac
[[ "${MONJO_ADS_BUILD_MODE:-}" == "$expected_mode" ]] || fail 'Advertising mode does not match the Xcode configuration.'
[[ "$unit_id" == "$expected_unit" ]] || fail 'The ad unit does not match this reviewed build mode.'
# False console gates are allowed for unsigned compile checks. Runtime stays off;
# scripts/verify-advertising-release.py requires the matching true gate before signing/upload.
