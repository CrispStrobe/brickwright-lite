import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

// The tower firmware is C, and its real test suite is C too — the driver has
// to be compiled and run to mean anything. This file exists so that the suite
// runs under `npm test` alongside everything else rather than being a thing
// someone remembers to run: it builds firmware/ir-tower for the host (the
// third port, whose pins are variables) and asserts what came out.
//
// Half a second, one `cc`, no MCU and no LEGO hardware. See
// firmware/ir-tower/README.md and docs/RCX-IR-TOWER-FIRMWARE.md.

const root = join(import.meta.dirname, '..');
const dir = join(root, 'firmware/ir-tower');

const make = (target) =>
  execFileSync('make', ['-C', dir, target], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

test('ir tower: the host simulation passes on both gate paths', () => {
  assert.ok(existsSync(join(dir, 'Makefile')), 'firmware/ir-tower/Makefile is missing');
  make('clean');
  const out = make('test');

  // Both builds — one software-gated, one hardware-gated — must report checks
  // and no failures. A build that ran no checks at all would otherwise pass.
  const runs = [...out.matchAll(/^(\d+) checks, (\d+) failures$/gm)];
  assert.equal(runs.length, 2, `expected two simulation runs, got ${runs.length}:\n${out}`);
  for (const [, checks, failures] of runs) {
    assert.equal(Number(failures), 0, out);
    assert.ok(Number(checks) > 20, `only ${checks} checks ran:\n${out}`);
  }
  assert.match(out, /gate=software/);
  assert.match(out, /gate=hardware/);
});

test('ir tower: the per-board carrier figures are the ones on record', () => {
  const out = make('test');

  // These are the numbers docs/RCX-IR-TOWER-FIRMWARE.md asks to be recorded
  // per board. The C suite re-derives them from each board's clock and
  // divisor; this pins the values themselves, so a board whose numbers change
  // has to change them here too, in front of a reviewer.
  const rows = Object.fromEntries(
    [...out.matchAll(/^\s+(attiny85|host-sim|rp2040)\s+(\S+)\s+([-+]\d+)\s+(hardware|software)\s+(\d+)$/gm)]
      .map(([, name, hz, ppm, gate, jitter]) => [name, { hz, ppm, gate, jitter: Number(jitter) }]),
  );

  assert.deepEqual(rows.attiny85, { hz: '37914.691', ppm: '-2244', gate: 'software', jitter: 1750 });
  assert.deepEqual(rows.rp2040, { hz: '38000.057', ppm: '+1', gate: 'hardware', jitter: 26316 });
  assert.deepEqual(rows['host-sim'], { hz: '38000.000', ppm: '+0', gate: 'software', jitter: 50000 });

  // A bit at 2400 baud is 416 667 ns. Every board must decide the gate well
  // inside a bit; an eighth of one is the bar the C suite asserts, and this is
  // the same claim stated where a reader of the JS suite will meet it.
  for (const [name, row] of Object.entries(rows)) {
    assert.ok(row.jitter <= 416667 / 8, `${name} jitter ${row.jitter} ns is over an eighth of a bit`);
  }
});
