import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const manifest = JSON.parse(readFileSync(new URL('store/apple/SOURCE_RECONCILIATION_20261007.json', root), 'utf8'));

test('the reconciled candidate retains every tracked path from deployed version 32', () => {
  assert.equal(manifest.deployed_paths.length, 185);
  assert.deepEqual(manifest.unresolved_conflicts, []);
  for (const path of manifest.deployed_paths) assert.ok(existsSync(new URL(path, root)), path);
});

test('deployed gameplay, migration and regression fixes are preserved byte for byte', () => {
  assert.equal(manifest.preserved_verbatim.length, 8);
  for (const { path, git_blob_sha1 } of manifest.preserved_verbatim) {
    const bytes = readFileSync(new URL(path, root));
    const actual = createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
    assert.equal(actual, git_blob_sha1, `Review the deployed-source baseline before intentionally changing ${path}`);
  }
});

test('intentional advertising successors retain their explicit deployed baseline and review record', () => {
  assert.deepEqual(manifest.reviewed_successors.map(entry => entry.path).sort(), ['app.js', 'public/app.js']);
  for (const entry of manifest.reviewed_successors) {
    assert.equal(entry.deployed_git_blob_sha1, '36648b9b0ef180a545f383bce031ad399a15dd84');
    assert.ok(entry.reviewed_change.includes('Existing gameplay rules and server implementation retained'));
    for (const path of entry.behavioral_tests) assert.ok(existsSync(new URL(path, root)), path);
    const bytes = readFileSync(new URL(entry.path, root));
    const actual = createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
    assert.equal(actual, entry.reviewed_git_blob_sha1, `Review later changes to ${entry.path}`);
  }
});

test('package scripts keep both the deployed rebound coverage and iOS candidate checks', () => {
  const { scripts } = JSON.parse(readFileSync(new URL('package.json', root), 'utf8'));
  assert.equal(scripts['test:realtime'], manifest.merged_realtime_script);
  for (const [name, value] of Object.entries(manifest.retained_candidate_scripts)) assert.equal(scripts[name], value, name);
});
