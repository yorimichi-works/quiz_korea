#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p build/ipa-check
ipa=$(find build/ios/ipa -maxdepth 1 -name '*.ipa' -type f -print -quit)
test -n "$ipa"
unzip -q "$ipa" -d build/ipa-check
app=build/ipa-check/Payload/Meonjeo.app
test -d "$app"
codesign --verify --deep --strict "$app"
security cms -D -i "$app/embedded.mobileprovision" > build/ipa-check/profile.plist
codesign -d --entitlements :- "$app" > build/ipa-check/entitlements.plist 2>/dev/null
MEONJEO_IPA="$ipa" python3 scripts/validate-signed-ipa.py
