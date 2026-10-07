import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

function runGate(value) {
  const directory = mkdtempSync(join(tmpdir(), 'monjo-ads-gate-'));
  const path = join(directory, 'Info.plist');
  try {
    writeFileSync(path, `<?xml version="1.0" encoding="UTF-8"?><plist version="1.0"><dict>${value === null ? '' : `<key>MonjoAdsConsentConfigurationVerified</key>${value}`}</dict></plist>`);
    return spawnSync('python3', ['scripts/verify-advertising-release.py', '--plist', path], { encoding: 'utf8' });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

test('advertising upload rejects missing, false, and string consent verification', () => {
  for (const value of [null, '<false/>', '<string>true</string>', '<string>YES</string>']) {
    const result = runGate(value);
    assert.equal(result.status, 2);
    assert.match(result.stderr, /BLOCKED:/);
  }
});

test('advertising upload accepts explicit verified Boolean without bypassing runtime consent', () => {
  const result = runGate('<true/>');
  assert.equal(result.status, 0);
  assert.match(result.stdout, /runtime UMP consent still required/);
});
