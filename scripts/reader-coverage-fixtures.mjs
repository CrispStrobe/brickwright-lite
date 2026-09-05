/**
 * Fixtures for the reader coverage audit (plan L3), assembled from sources that
 * already live in this repository — nothing is hand-authored here.
 *
 * Two acquisition methods, both reproducible from the tree:
 *
 *  - ROUND-TRIP, for the five emit-target readers (python, javascript, c,
 *    basic, micropython). These languages have no hand-written source corpus in
 *    the tree; they are what the lowered path EMITS. So the honest coverage
 *    question is whether the reader can lift back what the emitter produced:
 *    each device-tagged program.bw in overlay/scratch-gui/examples is parsed,
 *    emitted to the language, and that emitted source becomes the fixture. This
 *    literally measures the honest half of the lowered column.
 *
 *  - NATIVE, for the readers that DO have real source in the tree: the 8086
 *    lifter (bw-asm/examples-i8086.js, 11 MASM programs) and the device-C reader
 *    (the two oracle .c fixtures). These are fed to the reader verbatim.
 *
 * The five emitters and the SB3 creator resolve `jszip`/`scratch-vm` only from
 * the INTEGRATED tree (packages/scratch-gui), which is where the other gates
 * import them from; the corpus itself is always read from overlay/, the source
 * of truth in git. In a worktree, set BW_INTEGRATED_ROOT to a checkout whose
 * packages/scratch-gui has node_modules installed. The readers themselves are
 * standalone and are imported by the generator directly from overlay/.
 *
 * Committed numbers use in-tree sources only, so the generated document is
 * reproducible in CI. The external 525-program Amey Thakur corpus
 * (/mnt/volume1/code/retro-corpus-8086, MIT, present under I8086_CORPUS) is a
 * larger asm input available behind that env var; it is deliberately NOT folded
 * into the committed figures, only named in the provenance table.
 */
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const overlayLib = path.join(root, 'overlay/scratch-gui/src/lib');
const exDir = path.join(root, 'overlay/scratch-gui/examples');
const INTEGRATED = process.env.BW_INTEGRATED_ROOT
    ? path.resolve(process.env.BW_INTEGRATED_ROOT)
    : path.join(root, 'packages/scratch-gui');

const SB3 = (await import(path.join(INTEGRATED, 'src/lib/sb3-creator.js'))).default;

// device id → coarse family, for the "per device family" grouping.
const FAMILY = {
    'stc12c5a60s2': '8051', 'stc89c52rc': '8051', 'stc15f2k60s2': '8051', 'stc': '8051',
    'arduino-uno': 'arduino', 'arduino-nano': 'arduino', 'arduino-mega': 'arduino',
    'atmega168p': 'arduino', 'atmega328p': 'arduino', 'attiny88': 'arduino', 'attiny85': 'arduino',
    'pico': 'pico', 'microbit': 'microbit', 'stm32f030': 'stm32',
    'eater6502': '6502', 'z80': 'z80', 'z80-pd': 'z80', 'spike': 'spike'
};
const famOf = dev => {
    if (!dev) return 'generic';
    const d = String(dev).toLowerCase();
    if (FAMILY[d]) return FAMILY[d];
    if (d.startsWith('stc')) return '8051';
    if (d.startsWith('arduino') || d.startsWith('atmega') || d.startsWith('attiny')) return 'arduino';
    if (d.startsWith('stm32')) return 'stm32';
    if (d.startsWith('z80')) return 'z80';
    return d;
};
const deviceOf = (bw, entry) => {
    const m = bw.match(/^\s*DEVICE\s+(\S+)/im);
    if (m) return m[1].replace(/[:;,.]+$/, ''); // a stray "DEVICE MICROBIT:" must not become its own family
    return (entry.devices && entry.devices[0]) || null;
};

// The lowered-path emitters. Each returns source text, or null when the project
// uses something the language cannot express — that is an emitter gap, not a
// reader verdict, so it is tallied separately and never fed to a reader.
const EMITTERS = {
    python: proj => String(new SB3().generatePython(proj, {})),
    javascript: proj => String(new SB3().generateJavaScript(proj, {})),
    c: proj => String(new SB3().generateC(proj)),
    basic: proj => { const r = new SB3().generateBASIC(proj, {profile: 'bbc', lineNumbers: true}); return r && r.ok ? r.basic : null; },
    micropython: proj => { const r = new SB3().generateMicroPython(proj); return r && r.ok ? r.py : null; }
};

const fixtures = [];
const notEmitted = {python: 0, javascript: 0, c: 0, basic: 0, micropython: 0};
let parseFailed = 0;
let corpusPrograms = 0;

