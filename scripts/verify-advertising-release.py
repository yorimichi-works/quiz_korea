#!/usr/bin/env python3
"""Stop an advertising release until the app's UMP setup was verified.

The flag is an explicit release record, not a substitute for runtime consent.
Unsigned CI may compile with it false; production advertising then stays off.
"""
import argparse
import plistlib
from pathlib import Path


def verify(path: Path) -> None:
    with path.open('rb') as stream:
        info = plistlib.load(stream)
    if info.get('MonjoAdsConsentConfigurationVerified') is not True:
        raise ValueError('Monjo UMP configuration is not verified. Keep production ads disabled and do not upload this advertising release.')


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--plist', type=Path, default=Path('ios/Meonjeo/Info.plist'))
    args = parser.parse_args()
    try:
        verify(args.plist)
    except (OSError, ValueError, plistlib.InvalidFileException) as error:
        parser.exit(2, f'BLOCKED: {error}\n')
    print('Advertising release configuration verified; runtime UMP consent still required for each ad request.')
