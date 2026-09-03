/**
 * C-vs-referee differential: layer 4 of the corpus-and-oracles pyramid
 * (sb3-creator reference/corpus-and-oracles.md).
 *
 * For each program × device: parse → referee trace (the reference
 * interpreter on a virtual clock) → generateC → compile on the HOSTED
 * service → run the artifact under the device's pure-JS emulator
 * (avr8js / rp2040js via the vendored bw-board adapters) with a
 * recording board stub → normalize to the canonical trace → compare.
 *
 * The recorder is the normalization layer: physical pin levels become
 * ON/OFF intent via the program's own declarations (level XOR activeLow),
 * keyed by LOGICAL name; serial bytes become timestamped lines; stimulus
 * answers readAnalog/readPin so analog and button programs run the same
 * scripted world in both executors.
 *
 * Usage:
 *   node scripts/oracle-differential.mjs             # built-in programs, both devices
 *   node scripts/oracle-differential.mjs pico        # one device
 *   node scripts/oracle-differential.mjs corpus 10 0 # N gallery pairs from offset,
 *       retargeted per device, sweep stimulus — the amplified corpus under
 *       the REAL emulators, sampled to respect the hosted compile budget
 *   COMPILER_URL=... overrides the service (default the public one).
 *
 * Exit code 0 only if every differential agrees.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { wrappedSample } from './corpus-sample.mjs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import SB3Creator from '../packages/scratch-gui/src/lib/sb3-creator.js';
import { interpretTrace, compareTraces } from '../packages/scratch-gui/src/lib/trace-oracle.js';
import { createAvr8jsAdapter } from '../packages/scratch-gui/src/lib/bw-board/avr8js-adapter.js';
import { createRp2040jsAdapter } from '../packages/scratch-gui/src/lib/bw-board/rp2040js-adapter.js';
import { parseIntelHex } from '../packages/scratch-gui/src/lib/bw-board/intel-hex.js';

const COMPILER = process.env.COMPILER_URL || 'https://stc-compiler.vercel.app';

const DEVICE = {
  nano: {
    header: 'DEVICE ARDUINO-NANO', target: 'atmega328p',
    adc: { bits: 10, vref: 5 }, serialMsPerByte: 1.05,
    pins: { led: 'D13', led2: 'D12', pot: 'A0', btn: 'D2' },
    makeAdapter: () => createAvr8jsAdapter({}),
    load: (adapter, out) => adapter.loadProgram(parseIntelHex(atob(out.base64))),
  },
  pico: {
    header: 'DEVICE PICO', target: 'rp2040',
    adc: { bits: 12, vref: 3.3 }, serialMsPerByte: 0,
    pins: { led: 'GP15', led2: 'GP14', pot: 'GP26', btn: 'GP3' },
    makeAdapter: () => createRp2040jsAdapter({}),
    load: (adapter, out) => {
      const bytes = Uint8Array.from(atob(out.base64), c => c.charCodeAt(0));
      const padded = bytes.length & 1 ? new Uint8Array([...bytes, 0]) : bytes;
      adapter.loadProgram(new Uint16Array(padded.buffer, padded.byteOffset, padded.length / 2));
    },
  },
};

/** Program templates; ${pins.x} fills per device. */
const PROGRAMS = {
  blink: (p) => `PIN led1 = ${p.led} OUTPUT

WHEN flag clicked:
  FOREVER:
    turn on led1
    wait 0.5 seconds
    turn off led1
    wait 0.5 seconds
`,
  'pot-print': (p) => `PIN pot1 = ${p.pot} ANALOG

WHEN flag clicked:
  FOREVER:
    print read pot1
    wait 1 seconds
`,
  'two-tasks': (p) => `PIN led1 = ${p.led} OUTPUT
PIN led2 = ${p.led2} OUTPUT

WHEN flag clicked:
  FOREVER:
    toggle led1
    wait 0.3 seconds

WHEN flag clicked:
  FOREVER:
    toggle led2
    wait 0.7 seconds
`,
  button: (p) => `PIN btn = ${p.btn} INPUT
PIN led1 = ${p.led} OUTPUT

WHEN flag clicked:
  FOREVER:
    IF read btn THEN:
      turn on led1
    ELSE:
      turn off led1
    wait 0.05 seconds
`,
};

/** Scripted world per program; volts for pots, level for buttons. */
const STIMULUS = {
  'pot-print': [{ tMs: 0, pin: 'pot1', volts: 1.65 }],
  button: [
    { tMs: 0, pin: 'btn', level: 0 },
    { tMs: 400, pin: 'btn', level: 1 },
    { tMs: 1200, pin: 'btn', level: 0 },
  ],
};

