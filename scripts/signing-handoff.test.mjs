import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const example = readFileSync(new URL('../ci/codemagic.yaml.example', import.meta.url), 'utf8');

test('Codemagic signing example remains inactive and has no publishing or automatic trigger', () => {
  assert.doesNotMatch(example, /^\s+(publishing|triggering|integrations):/m);
  assert.match(example, /MEONJEO_SIGNING_APPROVED: "NO"/);
  assert.match(example, /OWNER_CONFIRMED_INTEGER/);
});

test('the approved signing workflow uses explicit resources and never submits review automatically', () => {
  assert.equal(existsSync(new URL('../codemagic.yaml', import.meta.url)), true);
  const active = readFileSync(new URL('../codemagic.yaml', import.meta.url), 'utf8');
  assert.match(active, /app_store_connect: codemagic/);
  assert.match(active, /meonjeo-app-store-profile/);
  assert.match(active, /cirno-app-store/);
  assert.match(active, /6819903098/);
  assert.match(active, /validate-signed-ipa\.sh/);
  assert.match(active, /submit_to_testflight: false/);
  assert.match(active, /submit_to_app_store: false/);
  assert.doesNotMatch(active, /^\s+triggering:/m);
  assert.doesNotMatch(active, /--create|fetch-signing-files|--log-api-calls|set -x/);
});

test('Codemagic example uses explicit approved signing references without generating keys', () => {
  assert.match(example, /REPLACE_WITH_APPROVED_MEONJEO_PROFILE_REFERENCE/);
  assert.match(example, /REPLACE_WITH_APPROVED_DISTRIBUTION_CERTIFICATE_REFERENCE/);
  assert.doesNotMatch(example, /app-store-connect (fetch-signing-files|create)|openssl|PRIVATE KEY/);
  assert.match(example, /xcode-project use-profiles/);
  assert.match(example, /ios\/Meonjeo\.xcodeproj/);
});

test('runbook separates approval, live Web, signing and TestFlight boundaries', () => {
  const text = readFileSync(new URL('../store/apple/SIGNING_RUNBOOK.md', import.meta.url), 'utf8');
  for (const expected of ['com.yorimichiworks.meonjeo', 'deleteUser', 'submit_to_testflight', '丸ごと上書きしません', '最初に必要なユーザー操作はAppleログイン']) {
    assert.ok(text.includes(expected), expected);
  }
});