const idx = JSON.parse(fs.readFileSync(path.join(exDir, 'index.json'), 'utf8'));
const tagged = idx
    .filter(e => e.files && e.files.program && (e.devices || []).length)
    .sort((a, b) => a.id.localeCompare(b.id)); // deterministic order

for (const entry of tagged) {
    const file = path.join(exDir, entry.files.program);
    if (!fs.existsSync(file)) continue;
    const bw = fs.readFileSync(file, 'utf8');
    let proj;
    try { const c = new SB3(); c.parse(bw); proj = c.project; }
    catch { parseFailed++; continue; }
    corpusPrograms++;
    const family = famOf(deviceOf(bw, entry));
    for (const [lang, emit] of Object.entries(EMITTERS)) {
        let src = null;
        try { src = emit(proj); } catch { src = null; }
        if (src == null || !src.trim()) { notEmitted[lang]++; continue; }
        fixtures.push({lang, family, name: entry.id, source: src, kind: 'round-trip'});
    }
}

// ROUND-TRIP asm: the reader's actual LIFT job is to read back what the ▶
// button lowered, so its lift coverage is measured by lowering the i8086
// pseudocode examples through the emitter and reading them back — the same
// path the reader's own test exercises with lower().
const {emitI8086Asm} = await import(path.join(overlayLib, 'bw-asm/pseudocode-8086.js'));
const examples = (await import(path.join(overlayLib, 'sb3-creator-examples.js'))).default;
for (const key of Object.keys(examples).filter(k => /^i8086_/.test(k)).sort()) {
    const pseudo = examples[key];
    let asm = null;
    try {
        const c = new SB3(); c.parse(pseudo);
        const out = emitI8086Asm(c.project, {source: pseudo});
        asm = typeof out === 'string' ? out : out && out.asm;
    } catch { asm = null; }
    if (!asm || !asm.trim()) { continue; }
    fixtures.push({lang: 'asm', family: '8086', name: key, source: asm, kind: 'round-trip'});
}

// NATIVE asm: the 11 in-tree hand-written 8086 programs. The reader is designed
// to REFUSE these as foreign (they carry no Brickwright anchors) — measuring
// that it declines a stranger's program by name rather than lifting it as
// noise. The 6 from I8086_EXAMPLES carry an Amey Thakur MIT attribution; the
// other 5 are ours (repo BSD-3).
const asmExamples = (await import(path.join(overlayLib, 'bw-asm/examples-i8086.js'))).default;
for (const ex of asmExamples) {
    if (!ex || !ex.source) continue;
    fixtures.push({lang: 'asm', family: '8086', name: ex.id, source: ex.source, kind: 'native'});
}

// NATIVE C: the two oracle fixtures, real hand-written device source.
const nativeC = [
    {name: 'stc12-blink', family: '8051', file: 'test/fixtures/oracle/stc12-blink.c'},
    {name: 'atmega328p-blink', family: 'arduino', file: 'test/fixtures/oracle/atmega328p-blink.c'}
];
for (const c of nativeC) {
    const p = path.join(root, c.file);
    if (!fs.existsSync(p)) continue;
    fixtures.push({lang: 'c', family: c.family, name: c.name, source: fs.readFileSync(p, 'utf8'), kind: 'native'});
}

export const FIXTURES = fixtures;

export const FIXTURE_SOURCES = [
    {id: 'program.bw corpus', langs: ['python', 'javascript', 'c', 'basic', 'micropython'],
        origin: `overlay/scratch-gui/examples — ${corpusPrograms} device-tagged programs, round-tripped (parse → emit → read back). Emitter gaps not fed to a reader: ${Object.entries(notEmitted).map(([l, n]) => `${l} ${n}`).join(', ')}${parseFailed ? `; ${parseFailed} .bw failed to parse` : ''}`,
        licence: 'BSD-3 (repo); Arduino-port programs CC0'},
    {id: 'examples-i8086.js', langs: ['asm'],
        origin: `overlay/scratch-gui/src/lib/bw-asm/examples-i8086.js — ${asmExamples.length} MASM programs (6 Amey Thakur, 5 ours), fed native`,
        licence: 'MIT (Amey Thakur set) / BSD-3 (ours)'},
    {id: 'oracle C fixtures', langs: ['c'],
        origin: 'test/fixtures/oracle/{stc12-blink,atmega328p-blink}.c — real device C, fed native to the pin-inferring reader',
        licence: 'BSD-3 (repo)'},
    {id: 'Amey Thakur external corpus (not folded in)', langs: ['asm'],
        origin: '/mnt/volume1/code/retro-corpus-8086 (525 .asm, env I8086_CORPUS) — a larger asm input, deliberately excluded from committed figures so CI stays reproducible',
        licence: 'MIT'}
];
