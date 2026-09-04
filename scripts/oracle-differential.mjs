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
 *   node scripts/oracle-differential.mjs explain 24-pwm-fade nano
 *       # BOTH traces for one pair, side by side, comparing nothing — use this
 *       # before believing anything the diff list implies about a shape
 *   node scripts/oracle-differential.mjs corpus 10 0 # N gallery pairs from offset,
 *       retargeted per device, sweep stimulus — the amplified corpus under
 *       the REAL emulators, sampled to respect the hosted compile budget
 *   COMPILER_URL=... overrides the service (default the public one).
 *
 * Exit code 0 only if every differential agrees.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { wrappedSample, bindsHardware } from './corpus-sample.mjs';
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
  const hostOnly = new Set();
  for (const e of entries) {
    // `devices` is COMPUTED and claims chips for programs that bind nothing,
    // which the emitter compiles as HOST C — see bindsHardware() and D-CORPUS1.
    // Pairing those with a microcontroller measures the harness's own input.
    let src = '';
    try { src = readFileSync(join(root, e.files.program), 'utf8'); } catch { /* counted below */ }
    const isDevice = bindsHardware(src);
    for (const [devName, retargetId] of Object.entries(RETARGET_DEVICE)) {
      if (!e.devices.includes(retargetId)) continue;
      if (isDevice) pairs.push({ e, devName, retargetId });
      else hostOnly.add(e.id);
    }
  }
  // Never silently. A harness that drops work without saying so reports on a
  // corpus it did not walk.
  if (hostOnly.size) {
    console.log(`corpus: skipped ${hostOnly.size} host-only programs that CLAIM a device ` +
      `target but bind no PIN/PORT/PART/LEDCUBE/CHIP (D-CORPUS1, owner sb3-creator): ` +
      `${[...hostOnly].slice(0, 5).join(', ')}${hostOnly.size > 5 ? ', …' : ''}`);
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
      // WHAT vs WHEN. A disagreement about what the program did — a level, a
      // serial line, an event count, a pwm duty — is an emitter defect and
      // fails. A disagreement only about WHEN is the referee-vs-device gap
      // measured on 2026-09-04 and neither side's bug: interpretTrace charges
      // nothing for walking the blocks, a real MCU pays per loop pass, and the
      // size tracks the program's inner loop rather than the chip (0 ms/s on
      // 01-blink, ~9.95 on three PWM/motor programs, 21.50 on
      // 20-shift-register-binary — see D-CORPUS1).
      //
      // Before this split the gate was all-or-nothing, so nine benign timing
      // divergences kept it switched off and it covered nothing at all. Skew is
      // REPORTED, with its numbers, so a change in it is visible to a reader
      // even though it does not fail the run.
      if (!cmp.findings) {
        // A vendored trace-oracle too old to classify. Fail closed: treat every
        // disagreement as semantic rather than let the gate quietly stop
        // failing because the vendor lagged.
        console.log(`${label}: ${cmp.ok ? 'AGREE' : 'DIFF'} (no classification — vendored oracle predates findings)` +
          (cmp.ok ? '' : '\n  ' + cmp.diffs.slice(0, 3).join('\n  ')));
        if (!cmp.ok) bad = true;
      } else {
        const semantic = cmp.findings.filter((f) => f.kind !== 'time');
        const skew = cmp.findings.filter((f) => f.kind === 'time');
        const verdict = semantic.length ? 'DIFF' : (skew.length ? 'SKEW' : 'AGREE');
        console.log(`${label}: ${verdict} (${actual.events.length} ev, ${actual.serial.length} ser` +
          (skew.length ? `, ${skew.length} timing` : '') + ')' +
          (semantic.length ? '\n  ' + semantic.slice(0, 3).map((f) => f.text).join('\n  ') : '') +
          (skew.length && !semantic.length ? `\n  skew: ${skew[0].text}` : ''));
        if (semantic.length) bad = true;
      }
    } catch (err) {
      console.log(`${label}: ERROR ${String(err.message || err).slice(0, 140)}`);
      bad = true;
    }
  }
  return bad;
}

/**
 * Print BOTH traces for one gallery pair, side by side, and compare nothing.
 *
 * This exists because the comparator's diff list is not the measurement — it is
 * the comparator's opinion about the measurement. `compareTraces` reports the
 * first three disagreements PAST its tolerance, so an accumulating error is
 * only ever visible from the point where it crosses the threshold, and reads
 * exactly like a constant offset. That misfiled D-CORPUS1 twice: once as "a
 * constant +6 ms, not a drift" (it is a 1 % drift) and once as "two signatures
 * pointing in opposite directions" (there is one cause). Both corrections came
 * from looking at the two sides directly, which took one command and should not
 * have taken two wrong filings first.
 *
 *   node scripts/oracle-differential.mjs explain 24-pwm-fade nano
 */