const HORIZON_MS = 2500;

async function compile(code, target) {
  const res = await fetch(`${COMPILER}/compile`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, language: 'c', target, format: target === 'rp2040' ? 'bin' : 'ihx' }),
  });
  const out = await res.json();
  if (!out.success) throw new Error(`compile failed: ${(out.error || '').slice(0, 200)}`);
  return out;
}

function runUnderEmulator(dev, creator, out, stimulus) {
  // Sorted by time, like the referee sorts its own copy: the lookup below
  // breaks at the first future entry, and an unsorted per-pin-grouped list
  // hides every later pin behind the first pin's future entries — the
  // comparator's potB read 0 V and the OR-gate's btnB never released.
  stimulus = [...stimulus].sort((a, b) => a.tMs - b.tMs);
  const adapter = dev.makeAdapter();
  dev.load(adapter, out);

  // Declarations: physical `where` → { logical name, activeLow }.
  const decl = new Map();
  for (const p of creator.project.stc.pins || []) {
    decl.set(String(p.where).toLowerCase(), { name: String(p.name).toLowerCase(), activeLow: !!p.activeLow });
  }
  const stimFor = (where) => {
    const d = decl.get(String(where).toLowerCase());
    if (!d) return null;
    let hit = null;
    const nowMs = Number(adapter.timeNs() / 1000000n);
    for (const s of stimulus) {
      if (s.tMs > nowMs) break;
      if (String(s.pin).toLowerCase() === d.name) hit = s;
    }
    return hit;
  };

  const trace = { events: [], serial: [], pwm: [], vars: {}, horizon: HORIZON_MS };
  const lastIntent = new Map();
  const serialBytes = [];
  if (adapter.onSerial) adapter.onSerial((b) => serialBytes.push({ tMs: Number(adapter.timeNs() / 1000000n), b }));

  adapter.attachBoard({
    setPin: (where, mode, high) => {
      const d = decl.get(String(where).toLowerCase());
      if (!d || mode !== 'pushpull') return;
      const intent = (high !== d.activeLow) ? 1 : 0;
      if (lastIntent.get(d.name) === intent) return;
      lastIntent.set(d.name, intent);
      trace.events.push({ tMs: Number(adapter.timeNs() / 1000000n), pin: d.name, level: intent });
    },
    advanceTo: () => {},
    readPin: (where) => {
      const s = stimFor(where);
      return s && s.level ? 1 : 0;
    },
    readAnalog: (where) => {
      const s = stimFor(where);
      return s && s.volts !== undefined ? s.volts : 0;
    },
  });

  // Advance in slices so time-dependent stimulus lands mid-run.
  for (let t = 0; t < HORIZON_MS; t += 50) adapter.advanceNs(50_000_000);

  let buf = '', t0 = null;
  for (const { tMs, b } of serialBytes) {
    const ch = String.fromCharCode(b);
    if (ch === '\n') { trace.serial.push({ tMs: t0 ?? tMs, line: buf }); buf = ''; t0 = null; }
    else if (ch !== '\r') { if (t0 === null) t0 = tMs; buf += ch; }
  }
  return trace;
}

// ---- corpus mode: the amplified gallery under the real emulators -------
const RETARGET_DEVICE = { nano: 'arduino-nano', pico: 'pico' };

function sweepStimulus(pins, adc) {
  // Same sweep the amplification harness uses (3%..85%, phase-staggered):
  // thresholds fire both ways, paired pots cross, buttons press mid-run.
  const stim = [];
  let ai = 0;
  for (const p of pins || []) {
    if (p.direction === 'analog') {
      const lo = adc.vref * 0.03, hi = adc.vref * 0.85;
      const off = ai * 250;
      stim.push({ tMs: 0, pin: p.name, volts: ai % 2 ? hi : lo });
      stim.push({ tMs: 900 + off, pin: p.name, volts: ai % 2 ? lo : hi });
      stim.push({ tMs: 1900 + off, pin: p.name, volts: ai % 2 ? hi : lo });
      ai++;
    }
    if (p.direction === 'input') {
      stim.push({ tMs: 0, pin: p.name, level: 0 });
      stim.push({ tMs: 700, pin: p.name, level: 1 });
      stim.push({ tMs: 1600, pin: p.name, level: 0 });
    }
  }
  return stim;
}

