// The behavioural-differential harness (scripts/arcade-differential.mjs): alignment and
// classification on synthetic recordings, the process watchdog, and an end-to-end run of
// tiny authored fixtures through the real original simulator and the real Brickwright VM.
// Imports no GUI-scope package in-process (the sides run in child processes).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {compareRecordings, distinctStates, packSamples, pixelDiff, regionOf, causeName, frameHash} from '../scripts/lib/arcade-differential/compare.mjs';
import {makeSchedule, sampleTimes, SCRIPT_NAMES} from '../scripts/lib/arcade-differential/script.mjs';
import {PRNG_SOURCE} from '../scripts/lib/arcade-differential/entropy.mjs';
import {runJob, descendants} from '../scripts/lib/arcade-differential/watchdog.mjs';
import {analyzeProgram, classifyScript, rollup, topLevelNames, normalizeError} from '../scripts/lib/arcade-differential/analyze.mjs';
import {summarize, renderMarkdown} from '../scripts/lib/arcade-differential/report.mjs';

const PALETTE = Array.from({length: 16}, (_, i) => (i * 0x111111).toString(16).padStart(6, '0'));
const blank = () => '0'.repeat(160 * 120);
const withPixel = (x, y, c = '1') => { const p = blank().split(''); p[y * 160 + x] = c; return p.join(''); };
const sprite = (x, extra = {}) => ({id: 0, kind: 1000, x, y: 60, z: 0, visible: true, image: '4x3:aa', ...extra});
// A recording of n samples; `at(k)` returns {sprites, pix, score,...} overrides.
function recording(n, at = () => ({})) {
    const samples = [];
    for (let k = 0; k < n; k++) samples.push({k, t: Math.round((k + 1) * 1000 / 30), sprites: [sprite(10)], score: 0, life: null, globals: {}, pix: blank(), palette: PALETTE, ...at(k)});
    return {status: 'ok', ...packSamples(samples)};
}

test('identical recordings are identical, tolerance covers sub-step float noise only', () => {
    assert.equal(compareRecordings(recording(20), recording(20)).class, 'identical');
    assert.equal(compareRecordings(recording(5), recording(5, () => ({sprites: [sprite(10.004)]}))).class, 'identical');
    assert.equal(compareRecordings(recording(5), recording(5, () => ({sprites: [sprite(10.05)]}))).class, 'diverges');
});

test('an unreadable image or an unreadable global is not a difference', () => {
    const a = recording(3, () => ({globals: {n: 1}})), b = recording(3, () => ({sprites: [sprite(10, {image: null})]}));
    assert.equal(compareRecordings(a, b).class, 'identical');
});

test('palette order is irrelevant: frames compare by resolved colour', () => {
    const swapped = [...PALETTE]; swapped[1] = PALETTE[2]; swapped[2] = PALETTE[1];
    const a = recording(2, () => ({pix: withPixel(5, 5, '1')})), b = recording(2, () => ({pix: withPixel(5, 5, '2'), palette: swapped}));
    assert.equal(compareRecordings(a, b).class, 'identical');
});

test('a pure timing offset is its own class and reports the offset', () => {
    // The same sequence of states; Brickwright reaches each of them 3 samples later.
    const state = k => ({sprites: [sprite(10 + Math.floor(k / 6) * 5)], score: Math.floor(k / 6)});
    const a = recording(30, state), b = recording(30, k => state(Math.max(0, k - 3)));
    const result = compareRecordings(a, b);
    assert.equal(result.class, 'same-states-different-timing');
    assert.equal(result.firstDifference.k, 6);
    assert.ok(result.medianOffsetMs > 0 && result.maxAbsOffsetMs >= 90 && result.maxAbsOffsetMs <= 110, JSON.stringify(result));
    assert.equal(result.distinctStates, 5);
});

test('a different state sequence diverges with the first differing sprite field, frame and pixel region', () => {
    const a = recording(10, k => ({sprites: [sprite(10 + k)]})), b = recording(10, k => ({sprites: [sprite(10 + (k < 4 ? k : k * 2))]}));
    const result = compareRecordings(a, b);
    assert.equal(result.class, 'diverges');
    assert.equal(result.firstDifference.k, 4);
    assert.deepEqual(result.firstDifference.diffs[0], {type: 'sprite-position', index: 0, field: 'x', original: 14, brickwright: 18});
    assert.equal(result.primaryCause, 'sprite-position:few-pixels');
    const pixels = compareRecordings(recording(3), recording(3, k => k >= 1 ? {pix: withPixel(4, 100)} : {}));
    assert.equal(pixels.firstDifference.k, 1);
    assert.deepEqual(pixels.firstDifference.diffs[0], {type: 'pixels', region: 'small-region', count: 1, bbox: {x0: 4, y0: 100, x1: 4, y1: 100}});
    assert.equal(pixels.primaryCause, 'pixels:small-region');
});

