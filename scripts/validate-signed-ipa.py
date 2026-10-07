"""Validate signed release identity without exposing signing credentials."""
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import plistlib
import runpy

root = Path('build/ipa-check')
app = root / 'Payload/Meonjeo.app'
info = plistlib.loads((app / 'Info.plist').read_bytes())
profile = plistlib.loads((root / 'profile.plist').read_bytes())
entitlements = plistlib.loads((root / 'entitlements.plist').read_bytes())
expected_bundle = 'com.yorimichiworks.meonjeo'
expected_team = '3W8HVJ3U8W'
expected_build = os.environ['RELEASE_BUILD_NUMBER']
advertising_mode = os.environ.get('ADVERTISING_BUILD_MODE', 'production')
advertising = runpy.run_path('scripts/verify-advertising-release.py')
advertising['verify_built'](info, advertising_mode)

assert info['CFBundleIdentifier'] == expected_bundle, 'Wrong bundle identifier'
assert info['CFBundleShortVersionString'] == '1.0.0', 'Wrong marketing version'
assert str(info['CFBundleVersion']) == expected_build, 'Wrong build number'
assert info['MinimumOSVersion'] == '16.0', 'Unexpected minimum iOS version'
assert profile['TeamIdentifier'] == [expected_team], 'Wrong signing team'
assert profile['Name'] == 'Meonjeo App Store', 'Wrong provisioning profile'
assert not profile.get('ProvisionedDevices'), 'An App Store profile is required'
assert not profile.get('ProvisionsAllDevices', False), 'Enterprise profile is not permitted'
expiry = profile['ExpirationDate'].replace(tzinfo=timezone.utc)
assert expiry > datetime.now(timezone.utc), 'Provisioning profile has expired'
for source in (profile['Entitlements'], entitlements):
    assert source['application-identifier'] == f'{expected_team}.{expected_bundle}', 'Wrong application entitlement'
    assert source.get('com.apple.developer.applesignin') == ['Default'], 'Apple login entitlement missing'
    assert source.get('get-task-allow') is False, 'Debugging must be disabled in distribution'

ipa = Path(os.environ['MEONJEO_IPA'])
summary = {
    'bundle_id': expected_bundle,
    'team_id': expected_team,
    'version': info['CFBundleShortVersionString'],
    'build': expected_build,
    'advertising_mode': advertising_mode,
    'test_ads_only': advertising_mode == 'ad-testing',
    'advertising_configuration_verified': True,
    'profile_name': profile['Name'],
    'profile_expiry': expiry.isoformat(),
    'apple_sign_in_entitlement': True,
    'ipa_sha256': hashlib.sha256(ipa.read_bytes()).hexdigest(),
}
(root / 'validation.json').write_text(json.dumps(summary, indent=2) + '\n')
print(json.dumps(summary, indent=2))
