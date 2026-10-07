#!/bin/bash
# Unsigned QA compile checks only: no Apple upload, credentials or gate changes.
set -euo pipefail
cd "$(dirname "$0")/.."
if [[ "$(uname -s)" != Darwin ]]; then
  echo 'BLOCKED: AdTesting native verification requires macOS with Xcode 26+.' >&2
  exit 2
fi
xcode_version=$(xcodebuild -version | awk '/^Xcode / {print $2}')
ios_sdk=$(xcrun --sdk iphoneos --show-sdk-version)
if [[ ${xcode_version%%.*} -lt 26 || ${ios_sdk%%.*} -lt 26 ]]; then
  echo 'BLOCKED: use Xcode 26+ and iOS 26 SDK+.' >&2
  exit 2
fi
swift test --package-path ios/AdPolicy
swift test --package-path ios/AdPolicy -c release
swift test --package-path ios/AdPolicy -c release -Xswiftc -DMONJO_AD_TESTING
xcodebuild -project ios/Meonjeo.xcodeproj -scheme Meonjeo-AdTesting \
  -configuration AdTesting -sdk iphonesimulator -destination 'generic/platform=iOS Simulator' \
  -derivedDataPath build/ios-ad-testing CODE_SIGNING_ALLOWED=NO build
xcodebuild -project ios/Meonjeo.xcodeproj -scheme Meonjeo-AdTesting \
  -configuration AdTesting -sdk iphoneos -destination 'generic/platform=iOS' \
  -archivePath build/ios-ad-testing/Meonjeo-AdTesting.xcarchive CODE_SIGNING_ALLOWED=NO archive
python3 - <<'PY'
import plistlib
from pathlib import Path
apps = [(Path('build/ios-ad-testing/Build/Products/AdTesting-iphonesimulator/Meonjeo.app'), 'iPhoneSimulator'),
        (Path('build/ios-ad-testing/Meonjeo-AdTesting.xcarchive/Products/Applications/Meonjeo.app'), 'iPhoneOS')]
for app, platform in apps:
    info = plistlib.loads((app / 'Info.plist').read_bytes())
    assert info['CFBundleIdentifier'] == 'com.yorimichiworks.meonjeo'
    assert info['CFBundleSupportedPlatforms'] == [platform]
    assert info['GADApplicationIdentifier'] == 'ca-app-pub-3186852093801241~6780777097'
    assert info['MonjoInterstitialAdUnitID'] == 'ca-app-pub-3940256099942544/4411468910'
    assert info['MonjoAdsBuildMode'] == 'ad-testing'
    assert info['MonjoAdsConsentConfigurationVerified'] is False
    assert type(info['MonjoAdsTestConsentConfigurationVerified']) is bool
    assert not (app / 'embedded.mobileprovision').exists()
    print('Unsigned AdTesting bundle verified:', app)
PY
device_app=build/ios-ad-testing/Meonjeo-AdTesting.xcarchive/Products/Applications/Meonjeo.app
architectures=$(xcrun lipo -archs "$device_app/Meonjeo")
if [[ "$architectures" != arm64 ]]; then
  printf 'BLOCKED: expected an arm64 device archive, found %s.\n' "$architectures" >&2
  exit 2
fi
echo 'Unsigned AdTesting device architecture verified: arm64'
echo 'AdTesting native checks passed. Signing, device consent checks and upload are separate.'