test('score, life, sprite count and global differences are each detected and ranked by priority', () => {
    const cause = (patch, base = {}) => compareRecordings(recording(2, () => base), recording(2, () => patch)).primaryCause;
    assert.equal(cause({score: 3}), 'score');
    assert.equal(cause({life: 2}), 'life');
    assert.equal(cause({sprites: []}), 'sprite-count:original-has-more');
    assert.equal(cause({sprites: [sprite(10), sprite(20, {id: 1})]}), 'sprite-count:brickwright-has-more');
    assert.equal(cause({globals: {n: 2}}, {globals: {n: 1}}), 'global');
    assert.equal(cause({sprites: [sprite(10, {image: '4x3:bb'})]}), 'sprite-image');
    assert.equal(cause({sprites: [sprite(10, {visible: false})]}), 'sprite-visibility');
});

test('a side that ends early is a divergence, not a pass', () => {
    const result = compareRecordings(recording(10), recording(6));
    assert.equal(result.class, 'diverges');
    assert.equal(result.primaryCause, 'run-length:brickwright-ended-first');
});

test('deduplication collapses consecutive equal states and tracks first/last sample', () => {
    const rec = recording(9, k => ({score: Math.floor(k / 3)}));
    const states = distinctStates(rec.samples, rec.frames);
    assert.deepEqual(states.map(s => [s.firstK, s.lastK]), [[0, 2], [3, 5], [6, 8]]);
});

test('pixel diff regions are anonymous categories', () => {
    const f = pix => ({pix, palette: PALETTE});
    assert.equal(pixelDiff(f(blank()), f(blank())), null);
    assert.equal(regionOf(pixelDiff(f(blank()), f(withPixel(3, 2)))), 'top-band');
    assert.equal(regionOf(pixelDiff(f(blank()), f(withPixel(3, 60)))), 'small-region');
    assert.equal(regionOf(pixelDiff(f(blank()), f('1'.repeat(19200)))), 'most-of-frame');
    assert.equal(frameHash(f(blank())), frameHash({pix: blank(), palette: PALETTE}));
    assert.equal(causeName({type: 'sprite-position', original: 10, brickwright: 10.5}), 'sprite-position:subpixel');
});

test('input scripts are deterministic, on the sample grid, and end released', () => {
    assert.equal(sampleTimes(1).length, 30);
    assert.deepEqual(sampleTimes(1).slice(0, 3), [33, 67, 100]);
    for (const name of SCRIPT_NAMES) {
        const a = makeSchedule(name, 8), b = makeSchedule(name, 8);
        assert.deepEqual(a.events, b.events);
        const held = new Set();
        for (const e of a.events) { assert.ok(e.k >= 0 && e.k < 240); e.down ? held.add(e.button) : held.delete(e.button); }
        assert.equal(held.size, 0, `${name} leaves buttons held`);
    }
    assert.equal(makeSchedule('idle', 8).events.length, 0);
    assert.deepEqual([...new Set(makeSchedule('arrows', 8).events.map(e => e.button))].sort(), ['down', 'left', 'right', 'up']);
    assert.deepEqual([...new Set(makeSchedule('ab', 8).events.map(e => e.button))].sort(), ['A', 'B']);
    assert.throws(() => makeSchedule('nope', 1), /Unknown input script/);
});

test('classification precedence and anonymisation', () => {
    const ok = (extra = {}) => ({status: 'ok', ...packSamples([{k: 0, t: 33, sprites: [], score: 0, life: null, globals: {}, pix: blank(), palette: PALETTE}]), ...extra});
    assert.equal(classifyScript(ok(), ok()).class, 'identical');
    assert.equal(classifyScript(null, ok()).class, 'timeout');
    assert.equal(classifyScript(ok(), null).side, 'brickwright');
    assert.equal(classifyScript({status: 'compile-error', diagnostics: ['main.ts:3: Cannot find name \'assets\'']}, ok()).class, 'not-comparable');
    assert.equal(classifyScript({status: 'compile-error', diagnostics: ['main.ts:3: Type error']}, ok()).class, 'original-error');
    assert.equal(classifyScript(ok(), {status: 'error', error: 'Error: bad "Name_7" at 12\nstack', samples: []}).cause, 'Error: bad "…" at N');
    assert.equal(classifyScript({status: 'ok', samples: [{k: 0, t: 1, frame: null}], frames: []}, ok()).reason, 'original-produced-no-display');
    assert.equal(rollup({a: {class: 'identical'}, b: {class: 'diverges'}, c: {class: 'same-states-different-timing'}}), 'diverges');
    assert.equal(rollup({a: {class: 'diverges'}, b: {class: 'timeout'}}), 'timeout');
    assert.deepEqual(topLevelNames('let a = 1\nconst b = 2\n  let inner = 3\nvar c_d = 4'), ['a', 'b', 'c_d']);
    assert.equal(normalizeError("Variable 'secretName' = 42 failed"), 'Variable "…" = N failed');
});