async function corpusMode(count, offset) {
  // The vendored gallery can lag the source-of-truth (the computed
  // 'devices' lists landed in sb3-creator after lite's last example
  // vendoring); EXAMPLES_DIR points at a fresh checkout when needed.
  const root = process.env.EXAMPLES_DIR ||
    join(dirname(fileURLToPath(import.meta.url)), '..', 'packages', 'scratch-gui', 'examples');
  const index = JSON.parse(readFileSync(join(root, 'index.json'), 'utf8'));
  const entries = (Array.isArray(index) ? index : index.examples || [])
    .filter((e) => e.files && e.files.program && Array.isArray(e.devices));
  const pairs = [];
  for (const e of entries) {
    for (const [devName, retargetId] of Object.entries(RETARGET_DEVICE)) {
      if (e.devices.includes(retargetId)) pairs.push({ e, devName, retargetId });
    }
  }
  // Wrapped, and never empty — see scripts/corpus-sample.mjs for why that is
  // its own module with its own gate.
  const { sample, start, wrapped } = wrappedSample(pairs, count, offset);
  console.log(`corpus: ${pairs.length} eligible pairs, running ${sample.length} from offset ${start}` +
    (wrapped ? ` (wrapped from ${offset})` : ''));
  let bad = false;
  for (const { e, devName, retargetId } of sample) {
    const label = `${e.id} -> ${devName}`;
    try {
      const src = readFileSync(join(root, e.files.program), 'utf8');
      const r = SB3Creator.retargetPseudocode(src, retargetId);
      if (!r.ok) { console.log(`${label}: SKIP retarget (${r.reasons[0]})`); continue; }
      const dev = DEVICE[devName];
      const creator = new SB3Creator();
      creator.parse(r.pseudocode);
      const stimulus = sweepStimulus(creator.project.stc.pins, dev.adc);
      const ref = interpretTrace(creator.project, { horizonMs: HORIZON_MS, stimulus, adc: dev.adc });
      if (ref.unsupported.length) { console.log(`${label}: SKIP referee (${[...new Set(ref.unsupported)][0]})`); continue; }
      if (ref.pwm.length) { console.log(`${label}: SKIP pwm (duty recording not built yet — stated, not silent)`); continue; }
      const c = creator.generateC(undefined, { debug: true });
      const out = await compile(c, dev.target);
      const actual = runUnderEmulator(dev, creator, out, stimulus);
      const cmp = compareTraces(ref, actual, { tolMs: 5, serialMsPerByte: dev.serialMsPerByte });
      console.log(`${label}: ${cmp.ok ? 'AGREE' : 'DIFF'} (${actual.events.length} ev, ${actual.serial.length} ser)` +
        (cmp.ok ? '' : '\n  ' + cmp.diffs.slice(0, 3).join('\n  ')));
      if (!cmp.ok) bad = true;
    } catch (err) {
      console.log(`${label}: ERROR ${String(err.message || err).slice(0, 140)}`);
      bad = true;
    }
  }
  return bad;
}

const only = process.argv[2];
if (only === 'corpus') {
  const bad = await corpusMode(Number(process.argv[3] ?? 10), Number(process.argv[4] ?? 0));
  process.exit(bad ? 1 : 0);
}
let failed = false;
for (const [devName, dev] of Object.entries(DEVICE)) {
  if (only && devName !== only) continue;
  for (const [progName, tpl] of Object.entries(PROGRAMS)) {
    const src = `${dev.header}\n${tpl(dev.pins)}`;
    const stimulus = STIMULUS[progName] || [];
    try {
      const creator = new SB3Creator();
      creator.parse(src);
      if (creator.warnings.length) throw new Error(`parse: ${creator.warnings[0]}`);
      const ref = interpretTrace(creator.project, { horizonMs: HORIZON_MS, stimulus, adc: dev.adc });
      if (ref.unsupported.length) throw new Error(`referee refuses: ${[...new Set(ref.unsupported)]}`);
      const c = creator.generateC(undefined, { debug: true });
      const out = await compile(c, dev.target);
      const actual = runUnderEmulator(dev, creator, out, stimulus);
      const r = compareTraces(ref, actual, { tolMs: 5, serialMsPerByte: dev.serialMsPerByte });
      console.log(`${devName}/${progName}: ${r.ok ? 'AGREE' : 'DIFF'}` +
        ` (${actual.events.length} events, ${actual.serial.length} serial)` +
        (r.ok ? '' : '\n  ' + r.diffs.slice(0, 4).join('\n  ')));
      if (!r.ok) failed = true;
    } catch (e) {
      console.log(`${devName}/${progName}: ERROR ${String(e.message || e).slice(0, 160)}`);
      failed = true;
    }
  }
}
process.exit(failed ? 1 : 0);
