#!/usr/bin/env python3
"""Match an ASC selection readback to the validated advertising Release IPA.

Offline only: does not contact Apple, change disclosures, or submit a build.
This checks identity/configuration, not runtime tracking or device acceptance.
"""
import argparse
import hashlib
import json
from pathlib import Path
import plistlib
import re
import runpy
import zipfile

APP_ID = '6819903098'
BUNDLE_ID = 'com.yorimichiworks.meonjeo'
AD_POLICY = runpy.run_path(str(Path(__file__).with_name('verify-advertising-release.py')))


def require(condition: bool, message: str) -> None:
    if not condition:
        raise ValueError(message)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            digest.update(chunk)
    return digest.hexdigest()


def verify(ipa: Path, receipt: dict, selection: dict, expected_commit: str) -> dict:
    require(isinstance(receipt, dict) and isinstance(selection, dict), 'Evidence must be JSON objects.')
    require(re.fullmatch(r'[0-9a-f]{40}', expected_commit) is not None, 'Expected source must be a full commit SHA.')
    with zipfile.ZipFile(ipa) as archive:
        entries = [entry for entry in archive.infolist()
                   if re.fullmatch(r'Payload/[^/]+\.app/Info\.plist', entry.filename)]
        require(len(entries) == 1, 'IPA must contain exactly one main application Info.plist.')
        require(entries[0].file_size <= 1024 * 1024, 'Unexpectedly large application Info.plist.')
        info = plistlib.loads(archive.read(entries[0]))
    require(isinstance(info, dict), 'Application Info.plist must be a dictionary.')
    require(info.get('CFBundleIdentifier') == BUNDLE_ID, 'Wrong IPA bundle identifier.')
    # This app's approved first release includes advertising. A legacy no-ads
    # binary or internal test binary must not inherit its production disclosure.
    AD_POLICY['verify_built'](info, 'production')
    version, build = info.get('CFBundleShortVersionString'), info.get('CFBundleVersion')
    require(isinstance(version, str) and bool(version), 'Missing IPA marketing version.')
    require(isinstance(build, str) and re.fullmatch(r'[1-9][0-9]*', build) is not None,
            'Missing or invalid IPA build number.')
    identity = {'bundle_id': BUNDLE_ID, 'version': version, 'build': build}
    for label, data in [('Signed validation', receipt), ('ASC selection', selection)]:
        for key, value in identity.items():
            require(data.get(key) == value, f'{label} {key} does not match the IPA.')
    require(selection.get('app_id') == APP_ID, 'Wrong App Store Connect app.')
    require(selection.get('internal_testing_only') is False, 'An internal-testing-only build cannot be submitted.')
    require(selection.get('advertising') is True, 'Selection must retain the approved advertising policy.')
    require(selection.get('device_id_tracking') is True, 'Device ID disclosure does not match this advertising release policy.')
    require(receipt.get('source_commit') == expected_commit, 'Signed source does not match the expected commit.')
    require(receipt.get('advertising_mode') == 'production' and receipt.get('test_ads_only') is False,
            'Signed validation is not for a production advertising build.')
    require(receipt.get('advertising_configuration_verified') is True, 'Missing signed advertising configuration validation.')
    digest = sha256(ipa)
    require(receipt.get('ipa_sha256') == digest, 'IPA bytes do not match the signed validation receipt.')
    return {
        'result': 'binary-selection-consistent', 'app_id': APP_ID, **identity,
        'source_commit': expected_commit, 'ipa_sha256': digest,
        'advertising_mode': 'production',
        'scope': 'Offline comparison to supplied ASC readback; no Apple state was fetched or changed.',
        'device_and_network_acceptance': 'Not verified by this check; separate evidence is required.',
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--ipa', required=True, type=Path)
    parser.add_argument('--signed-validation', required=True, type=Path)
    parser.add_argument('--selection', required=True, type=Path,
                        help='Fresh ASC selection/disclosure readback, not values copied from the intended candidate.')
    parser.add_argument('--expected-source-commit', required=True)
    args = parser.parse_args()
    try:
        result = verify(args.ipa, json.loads(args.signed_validation.read_text(encoding='utf-8')),
                        json.loads(args.selection.read_text(encoding='utf-8')), args.expected_source_commit)
    except (OSError, ValueError, KeyError, RuntimeError, zipfile.BadZipFile, plistlib.InvalidFileException) as error:
        parser.exit(2, f'BLOCKED: {error}\n')
    print(json.dumps(result, indent=2))


if __name__ == '__main__':
    main()
