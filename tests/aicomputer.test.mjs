/** The optional AI computer: off by default, input cleaned, safety prompt always sent. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { cleanInput, SAFETY, aiEnabled, situation } from '../src/core/aicomputer.js';

test('AI is off unless the player switches it on', () => {
  assert.equal(aiEnabled({ state: { settings: {} } }), false);
  assert.equal(aiEnabled({ state: { settings: { aiComputer: true } } }), true);
  const game = fs.readFileSync(new URL('../src/game.js', import.meta.url), 'utf8');
  assert.doesNotMatch(game, /aiComputer:\s*true/, 'never on by default in a new save');
});

test('player text is trimmed and length-limited before it is sent', () => {
  assert.equal(cleanInput('  hi\n\tthere  '), 'hi there');
  assert.equal(cleanInput('x'.repeat(1000)).length, 240);
});

test('the kid-safe system prompt covers the essentials', () => {
  for (const must of ['family-friendly', 'personal information', 'steer back', 'under 70 words']) {
    assert.ok(SAFETY.includes(must), `safety prompt mentions "${must}"`);
  }
});

test('Puter.js is only loaded on demand, never in index.html', () => {
  const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.doesNotMatch(html, /js\.puter\.com/);
});

test('the computer knows the situation', () => {
  const fake = { state: { credits: 5, dilithium: 2, research: 1 }, system: { name: 'Sol' }, currentMission: { title: 'T', desc: 'D', hint: 'H' },
    damage: { warp: 0.2, weapons: 1 }, shipRecord: { name: 'U.S.S. Test' }, shipClass: { name: 'Miranda-Class' }, rankTitle: 'Ensign' };
  const s = situation(fake, { currentName: 'system' });
  assert.match(s, /Sol/); assert.match(s, /warp 20%/); assert.match(s, /Current orders: T/);
});
