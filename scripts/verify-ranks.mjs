import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const config = JSON.parse(await readFile(new URL('../data/rank-config.json', import.meta.url), 'utf8'));
const marks = ['−', '', '＋'];

function rankFromPoints(value) {
  let remaining = Math.max(0, Math.floor(Number(value) || 0));
  for (const entry of config.tiers) {
    for (const mark of marks) {
      if (remaining < entry.requirement) return `${entry.tier}${mark}`;
      remaining -= entry.requirement;
    }
  }
  return `Master ${Math.floor(remaining / config.master.requirement) + 1}`;
}

assert.equal(rankFromPoints(0), 'D−');
assert.equal(rankFromPoints(999), 'D−');
assert.equal(rankFromPoints(1000), 'D');
assert.equal(rankFromPoints(2000), 'D＋');
assert.equal(rankFromPoints(3000), 'C−');
assert.equal(rankFromPoints(7500), 'B−');
assert.equal(rankFromPoints(15000), 'A−');
assert.equal(rankFromPoints(27000), 'AA−');
assert.equal(rankFromPoints(45000), 'Master 1');
assert.equal(rankFromPoints(55000), 'Master 2');
assert.equal(rankFromPoints(100025000), 'Master 9999');
assert.equal(config.winPoints, 100);

console.log('rank boundaries: ok');
