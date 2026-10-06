#!/bin/bash
# Launch the actual unsigned app and record a QA screenshot; no Apple login,
# account linking, store upload, or user interaction is performed.
set -euo pipefail
cd "$(dirname "$0")/.."
if [[ "$(uname -s)" != Darwin ]]; then
  echo 'BLOCKED: Simulator launch requires macOS.' >&2
  exit 2
fi
mkdir -p build/ios-smoke
xcrun simctl list devices available --json > build/ios-smoke/available-devices.json
device=$(python3 - <<'PY'
import json
from pathlib import Path
devices = json.loads(Path('build/ios-smoke/available-devices.json').read_text())['devices']
phones = [d for runtime, values in devices.items() if 'iOS' in runtime
          for d in values if d.get('isAvailable') and d['name'].startswith('iPhone')]
phones.sort(key=lambda d: ('Pro Max' not in d['name'], d['name']))
if not phones:
    raise SystemExit('No available iPhone Simulator was found.')
chosen = phones[0]
Path('build/ios-smoke/device.json').write_text(json.dumps(chosen, indent=2))
print(chosen['udid'])
PY
)
trap 'xcrun simctl shutdown "$device" >/dev/null 2>&1 || true' EXIT
xcrun simctl boot "$device" || true
xcrun simctl bootstatus "$device" -b
app=build/ios-simulator/Build/Products/Release-iphonesimulator/Meonjeo.app
xcrun simctl install "$device" "$app"
xcrun simctl launch --terminate-running-process "$device" com.yorimichiworks.meonjeo | tee build/ios-smoke/launch.txt
sleep 25
xcrun simctl io "$device" screenshot --type=png build/ios-smoke/meonjeo-launch.png
echo 'Simulator install and launch succeeded. Screenshot requires visual review; this is not gameplay or Apple-sign-in acceptance.'
