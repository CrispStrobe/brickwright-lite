/**
 * Every producer on these two targets REFUSES rather than throwing when the
 * board cannot take it — enumerated from the source, so a fourth producer
 * cannot arrive without a row here.
 *
 * WHY THE FIXTURE IS NOT THE UPSTREAM ONE. Upstream drives this with a hollow
 * `{machine: {cpu: {}}}`, and that construction is unreachable here: these
 * targets install instruction debug events at construction, which does
 * `cpu.step.bind(cpu)` and throws on an object with no `step`. Measured before
 * writing the file rather than discovered by porting it — the degenerate object
 * never reaches `applyReplayInput` at all.
 *
 * So the reachable degenerate case downstream is a REAL machine that lacks the
 * capability: no VIA to take a button mask, no ULA to take key names, no
 * adapter to take a byte. Those are the boards a driver actually meets, and
 * each has to come back as a REFUSAL naming the hardware — `no-input-path` —
 * rather than as `invalid-replay-input`, which tells a driver to look at its
 * own log, or as an exception, which the contract forbids outright.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createM6502Adapter} from '../overlay/scratch-gui/src/lib/bw-board/m6502-adapter.js';
import {createM6502DebugTarget} from '../overlay/scratch-gui/src/lib/bw-board/m6502-debug.js';
import {Z80Machine} from '../overlay/scratch-gui/src/lib/bw-board/z80-machine.js';
import {createZ80DebugTarget} from '../overlay/scratch-gui/src/lib/bw-board/z80-debug.js';
import {replayOutcome} from '../overlay/scratch-gui/src/lib/bw-board/debug-replay-contract.js';

const SRC = 'overlay/scratch-gui/src/lib/bw-board';

/** A 6502 with NO VIA and NO adapter serial: nothing can take any input. */
const barrenM6502 = () => {
  const adapter = createM6502Adapter({config: {
    clockHz: 1_000_000,
    regions: [{kind: 'ram', start: 0, end: 0xffff}],
    chips: []
  }});
  delete adapter.sendSerial;
  return createM6502DebugTarget(adapter);
};

/** A Z80 with NO ULA, NO joystick and NO adapter: same. */
const barrenZ80 = () => createZ80DebugTarget({machine: new Z80Machine({
  clockHz: 3_500_000, regions: [{kind: 'ram', start: 0, end: 0xffff}], ports: []
})});

const TARGETS = {
  m6502: {
    file: 'm6502-debug.js', prefix: 'm6502', make: barrenM6502,
    // A VALID payload per producer, so the refusal comes from the missing
    // hardware and not from a validation short-circuit that returned first. A
    // table of malformed payloads passes against a throwing implementation too.
    valid: {
      'm6502.buttons': {mask: 1},
      'm6502.serial': {byte: 0x41},
      'm6502.nmi': {}
    },
    // The 6502 machine HAS nmi() (m6502-machine.js:604), so a real machine can
    // always take one. Named rather than silently excluded.
    alwaysAvailable: ['m6502.nmi']
  },
  z80: {
    file: 'z80-debug.js', prefix: 'z80', make: barrenZ80,
    valid: {
      'z80.buttons': {mask: 1},
      'z80.keys': {names: ['A']},
      'z80.serial': {byte: 0x41}
    },
    alwaysAvailable: []
  }
};