async function explainMode(exId, devName) {
  const root = process.env.EXAMPLES_DIR ||
    join(dirname(fileURLToPath(import.meta.url)), '..', 'packages', 'scratch-gui', 'examples');
  const index = JSON.parse(readFileSync(join(root, 'index.json'), 'utf8'));
  const entries = (Array.isArray(index) ? index : index.examples || []);
  const e = entries.find((x) => x.id === exId);
  if (!e) throw new Error(`no such example: ${exId} (ids come from examples/index.json)`);
  const dev = DEVICE[devName];
  if (!dev) throw new Error(`no such device: ${devName} (one of ${Object.keys(DEVICE).join(', ')})`);
  const retargetId = RETARGET_DEVICE[devName];

  const src = readFileSync(join(root, e.files.program), 'utf8');
  if (!bindsHardware(src)) {
    console.log(`${exId} binds no PIN/PORT/PART/LEDCUBE/CHIP — it is a HOST program and is not paired with a chip (D-CORPUS1).`);
    return;
  }
  const r = SB3Creator.retargetPseudocode(src, retargetId);
  if (!r.ok) { console.log(`retarget refused: ${r.reasons[0]}`); return; }
  const creator = new SB3Creator();
  creator.parse(r.pseudocode);
  const stimulus = sweepStimulus(creator.project.stc.pins, dev.adc);
  const ref = interpretTrace(creator.project, { horizonMs: HORIZON_MS, stimulus, adc: dev.adc });
  const out = await compile(creator.generateC(undefined, { debug: true }), dev.target);
  const actual = runUnderEmulator(dev, creator, out, stimulus);

  console.log(`${exId} -> ${devName}: ref ${ref.events.length} events, actual ${actual.events.length}`);
  // Per pin, and with leading OFFs dropped, because that is what compareTraces
  // compares — printing the raw lists instead invites the reader to "find" a
  // one-event shift the comparator has already accounted for.
  const byPin = (evs) => {
    const m = new Map();
    for (const ev of evs) { if (!m.has(ev.pin)) m.set(ev.pin, []); m.get(ev.pin).push(ev); }
    for (const [, l] of m) while (l.length && l[0].level === 0) l.shift();
    return m;
  };
  const R = byPin(ref.events), A = byPin(actual.events);
  for (const pin of new Set([...R.keys(), ...A.keys()])) {
    const a = R.get(pin) || [], b = A.get(pin) || [];
    console.log(`  ${pin}: ref ${a.length}, actual ${b.length}`);
    // HEAD AND TAIL, not just the head. A flat cap of 12 hid the only thing
    // worth seeing on 02-dimmer -> pico, where the first twelve rows agree to
    // the millisecond and the traces diverge at the END — the same shape as
    // reading a comparator's first three diffs and inferring what the whole
    // disagreement looks like. A drift is visible from the head; a truncation
    // is only visible from the tail.
    const n = Math.min(a.length, b.length);
    const rows = n <= 24 ? [...Array(n).keys()]
      : [...Array(12).keys(), null, ...[...Array(12).keys()].map((k) => n - 12 + k)];
    for (const i of rows) {
      if (i === null) { console.log(`    …  ${n - 24} rows elided  …`); continue; }
      const d = b[i].tMs - a[i].tMs;
      console.log(`    [${String(i).padStart(3)}] ref ${String(a[i].tMs).padStart(6)}=${a[i].level}` +
        `  actual ${String(b[i].tMs).padStart(6)}=${b[i].level}  delta ${d >= 0 ? '+' : ''}${d}` +
        (a[i].level !== b[i].level ? '  <- LEVEL differs' : ''));
    }
    // And what the shorter list is missing, which no aligned row can show.
    const longer = a.length > b.length ? 'ref' : (b.length > a.length ? 'actual' : null);
    if (longer) {
      const extra = (a.length > b.length ? a : b).slice(n);
      console.log(`    ${longer} continues past the other with ${extra.length} more: ` +
        extra.slice(0, 4).map((e) => `${e.tMs}=${e.level}`).join(' ') + (extra.length > 4 ? ' …' : ''));
    }
  }
}

const only = process.argv[2];
if (only === 'explain') {
  await explainMode(process.argv[3], process.argv[4] ?? 'nano');
  process.exit(0);
}
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
