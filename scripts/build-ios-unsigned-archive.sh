#!/bin/bash
# Compile the iPhone device target without signing, provisioning, or uploading.
# The resulting archive cannot be installed or submitted until properly signed.
set -euo pipefail
cd "$(dirname "$0")/.."
if [[ "$(uname -s)" != Darwin ]]; then
  echo 'BLOCKED: the iPhone archive requires macOS with Xcode 26+.' >&2
  exit 2
fi
xcode_version=$(xcodebuild -version | awk '/^Xcode / {print $2}')
ios_sdk=$(xcrun --sdk iphoneos --show-sdk-version)
if [[ ${xcode_version%%.*} -lt 26 || ${ios_sdk%%.*} -lt 26 ]]; then
  echo 'BLOCKED: App Store uploads require Xcode 26+ and iOS 26 SDK+.' >&2
  exit 2
fi
archive=build/ios-device/Meonjeo.xcarchive
xcodebuild -project ios/Meonjeo.xcodeproj -scheme Meonjeo \
  -configuration Release -sdk iphoneos -destination 'generic/platform=iOS' \
  -archivePath "$archive" CODE_SIGNING_ALLOWED=NO archive
python3 - <<'PY'
import plistlib
from pathlib import Path
app = Path('build/ios-device/Meonjeo.xcarchive/Products/Applications/Meonjeo.app')
p = plistlib.loads((app/'Info.plist').read_bytes())
assert p['CFBundleIdentifier'] == 'com.yorimichiworks.meonjeo'
assert p['CFBundleSupportedPlatforms'] == ['iPhoneOS']
assert p['DTSDKName'].startswith('iphoneos')
assert not (app/'embedded.mobileprovision').exists()
print('Unsigned device archive metadata:', {key: p.get(key) for key in ['CFBundleIdentifier', 'CFBundleShortVersionString', 'CFBundleVersion', 'DTSDKName', 'MinimumOSVersion']})
PY
xcrun lipo -archs "$archive/Products/Applications/Meonjeo.app/Meonjeo"
ditto -c -k --sequesterRsrc --keepParent "$archive" build/Meonjeo-unsigned-device-archive.zip
echo 'Unsigned iPhone archive complete. This is not an installable IPA or an App Store submission.'
