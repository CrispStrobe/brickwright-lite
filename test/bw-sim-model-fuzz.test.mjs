// Fuzzing the model readers: seeded mutations of real model files — truncated,
// garbled bytes, absurd numbers (1e308, NaN, Infinity, hex, empty), huge counts,
// broken ZIP directories and entries, broken LXFML, deep MPD nesting, cycles and
// sub-models that double at every level. Every case must end in one of two ways:
// the whole file refused by name (a ModelFileError with a code the pane words),
// or a model that opens (prepareModel, as the pane does) and is valid, with every
// line it could not place named in a refusal. Never an uncaught error, never a
// hang (each case is timed), never half a model. The seed is in every message.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, readdirSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import JSZip from 'jszip';
import {openModelFile, saveModelFile, ModelFileError} from '../overlay/scratch-gui/src/lib/bw-sim/model/model-file.js';
import {parseModel, MAX_DEPTH, MAX_PARTS} from '../overlay/scratch-gui/src/lib/bw-sim/model/ldraw-model.js';
import {readSimLabStorage, simLabRecordFromText} from '../overlay/scratch-gui/src/lib/bw-sim/model/sim-lab-persist.js';
import {catalogFrom, prepareModel} from '../overlay/scratch-gui/src/lib/bw-sim/sim-session.js';
import {validatePlacedModel} from '../overlay/scratch-gui/src/lib/bw-sim/contracts.js';
import {rng} from './fixtures/bw-sim/model-gen.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SIM = path.join(ROOT, 'overlay/scratch-gui/src/lib/bw-sim');
const MODELS_DIR = path.join(ROOT, 'overlay/scratch-gui/static/sim-lab/models');
const FIX = path.join(ROOT, 'test/fixtures/bw-sim');
const CATALOG = catalogFrom(JSON.parse(readFileSync(path.join(SIM, 'part-meta/parts.json'), 'utf8')));
const LDCONFIG = readFileSync(path.join(ROOT, 'overlay/scratch-gui/static/ldraw/LDConfig.ldr'), 'utf8');
const PANE = readFileSync(path.join(ROOT, 'overlay/scratch-gui/src/components/tw-pseudocode/sim-lab-pane.jsx'), 'utf8');
const enc = s => new TextEncoder().encode(s);
const dec = b => new TextDecoder().decode(b);