test('the summary holds counts and cause categories only', () => {
    const rows = [
        {file: 'private-a.ts', class: 'diverges', scripts: {idle: {class: 'diverges', primaryCause: 'score'}, ab: {class: 'identical'}}},
        {file: 'private-b.ts', class: 'diverges', scripts: {idle: {class: 'diverges', primaryCause: 'score'}}},
        {file: 'private-c.ts', class: 'diverges', scripts: {idle: {class: 'diverges', primaryCause: 'sprite-count:original-has-more', constantEntropy: {class: 'identical'}}}},
        {file: 'private-d.ts', class: 'timeout', scripts: {idle: {class: 'timeout', side: 'brickwright'}}}
    ];
    const summary = summarize(rows);
    assert.equal(summary.programs.diverges, 3);
    assert.deepEqual(summary.causes.map(c => [c.cause, c.programs]), [['score', 2], ['random-draw-order-or-count', 1], ['timeout:brickwright', 1]]);
    const markdown = renderMarkdown(summary);
    assert.ok(!markdown.includes('private-'));
    assert.match(markdown, /\| 1 \| score \| diverges \| 2 \| 2 \|/);
});

test('platform draws are served from a separate stream, so program draw k is the same value on both sides', () => {
    const make = (seed, skip) => (0, eval)(PRNG_SOURCE)(seed, false, skip);
    // Side A draws once from "platform" code before the program; side B does not.
    const a = make(5, 'platformCode'), b = make(5, 'platformCode');
    const fromPlatform = d => { const platformCode = () => d(); return platformCode(); };
    fromPlatform(a);
    const first = [a(), a(), a()], second = [b(), b(), b()];
    assert.deepEqual(first, second);
    assert.equal(a.count, 3);
    assert.equal(b.count, 3);
    assert.notEqual(make(5)(), make(6)());
    assert.equal((0, eval)(PRNG_SOURCE)(1, true)(), 0.5);
});

test('a difference while the Brickwright text prompt is up is attributed to the prompt, and diverging random draws are located', () => {
    const a = recording(4, k => ({draws: k < 2 ? 3 : 5}));
    const b = recording(4, k => ({draws: k < 2 ? 3 : 7, textPrompt: true, pix: withPixel(80, 60)}));
    const result = compareRecordings(a, b);
    assert.equal(result.primaryCause, 'pixels:text-prompt');
    assert.deepEqual(result.randomDraws, {firstMismatchK: 2, original: 5, brickwright: 7});
});

// ---- watchdog -------------------------------------------------------------------------------

test('the watchdog kills a wedged child and everything it started, and keeps results already produced', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bw-diff-watchdog-'));
    try {
        const child = path.join(dir, 'wedge.mjs');
        const marker = path.join(dir, 'grandchild.pid');
        fs.writeFileSync(child, `import fs from 'node:fs';import {spawn} from 'node:child_process';
const job = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
fs.appendFileSync(job.out, JSON.stringify({script: 'idle', result: {status: 'ok'}}) + '\\n');
const g = spawn(process.execPath, ['-e', 'setInterval(()=>{},1000)'], {detached: true, stdio: 'ignore'});
fs.writeFileSync(${JSON.stringify(marker)}, String(g.pid));
for (;;) {}\n`);
        const started = Date.now();
        const result = await runJob({side: 'x'}, {timeoutMs: 1500, workDir: dir, childScript: child});
        assert.equal(result.status, 'timeout');
        assert.ok(Date.now() - started < 10000, 'returns promptly after the deadline');
        assert.deepEqual(result.lines, [{script: 'idle', result: {status: 'ok'}}], 'a result written before the hang survives');
        const grandchild = Number(fs.readFileSync(marker, 'utf8'));
        assert.ok(result.killed.includes(grandchild), 'the detached grandchild is in the killed tree');
        assert.throws(() => process.kill(grandchild, 0), /ESRCH/, 'grandchild is gone');
    } finally { fs.rmSync(dir, {recursive: true, force: true}); }
});

