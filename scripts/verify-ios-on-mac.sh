#!/bin/bash
# Read-only configuration inspection plus a local, unsigned Simulator build.
# Does not create certificates, register devices, upload, or submit for review.
set -euo pipefail
cd "$(dirname "$0")/.."
if [[ "$(uname -s)" != Darwin ]]; then
  echo 'BLOCKED: a Mac with Xcode 26+ and iOS 26 SDK+ is required.' >&2
  exit 2
fi
xcodebuild -version
xcode_version=$(xcodebuild -version | awk '/^Xcode / {print $2}')
ios_sdk=$(xcrun --sdk iphoneos --show-sdk-version)
if [[ ${xcode_version%%.*} -lt 26 || ${ios_sdk%%.*} -lt 26 ]]; then
  echo 'BLOCKED: App Store uploads require Xcode 26+ and iOS 26 SDK+.' >&2
  exit 2
fi
printf 'iOS SDK: %s\n' "$ios_sdk"
xcodebuild -list -project ios/Meonjeo.xcodeproj
xcodebuild -project ios/Meonjeo.xcodeproj -scheme Meonjeo \
  -configuration Release -sdk iphonesimulator \
  -destination 'generic/platform=iOS Simulator' \
  -derivedDataPath build/ios-simulator CODE_SIGNING_ALLOWED=NO build
echo 'Unsigned Simulator build completed. Signing, Archive, device tests and TestFlight remain separate.'
