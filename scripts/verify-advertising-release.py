#!/usr/bin/env python3
"""Fail closed before signing/upload, for a production or test-ads-only build.

Both gates start false. Unsigned compile checks do not need a verified console.
A verified gate is a review record, never a substitute for runtime ATT and UMP.
"""
import argparse
import plistlib
import re
from pathlib import Path

APP_ID = 'ca-app-pub-3186852093801241~6780777097'
PRODUCTION_UNIT = 'ca-app-pub-3186852093801241/3315999799'
TEST_UNIT = 'ca-app-pub-3940256099942544/4411468910'
GATE = 'MonjoAdsConsentConfigurationVerified'
TEST_GATE = 'MonjoAdsTestConsentConfigurationVerified'
CONFIGURATIONS = {'production': 'Release', 'ad-testing': 'AdTesting'}
SUBSTITUTIONS = {
    'GADApplicationIdentifier': 'MONJO_ADMOB_APP_ID',
    'MonjoInterstitialAdUnitID': 'MONJO_INTERSTITIAL_AD_UNIT_ID',
    'MonjoAdsTrackingEnabled': 'MONJO_ADS_TRACKING_ENABLED',
    'MonjoAdsBuildMode': 'MONJO_ADS_BUILD_MODE',
}


def read_plist(path: Path) -> dict:
    with path.open('rb') as stream:
        info = plistlib.load(stream)
    if not isinstance(info, dict):
        raise ValueError('Advertising Info.plist must be a dictionary.')
    return info


def verify_built(info: dict, mode: str = 'production') -> None:
    if mode not in CONFIGURATIONS:
        raise ValueError('Unreviewed advertising release mode.')
    expected = {
        'GADApplicationIdentifier': APP_ID,
        'MonjoInterstitialAdUnitID': TEST_UNIT if mode == 'ad-testing' else PRODUCTION_UNIT,
        'MonjoAdsTrackingEnabled': 'YES',
        'MonjoAdsBuildMode': mode,
        'GADDelayAppMeasurementInit': True,
    }
    for key, value in expected.items():
        if type(info.get(key)) is not type(value) or info.get(key) != value:
            raise ValueError(f'{key} does not match the reviewed {mode} configuration.')
    gate = TEST_GATE if mode == 'ad-testing' else GATE
    if info.get(gate) is not True:
        raise ValueError(f'{gate} is not verified. Keep advertising disabled and do not sign/upload this build.')
    if mode == 'ad-testing' and info.get(GATE) is not False:
        raise ValueError('AdTesting requires the production consent gate to remain literal false.')
    if not isinstance(info.get('NSUserTrackingUsageDescription'), str) or not info['NSUserTrackingUsageDescription'].strip():
        raise ValueError('ATT usage disclosure is required.')


def verify(path: Path, mode: str = 'production', xcconfig: Path | None = None) -> None:
    info = read_plist(path)
    config_path = xcconfig or Path(f'ios/Configuration/Ads-{CONFIGURATIONS[mode]}.xcconfig')
    settings = {}
    for line in config_path.read_text().splitlines():
        match = re.fullmatch(r'\s*(MONJO_[A-Z_]+)\s*=\s*(.+?)\s*', line)
        if match:
            key, value = match.groups()
            if key in settings:
                raise ValueError(f'Duplicate advertising build setting: {key}')
            settings[key] = value.strip()
    for key, setting in SUBSTITUTIONS.items():
        if info.get(key) != f'$({setting})':
            raise ValueError(f'Source {key} must use its reviewed build-setting substitution.')
        info[key] = settings.get(setting)
    verify_built(info, mode)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--mode', choices=CONFIGURATIONS, default='production')
    parser.add_argument('--plist', type=Path, default=Path('ios/Meonjeo/Info.plist'))
    parser.add_argument('--xcconfig', type=Path)
    parser.add_argument('--built-plist', type=Path,
                        help='Also validate the expanded, archived/signed bundle; substitutions are rejected.')
    args = parser.parse_args()
    try:
        verify(args.plist, args.mode, args.xcconfig)
        if args.built_plist:
            verify_built(read_plist(args.built_plist), args.mode)
    except (OSError, ValueError, plistlib.InvalidFileException) as error:
        parser.exit(2, f'BLOCKED: {error}\n')
    print(f'{args.mode} advertising configuration verified; runtime UMP consent still required after ATT authorization.')
