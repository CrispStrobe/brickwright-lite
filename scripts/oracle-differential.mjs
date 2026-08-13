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
 *   node scripts/oracle-differential.mjs             # all programs, both devices
 *   node scripts/oracle-differential.mjs pico        # one device
 *   COMPILER_URL=... overrides the service (default the public one).
 *
 * Exit code 0 only if every differential agrees.
 */
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

const only = process.argv[2];
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