test('a child that exits normally is done; a crash is reported with its stderr', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bw-diff-watchdog-'));
    try {
        const okChild = path.join(dir, 'ok.mjs'), badChild = path.join(dir, 'bad.mjs');
        fs.writeFileSync(okChild, `import fs from 'node:fs';const j=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));fs.appendFileSync(j.out,JSON.stringify({script:'a',result:1})+'\\n');`);
        fs.writeFileSync(badChild, `process.stderr.write('boom');process.exit(7);`);
        const done = await runJob({}, {timeoutMs: 20000, workDir: dir, childScript: okChild});
        assert.equal(done.status, 'done'); assert.deepEqual(done.lines, [{script: 'a', result: 1}]);
        const crashed = await runJob({}, {timeoutMs: 20000, workDir: dir, childScript: badChild});
        assert.equal(crashed.status, 'crashed'); assert.match(crashed.stderr, /boom/);
        assert.deepEqual(fs.readdirSync(dir).filter(f => f.startsWith('job-') || f.startsWith('out-')), [], 'job files are cleaned up');
    } finally { fs.rmSync(dir, {recursive: true, force: true}); }
});

test('descendants finds a live grandchild and nothing under an unused pid', async () => {
    const {spawn} = await import('node:child_process');
    const parent = spawn(process.execPath, ['-e', `const {spawn}=require('node:child_process');
        const g=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'});
        process.stdout.write(String(g.pid)+'\\n');setInterval(()=>{},1000)`], {stdio: ['ignore', 'pipe', 'ignore']});
    try {
        const grandchild = Number(await new Promise(resolve => parent.stdout.once('data', d => resolve(String(d).trim()))));
        assert.deepEqual(descendants(parent.pid), [grandchild]);
        assert.deepEqual(descendants(2 ** 22 - 1), []);
    } finally { parent.kill('SIGKILL'); }
});

// ---- end to end: original simulator vs Brickwright ------------------------------------------

const FIXTURE = `let mover = sprites.create(img\`
    . 2 2 .
    2 2 2 2
    . 2 2 .
\`, SpriteKind.Player)
mover.vx = 20
info.setScore(3)
let ticks = 0
game.onUpdate(function () { ticks += 1 })
controller.moveSprite(mover)
`;
const e2e = {seconds: 2, fps: 30, seed: 7, entropy: 'sequence', scripts: ['idle', 'arrows'], timeoutMs: {original: 120000, brickwright: 60000}, entropyProbe: false};

test('end to end: a tiny Arcade program behaves identically in the original simulator and Brickwright', {timeout: 240000}, async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bw-diff-e2e-'));
    try {
        const result = await analyzeProgram(FIXTURE, {...e2e, workDir: dir});
        assert.deepEqual(Object.fromEntries(Object.entries(result.scripts).map(([k, v]) => [k, v.class])), {idle: 'identical', arrows: 'identical'}, JSON.stringify(result.scripts));
        assert.equal(result.class, 'identical');
    } finally { fs.rmSync(dir, {recursive: true, force: true}); }
});

test('end to end: a planted difference is detected and located', {timeout: 240000}, async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bw-diff-e2e-'));
    try {
        // Brickwright is handed a program whose sprite is faster and whose score differs.
        const twin = FIXTURE.replace('mover.vx = 20', 'mover.vx = 60').replace('setScore(3)', 'setScore(4)');
        const result = await analyzeProgram(FIXTURE, {...e2e, scripts: ['idle'], workDir: dir, brickwrightSource: twin});
        const idle = result.scripts.idle;
        assert.equal(result.class, 'diverges', JSON.stringify(idle));
        assert.equal(idle.firstDifference.k, 0, 'the score differs from the first sample');
        const byType = Object.fromEntries(idle.firstDifference.diffs.map(d => [d.type, d]));
        assert.deepEqual(byType.score, {type: 'score', original: 3, brickwright: 4});
        assert.equal(byType['sprite-position'].field, 'x');
        assert.ok(byType['sprite-position'].brickwright > byType['sprite-position'].original, 'the faster sprite is ahead');
        assert.equal(idle.primaryCause.startsWith('sprite-position'), true, 'sprite fields rank before score');
        assert.ok(idle.causes.includes('score') && idle.causes.includes('sprite-position'));
        assert.ok(idle.differingSamples >= 60, 'the faster sprite keeps the two sides apart for the whole run');
        assert.ok(result.frames.idle.original.pix.length === 19200 && result.frames.idle.brickwright.pix.length === 19200, 'both full frames are kept at the first divergence');
    } finally { fs.rmSync(dir, {recursive: true, force: true}); }
});

test('end to end: a Brickwright program that never finishes a step is a timeout, and the run continues', {timeout: 240000}, async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bw-diff-e2e-'));
    try {
        const hang = 'while (true) { }\n';
        const result = await analyzeProgram(FIXTURE, {...e2e, scripts: ['idle'], workDir: dir, brickwrightSource: hang, timeoutMs: {original: 120000, brickwright: 15000}});
        assert.equal(result.scripts.idle.class, 'timeout');
        assert.equal(result.scripts.idle.side, 'brickwright');
        assert.equal(result.class, 'timeout');
    } finally { fs.rmSync(dir, {recursive: true, force: true}); }
});
