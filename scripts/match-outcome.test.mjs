import assert from 'node:assert/strict';
import test from 'node:test';
import { matchOutcome } from '../lib/match-outcome.ts';

test('running out of lives decides the match before score comparison', () => {
  assert.equal(matchOutcome({ score_a:4, score_b:1, lives_a:0, lives_b:1 }), 'b');
  assert.equal(matchOutcome({ score_a:1, score_b:4, lives_a:1, lives_b:0 }), 'a');
});

test('score, then remaining lives, resolve a completed match symmetrically', () => {
  assert.equal(matchOutcome({ score_a:5, score_b:4, lives_a:2, lives_b:5 }), 'a');
  assert.equal(matchOutcome({ score_a:4, score_b:5, lives_a:5, lives_b:2 }), 'b');
  assert.equal(matchOutcome({ score_a:3, score_b:3, lives_a:4, lives_b:2 }), 'a');
  assert.equal(matchOutcome({ score_a:3, score_b:3, lives_a:2, lives_b:4 }), 'b');
  assert.equal(matchOutcome({ score_a:3, score_b:3, lives_a:4, lives_b:4 }), 'draw');
});