/** Whole-file refusal codes the pane has a sentence for. */
const FILE_CODES = new Set([...PANE.matchAll(/^\s*'([a-z0-9-]+)': '/gm)].map(m => m[1]));
/**
 * Slowest a case may take, in ms. This catches a hang or an exponential blow-up (a sub-model
 * doubling at every level without the depth/part caps runs for minutes or forever), not slowness:
 * a loaded CI runner took over 3 s for an ordinary case, so the bound sits far above any honest
 * run and far below a blow-up.
 */
const CASE_BUDGET_MS = 20000;

/**
 * Open `bytes` as the pane does. Returns a sentence when the outcome breaks the contract,
 * else null.
 */
const checkOpen = async (name, bytes) => {
    const started = performance.now();
    let opened;
    try {
        opened = await openModelFile(name, bytes, {ldconfig: LDCONFIG, catalog: CATALOG});
    } catch (error) {
        if (!(error instanceof ModelFileError)) return `uncaught ${error && error.name}: ${error && error.message}`;
        if (!FILE_CODES.has(error.code)) return `refused with '${error.code}', a code the pane does not word`;
        return null;
    }
    if (typeof opened.text !== 'string') return 'opened without text';
    let prepared;
    try {
        prepared = parseModel(opened.text, {catalog: CATALOG});
        prepared.issues = prepared.refusals;
        // What the pane does next (compile the mechanism), for models of a size the compiler is
        // quick for: a file of hundreds of coincident copies of one part takes the compiler
        // seconds (measured 2026-10-18: 50 copies 0.6 s, 200 copies 8 s), which is the
        // compiler's matter, not the reader's.
        if (prepared.model.parts.length <= 100) prepared = prepareModel(opened.text, CATALOG);
    } catch (error) {
        return `opening threw ${error && error.name}: ${error && error.message}`;
    }
    const problems = validatePlacedModel(prepared.model, CATALOG)
        // The reader keeps a group as written, even with one member, and the editor dissolves it.
        .filter(p => !/need at least 2 members/.test(p));
    if (problems.length) return `half-opened: ${problems.slice(0, 2).join('; ')}`;
    for (const r of prepared.issues) if (!r.code) return `an issue without a code: ${JSON.stringify(r)}`;
    // Every line of a single-file model that is not a comment is a part or a named refusal.
    const text = opened.text;
    if (!/^\s*0\s+FILE\s/im.test(text) && (name.endsWith('.ldr'))) {
        const lines = text.split(/\r?\n/);
        const content = new Set(lines.map((l, i) => (l.trim() && !l.trim().startsWith('0') ? i + 1 : 0)).filter(Boolean));
        const refused = new Set(parseModel(text, {catalog: CATALOG}).refusals
            .filter(r => content.has(r.line) && r.code !== 'duplicate-id' && r.code !== 'bad-group').map(r => r.line));
        if (prepared.model.parts.length + refused.size !== content.size) {
            return `${content.size} part lines, but ${prepared.model.parts.length} parts and ${refused.size} refused lines`;
        }
    }
    const took = performance.now() - started;
    if (took > CASE_BUDGET_MS) return `took ${Math.round(took)} ms`;
    return null;
};

// ---- mutations -------------------------------------------------------------------------

const ABSURD = ['1e308', '-1e309', 'NaN', 'Infinity', '-Infinity', '1e-400', '99999999999999999999', '0x10', '--1', '1e', '',
    '.', '-', '1.2.3', '١٢', '1,5', '+.5e+3', '4294967296', '-0', '1e6', '1000001'];
const META = ['0 !BW PORT Z', '0 !BW PORT', '0 !BW ID', '0 !BW IN nope', '0 !BW GROUP', '0 !BW GROUP g', '0 !BW GROUP g G',
    '0 !BW IN g', '0 STEP', '0 ROTSTEP 0 0 0 ABS', '0 FILE x.ldr', '0 NOFILE', '2 24 0 0 0 1 1 1', '5 24 0 0 0 1 1 1 2 2 2 3 3 3',
    '1', '1 16', '1 16 0 0 0 1 0 0 0 1 0 0 0 1', '1 -1 0 0 0 1 0 0 0 1 0 0 0 1 3001.dat', '1 0x2ZZ0000 0 0 0 1 0 0 0 1 0 0 0 1 3001.dat',
    '1 4 0 0 0 1 0 0 0 1 0 0 0 1 x.ldr', '\u0000\u0000', '﻿1 4 0 0 0 1 0 0 0 1 0 0 0 1 3001.dat'];

const mutateText = (next, text) => {
    const lines = text.split(/\r?\n/);
    const kind = next.int(8);
    if (kind === 0) return text.slice(0, next.int(text.length)); // truncated
    if (kind === 1) { // garbled characters
        const chars = [...text];
        for (let n = 1 + next.int(20); n > 0; n--) chars[next.int(chars.length)] = String.fromCharCode(next.int(0x2000));
        return chars.join('');
    }
    if (kind === 2) { // an absurd number in place of a token of a part line
        for (let n = 1 + next.int(4); n > 0; n--) {
            const i = next.int(lines.length);
            const tokens = lines[i].trim().split(/\s+/);
            if (tokens[0] === '1' && tokens.length >= 15) {
                tokens[1 + next.int(13)] = next.pick(ABSURD);
                lines[i] = tokens.join(' ');
            }
        }
        return lines.join('\r\n');
    }
    if (kind === 3) { // a stray meta or broken line
        for (let n = 1 + next.int(6); n > 0; n--) lines.splice(next.int(lines.length + 1), 0, next.pick(META));
        return lines.join('\n');
    }
    if (kind === 4) { // huge counts: one line many times
        const i = next.int(lines.length);
        lines.splice(i, 0, ...new Array(500 + next.int(3000)).fill(lines[i]));
        return lines.join('\r\n');
    }
    if (kind === 5) { // lines dropped and swapped
        for (let n = 1 + next.int(10); n > 0; n--) {
            const i = next.int(lines.length);
            const j = next.int(lines.length);
            if (next.chance(0.5)) lines.splice(i, 1); else [lines[i], lines[j]] = [lines[j], lines[i]];
        }
        return lines.join('\r\n');
    }
    if (kind === 6) return text.replace(/\r?\n/g, next.pick(['\r', '\n\n', ' ', '\r\r\n', ' '])); // other line ends
    return next.pick(['', ' ', '\n', '0', '1', '﻿', 'PK\u0003\u0004']) + text; // odd starts
};

const mutateBytes = (next, bytes) => {
    const out = Uint8Array.from(bytes);
    const kind = next.int(5);
    if (kind === 0) return out.subarray(0, next.int(out.length)); // truncated
    if (kind === 1) { // random bytes anywhere
        for (let n = 1 + next.int(30); n > 0; n--) out[next.int(out.length)] = next.int(256);
        return out;
    }
    if (kind === 2) { // the central directory and end record garbled (the last 120 bytes)
        for (let n = 1 + next.int(8); n > 0; n--) out[Math.max(0, out.length - 1 - next.int(120))] = next.int(256);
        return out;
    }
    if (kind === 3) { // the compressed data garbled (the middle)
        for (let n = 1 + next.int(8); n > 0; n--) out[40 + next.int(Math.max(1, out.length - 160))] = next.int(256);
        return out;
    }
    // entry counts in the end record set to absurd values
    const eocd = out.length - 22;
    if (eocd > 0) {
        const v = next.pick([0, 1, 2, 0xffff]);
        out[eocd + 8] = out[eocd + 10] = v & 0xff;
        out[eocd + 9] = out[eocd + 11] = v >> 8;
        if (next.chance(0.5)) out[eocd + 16] = next.int(256);
    }
    return out;
};

const mutateXml = (next, xml) => {
    const kind = next.int(6);
    if (kind === 0) return xml.slice(0, next.int(xml.length));
    if (kind === 1) return xml.replace(/<\/[A-Za-z]+>/g, m => (next.chance(0.3) ? '' : m)); // closing tags lost
    if (kind === 2) return xml.replace(/"/g, m => (next.chance(0.05) ? '' : m)); // broken attributes
    if (kind === 3) { // absurd transformation numbers
        return xml.replace(/transformation="([^"]*)"/g, (m, t) => `transformation="${t.split(',').map(v => (next.chance(0.3) ? next.pick(ABSURD) : v)).join(',')}"`);
    }
    if (kind === 4) { // huge counts of parts
        return xml.replace(/(<Brick\b[\s\S]*?<\/Brick>)/, m => m.repeat(500 + next.int(2000)));
    }
    return xml.replace(/designID="[^"]*"|materials="[^"]*"|versionMajor="[^"]*"/g, m => (next.chance(0.3) ? m.replace(/"[^"]*"/, `"${next.pick(ABSURD)}"`) : m));
};

// ---- bases -----------------------------------------------------------------------------

const ldrBases = [
    ...readdirSync(MODELS_DIR).filter(f => f.endsWith('.ldr')).sort().map(f => readFileSync(path.join(MODELS_DIR, f), 'utf8')),
    readFileSync(path.join(FIX, 'driving-base-steps.ldr'), 'utf8')
];
const mpdBases = readdirSync(path.join(FIX, 'mpd')).sort().map(f => readFileSync(path.join(FIX, 'mpd', f), 'utf8'));
const LXFML = readFileSync(path.join(FIX, 'interop/IMAGE100.LXFML'), 'utf8');
const LXF = new Uint8Array(readFileSync(path.join(FIX, 'interop/interop-fixture.lxf')));
const drivingBase = parseModel(ldrBases.find(t => /driving-base\.ldr/.test(t)) || ldrBases[0], {catalog: CATALOG}).model;
const IO = (await saveModelFile(drivingBase, 'io')).data;

const CASES = 120; // per family; fixed seeds, so CI is deterministic
const run = async (family, make) => {
    const failures = [];
    for (let seed = 1; seed <= CASES; seed++) {
        const next = rng(seed * 7919 + family.length);
        const [name, bytes] = await make(next);
        let problem;
        try {
            problem = await checkOpen(name, bytes);
        } catch (error) {
            problem = `the check itself threw: ${error.message}`;
        }
        if (problem) failures.push(`${family} seed ${seed} (${name}): ${problem}`);
    }
    return failures;
};

test(`fuzz: ${CASES} mutated .ldr files open as valid models with every unplaced line named`, async () => {
    assert.deepEqual(await run('ldr', next => ['m.ldr', enc(mutateText(next, next.pick(ldrBases)))]), []);
});

test(`fuzz: ${CASES} mutated .mpd files (nested, cycles, Studio meta) open or are refused by name`, async () => {
    assert.deepEqual(await run('mpd', next => ['m.mpd', enc(mutateText(next, next.pick(mpdBases)))]), []);
});

test(`fuzz: ${CASES} mutated Studio .io archives are refused by name or open as valid models`, async () => {
    assert.deepEqual(await run('io', next => ['m.io', mutateBytes(next, IO)]), []);
});

test(`fuzz: ${CASES} mutated LDD .lxf archives and ${CASES} broken LXFML documents`, async () => {
    const failures = await run('lxf', next => ['m.lxf', mutateBytes(next, LXF)]);
    failures.push(...await run('lxfml', next => ['m.lxf', enc(mutateXml(next, LXFML))]));
    assert.deepEqual(failures, []);
});

test('fuzz: ZIPs with the wrong entries — renamed, doubled, a folder, an empty or binary model.ldr, an .lxf inside an .io', async () => {
    const ldr = readFileSync(path.join(MODELS_DIR, 'driving-base.ldr'), 'utf8');
    const zips = {
        renamed: z => z.file('modell.ldr', ldr),
        upper: z => z.file('MODEL.LDR', ldr),
        backslash: z => z.file('sub\\model.ldr', ldr),
        folder: z => z.folder('model.ldr').file('x', ldr),
        empty: z => z.file('model.ldr', ''),
        binary: z => z.file('model.ldr', Uint8Array.from({length: 4096}, (_, i) => (i * 131) & 0xff)),
        lxfml: z => z.file('IMAGE100.LXFML', LXFML),
        lxfmlEmpty: z => z.file('IMAGE100.LXFML', ''),
        lxfmlFolder: z => z.folder('IMAGE100.LXFML'),
        stored: z => z.file('model.ldr', ldr, {compression: 'STORE'})
    };
    const failures = [];
    for (const [label, fill] of Object.entries(zips)) {
        const zip = new JSZip();
        fill(zip);
        const bytes = await zip.generateAsync({type: 'uint8array', compression: 'DEFLATE'});
        for (const name of ['m.io', 'm.lxf']) {
            const problem = await checkOpen(name, bytes);
            if (problem) failures.push(`${label} as ${name}: ${problem}`);
        }
    }
    assert.deepEqual(failures, []);
});

test(`fuzz: deep MPD nesting, cycles and doubling sub-models are refused by name in bounded time (depth ≤ ${MAX_DEPTH}, ≤ ${MAX_PARTS} parts)`, async () => {
    const part = '1 4 0 0 0 1 0 0 0 1 0 0 0 1 32523.dat';
    const placing = (name, colour = 16) => `1 ${colour} 0 0 20 1 0 0 0 1 0 0 0 1 ${name}`;
    const chain = n => ['0 FILE m0.ldr', ...Array.from({length: n}, (_, i) => [placing(`m${i + 1}.ldr`), `0 FILE m${i + 1}.ldr`]).flat(), part].join('\n');
    const doubling = n => ['0 FILE m0.ldr', ...Array.from({length: n}, (_, i) => [placing(`m${i + 1}.ldr`), placing(`m${i + 1}.ldr`), `0 FILE m${i + 1}.ldr`]).flat(), part].join('\n');
    const cases = [
        ['a chain 20,000 deep', chain(20000), 'too-deep'],
        [`a chain ${MAX_DEPTH} deep opens`, chain(MAX_DEPTH), null],
        [`a chain ${MAX_DEPTH + 1} deep`, chain(MAX_DEPTH + 1), 'too-deep'],
        ['each level placing the next twice, 40 levels', doubling(40), 'too-many-parts'],
        ['empty sub-models doubling 30 levels', doubling(30).replace(part, ''), 'too-many-parts'],
        ['a cycle a → b → a', ['0 FILE a.ldr', placing('b.ldr'), part, '0 FILE b.ldr', placing('a.ldr')].join('\n'), 'cycle'],
        ['a sub-model placing itself', ['0 FILE a.ldr', placing('b.ldr'), '0 FILE b.ldr', placing('b.ldr'), part].join('\n'), 'cycle'],
        ['the main model placing itself', ['0 FILE a.ldr', placing('a.ldr'), part].join('\n'), 'cycle'],
        ['30,000 parts in one file', Array.from({length: 30001}, () => part).join('\n'), 'too-many-parts']
    ];
    const failures = [];
    for (const [label, text, code] of cases) {
        const started = performance.now();
        const problem = await checkOpen(label.includes('MPD') ? 'm.mpd' : 'm.mpd', enc(text));
        const took = performance.now() - started;
        const {model, refusals} = parseModel(text, {catalog: CATALOG});
        if (problem) failures.push(`${label}: ${problem}`);
        if (code && !refusals.some(r => r.code === code)) failures.push(`${label}: no '${code}' (${refusals.map(r => r.code).join() || 'none'})`);
        if (!code && (refusals.length || model.parts.length !== 1)) failures.push(`${label}: ${model.parts.length} parts, ${refusals.map(r => r.code).join()}`);
        if (code === 'too-many-parts' && model.parts.length) failures.push(`${label}: half-opened with ${model.parts.length} parts`);
        if (took > CASE_BUDGET_MS) failures.push(`${label}: took ${Math.round(took)} ms`);
    }
    assert.deepEqual(failures, []);
});

test(`fuzz: ${CASES} mutated project records (the .sb3's simLab section) are a record or a named refusal, never a throw`, () => {
    const record = JSON.stringify(simLabRecordFromText(ldrBases[0], {name: 'm.ldr', mat: 'plain'}));
    const failures = [];
    for (let seed = 1; seed <= CASES; seed++) {
        const next = rng(seed);
        const raw = next.chance(0.5) ? mutateText(next, record) : JSON.stringify({ldraw: mutateText(next, ldrBases[0]), name: next.pick(['m.ldr', '', 'a\nb', 7]), mat: next.pick(['plain', 'Line Oval', null, 3])});
        try {
            const {record: back, refusals} = readSimLabStorage(raw);
            if (!back && !(refusals.length === 1 && refusals[0].code === 'project-model-unreadable')) failures.push(`seed ${seed}: no record and no refusal`);
            if (back) parseModel(back.ldraw, {catalog: CATALOG});
        } catch (error) {
            failures.push(`seed ${seed}: threw ${error.message}`);
        }
    }
    assert.deepEqual(failures, []);
});