for (const [name, spec] of Object.entries(TARGETS)) {
  test(`${name}: the table covers every producer the source handles`, () => {
    // Self-maintaining. Without this the table quietly describes an older
    // dispatch and a producer added later is never driven here at all.
    //
    // SHAPE-AGNOSTIC ON PURPOSE. This scanned `case '<prefix>.x':` only, and the
    // convergence replaced the z80 target's switch with `if (input?.producer ===
    // '<prefix>.x')` chains -- so the scan found NOTHING while all three
    // producers were still handled, and the gate failed for its own syntax
    // rather than for anything about the target. The two legs now dispatch
    // differently from each other, so matching one spelling makes a
    // parameterised gate silently leg-specific.
    //
    // Both forms are matched, and the anti-vacuity check comes FIRST: an empty
    // scan compared against an empty table would agree, and a gate whose
    // pattern has rotted must say so rather than pass.
    const src = readFileSync(new URL(`../${SRC}/${spec.file}`, import.meta.url), 'utf8');
    const producers = [...new Set([
      ...[...src.matchAll(new RegExp(`case '(${spec.prefix}\\.[a-z]+)':`, 'g'))].map(m => m[1]),
      ...[...src.matchAll(new RegExp(`producer === '(${spec.prefix}\\.[a-z]+)'`, 'g'))].map(m => m[1])
    ])];
    assert.ok(producers.length >= 3,
      `the dispatch scan found only ${producers.length} producers in ${spec.file}. Either the `
      + 'target really handles fewer than three, or this pattern no longer matches how it '
      + 'dispatches -- check that before touching the table.');
    assert.deepEqual(producers.sort(), Object.keys(spec.valid).sort(),
      'a producer with no valid payload here is a producer this test does not check');
  });

  test(`${name}: a board that cannot take an input REFUSES, naming the hardware`, () => {
    const target = spec.make();
    let checked = 0;
    for (const [producer, payload] of Object.entries(spec.valid)) {
      if (spec.alwaysAvailable.includes(producer)) continue;
      const outcome = replayOutcome(target.applyReplayInput({producer, payload}));
      assert.equal(outcome.accepted, false, `${producer} must refuse on a barren board`);
      assert.equal(outcome.code, 'no-input-path',
        `${producer} refused for the wrong reason: ${outcome.reason}`);
      checked++;
    }
    assert.ok(checked >= 2, `only ${checked} producers were exercised`);
  });

  test(`${name}: a malformed fact is INVALID, and an unknown producer UNSUPPORTED`, () => {
    // The three codes are different situations, and a test that only checked
    // `accepted === false` would not tell them apart — which is how they came
    // to be one code in the first place.
    const target = spec.make();
    const [first] = Object.keys(spec.valid);
    assert.equal(replayOutcome(
      target.applyReplayInput({producer: first, payload: {mask: 'x', byte: 'x', names: 'x'}})).code,
    'invalid-replay-input');
    assert.equal(replayOutcome(
      target.applyReplayInput({producer: `${spec.prefix}.paddle`, payload: {}})).code,
    'unsupported-replay-input');
    assert.equal(replayOutcome(target.applyReplayInput(undefined)).code,
      'unsupported-replay-input');
  });

  test(`${name}: nothing above threw`, () => {
    // Stated as its own assertion because "returns a refusal" and "does not
    // throw" are different claims and the contract makes both.
    const target = spec.make();
    for (const [producer, payload] of Object.entries(spec.valid)) {
      assert.doesNotThrow(() => target.applyReplayInput({producer, payload}));
    }
    assert.doesNotThrow(() => target.applyReplayInput(null));
  });
}

test('m6502: a machine with no nmi() REFUSES rather than throwing', () => {
  // The guard protects a target wired to a machine that lacks the method.
  // M6502Machine always has it (m6502-machine.js:604), so the only way to reach
  // the guarded state is to build that machine — which is exactly the shape of
  // a target wired to something this repository did not write. Without this the
  // guard is untested: removing it passes every other assertion in this file.
  const adapter = createM6502Adapter({config: {
    clockHz: 1_000_000, regions: [{kind: 'ram', start: 0, end: 0xffff}], chips: []
  }});
  // SHADOWED, not deleted. `nmi()` is a class method and lives on the
  // PROTOTYPE, so `delete instance.nmi` removes an own property that was never
  // there and silently changes nothing — the first version of this test did
  // exactly that and passed against a target with the guard removed.
  adapter.machine.nmi = undefined;
  const target = createM6502DebugTarget(adapter);

  let outcome;
  assert.doesNotThrow(() => {
    outcome = replayOutcome(target.applyReplayInput({producer: 'm6502.nmi', payload: {}}));
  });
  assert.equal(outcome.accepted, false);
  assert.equal(outcome.code, 'no-input-path');
  assert.match(outcome.reason, /NMI/);
});

test('z80: the key-name bound is enforced on the APPLY side too', () => {
  // `setKeys` already refuses 41 names on the RECORD side and that is asserted
  // elsewhere — but a recorded fact is untrusted by the time it is REPLAYED,
  // and the apply side has its own bound. Untested until now: widening it from
  // 40 to 4000 passed the whole suite.
  const target = createZ80DebugTarget({machine: new Z80Machine({
    clockHz: 3_500_000, regions: [{kind: 'ram', start: 0, end: 0xffff}], ports: [], ula: true
  })});
  assert.equal(replayOutcome(target.applyReplayInput(
    {producer: 'z80.keys', payload: {names: Array(41).fill('A')}})).code, 'invalid-replay-input');
  assert.equal(replayOutcome(target.applyReplayInput(
    {producer: 'z80.keys', payload: {names: ['A'.repeat(17)]}})).code, 'invalid-replay-input');
  // And the bound is not so tight that a real press is refused.
  assert.equal(replayOutcome(target.applyReplayInput(
    {producer: 'z80.keys', payload: {names: ['A', 'CAPS SHIFT']}})).accepted, true);
});
