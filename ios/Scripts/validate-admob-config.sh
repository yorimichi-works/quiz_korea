#!/bin/bash
set -euo pipefail

fail() { printf 'error: %s\n' "$1" >&2; exit 1; }
app_id="${MONJO_ADMOB_APP_ID:-}"
unit_id="${MONJO_INTERSTITIAL_AD_UNIT_ID:-}"
[[ "$app_id" =~ ^ca-app-pub-[0-9]{16}~[0-9]{10}$ ]] || fail 'A valid MONJO_ADMOB_APP_ID is required.'
[[ "$unit_id" =~ ^ca-app-pub-[0-9]{16}/[0-9]{10}$ ]] || fail 'A valid MONJO_INTERSTITIAL_AD_UNIT_ID is required.'
[[ "${MONJO_ADS_TRACKING_ENABLED:-}" == YES ]] || fail 'This reviewed first-release configuration requires explicit ATT authorization before advertising.'
[[ "$app_id" != ca-app-pub-3940256099942544* ]] || fail 'Use the registered Monjo app ID so UMP loads the correct messages.'
if [[ "${CONFIGURATION:-}" == Debug ]]; then
  [[ "$unit_id" == 'ca-app-pub-3940256099942544/4411468910' ]] || fail 'Debug must use the Google iOS interstitial test unit.'
else
  [[ "${CONFIGURATION:-}" == Release ]] || fail 'Unreviewed AdMob build configuration.'
  [[ "$unit_id" != ca-app-pub-3940256099942544* ]] || fail 'Release cannot use Google demo ad units.'
  [[ "$app_id" != *0000000000000000* && "$unit_id" != *0000000000000000* ]] || fail 'Release cannot use placeholder IDs.'
  [[ "${app_id%%~*}" == "${unit_id%%/*}" ]] || fail 'Release app and unit publisher IDs must match.'
fi
