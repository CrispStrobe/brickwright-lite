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

// `make` and `cc` come from PATH, which is the AMBIENT-BINDING shape
// scripts/audit-gate-shapes.mjs exists to flag: a gate that resolves a tool
// from the environment can silently exercise something other than what the
// build ships, or quietly stop exercising anything at all.
//
// Here it is unavoidable and deliberate. The artefact under test is C — the
// driver has to be compiled and run to mean anything — and there is no
// vendored compiler that could stand in. What the rule is really protecting
// against is the SILENT half, so that is what is fixed: both tools are
// resolved and reported once, up front, and their absence is a named refusal
// rather than an obscure ENOENT from inside a build.
const toolVersion = (tool, args) => {
  try {
    // gate-shapes-allow: probing for the tool IS the fix for the ambient binding
    return execFileSync(tool, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
      .split('\n')[0].trim();
  } catch {
    return null;
  }
};

const TOOLS = { make: toolVersion('make', ['--version']), cc: toolVersion('cc', ['--version']) };

const make = (target) =>
  // gate-shapes-allow: see TOOLS above — presence and identity are asserted before any call
  execFileSync('make', ['-C', dir, target], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

test('the host toolchain this gate needs is present, and says which one it is', (t) => {
  // Without this, a machine with no compiler reports a build error from deep
  // inside `make` and reads like a defect in the firmware. It is not one.
  for (const [tool, version] of Object.entries(TOOLS)) {
    assert.ok(version, `${tool} is not on PATH; firmware/ir-tower cannot be built or tested here`);
  }
  // `t.diagnostic()`, never `console.log`: the runner's stdout IS the TAP
  // transport, and raw bytes written onto it are the deserialize flake this
  // repo's own run-check exists to catch. It caught this line in CI with the
  // whole suite otherwise green — 3873 pass, 0 fail, and the step still
  // exited 1 — which is the run-check doing exactly its job.
  t.diagnostic(`built with: ${TOOLS.cc}`);
});

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
