/**
 * The prebuilt lesson images — D2's second half — and the gate that keeps them
 * honest.
 *
 * ## What is being asserted, and why each assertion has to exist
 *
 * A shipped binary is a claim about a program someone else wrote. It is the
 * most rot-prone thing this repo can hold: nothing about editing
 * `nano03-two-tasks/program.bw` would, on its own, make an image built from
 * yesterday's version stop being served. So the whole point of this file is
 * that a program which drifts from its image FAILS LOUDLY.
 *
 * The chain the gate walks, in order:
 *
 *   1. THE PREMISE. The runner reaches `generateC` through a scratch-vm round
 *      trip (`vm.toJSON()` with `runtime.stc` reattached); the build script
 *      reaches it straight from `program.bw`. If those two ever produce
 *      different C, every shipped image silently stops matching and the whole
 *      mechanism degrades to "always use the network" without saying so. It is
 *      measured here rather than assumed.
 *
 *   2. THE DRIFT GATE. Every manifest entry is re-derived: the program is
 *      re-hashed, the C is re-generated and re-hashed, and the payload's own
 *      stored `code` is compared to the freshly generated string CHARACTER FOR
 *      CHARACTER. Alter one byte of any covered `program.bw` and this goes red.
 *      (Mutation-proven — see the note on `MUTATION` below.)
 *
 *   3. THE ENUMERATION. The set of lesson benches that need a shipped image is
 *      itself asserted, so a new lesson pointing at an AVR or RP2040 example
 *      nobody built an image for cannot land quietly. Everything skipped is
 *      skipped for a NAMED reason.
 *
 *   4. OFFLINE ATTACH, PER FAMILY. With `fetch` cut down to the shipped-image
 *      directory and every other request throwing, an AVR image and an RP2040
 *      image are each loaded, attached to a real bw-board through the real
 *      boundary-A adapters, and RUN — the AVR's LED must actually change state
 *      and the Pico must actually print an ADC reading. A session object that
 *      exists is not a proof; a program that drives the board is.
 *
 *   5. THE EDIT FALLS THROUGH. One character added to the C makes the lookup
 *      miss. That is what keeps a prebuilt image from ever standing in for a
 *      program nobody compiled.
 *
 * ## What this gate CANNOT see, written down rather than implied
 *
 * It does not re-COMPILE the AVR or ARM images: there is no avr-gcc or
 * arm-none-eabi-gcc in this repo or in CI, which is the entire reason the
 * images are shipped. So it cannot catch a hosted service that starts emitting
 * different bytes for the same input. What it can and does catch is the far
 * likelier failure — the program moving underneath the image — plus the image
 * failing to run at all, which is checked by executing it.
 *
 * `MUTATION`: set `BW_MUTATE_LESSON_IMAGE=<exampleId>` to append a comment to
 * that example's program in memory before hashing. The gate must go red. This
 * is the "a gate that cannot fail is not a gate" rule; the mutation is applied
 * in memory so the proof leaves no edited file behind.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync, existsSync, readdirSync} from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

import {INTEGRATED, REPO} from './helpers/bw-integrated.mjs';

const OVERLAY = path.join(REPO, 'overlay/scratch-gui');
const IMAGES = path.join(OVERLAY, 'static/lesson-images');
const EXAMPLES = path.join(OVERLAY, 'examples');
const BW_BOARD = path.join(INTEGRATED, 'src/lib/bw-board');

const sha256 = s => createHash('sha256').update(s, 'utf8').digest('hex');
const manifest = JSON.parse(readFileSync(path.join(IMAGES, 'manifest.json'), 'utf8'));

// ── Instrument check: the module under test is the one lite ships ──────────
//
// Everything below imports from `packages/` (the only tree where scratch-vm
// resolves) while the manifest and the corpus are read from `overlay/` (the
// tree git owns). Comparing the two copies byte-for-byte is what makes a result
// here attributable to THIS repo rather than to whatever another agent session
// has in flight in the integrated tree.
test('instrument: the integrated shipped-images module matches the overlay copy', () => {
    const a = readFileSync(path.join(OVERLAY, 'src/lib/bw-debug/shipped-images.js'));
    const b = readFileSync(path.join(INTEGRATED, 'src/lib/bw-debug/shipped-images.js'));
    assert.ok(a.equals(b), `the integrated shipped-images.js differs from overlay/ ` +
        `(${b.length} vs ${a.length} bytes). Run \`node scripts/integrate.mjs\`.`);
});

const {surveyLessonExamples, generateDebugC} =
    await import(pathToFileURL(path.join(REPO, 'scripts/build-lesson-images.mjs')).href);
const shipped = await import(
    pathToFileURL(path.join(INTEGRATED, 'src/lib/bw-debug/shipped-images.js')).href);

/**
 * In-memory mutation seam — see the header.
 *
 * The probe adds a THIRD SCRIPT rather than a comment, because the two have
 * different reach and both are worth knowing about: a comment-only edit changes
 * the file and is caught by `programSha256` alone, while a new script changes
 * the emitted C, the task table and therefore the image itself — so it must
 * also make the lookup MISS and the offline attach fail to find anything. The
 * proof run wants both halves red.
 */
const MUTATE = process.env.BW_MUTATE_LESSON_IMAGE || '';
const MUTATION = '\nWHEN flag clicked:\n  FOREVER:\n    wait 3 seconds\n';
function programOf (entry) {
    const source = readFileSync(path.join(EXAMPLES, entry.program), 'utf8');
    return entry.exampleId === MUTATE ? `${source}${MUTATION}` : source;
}

// ── 1. The premise: the browser's C is the build script's C ────────────────

test('the emitter gives the SAME C through a scratch-vm round trip as it does direct', async () => {
    const VM = (await import(
        pathToFileURL(path.join(INTEGRATED, 'node_modules/scratch-vm/src/index.js')).href)).default;
    const SB3Creator = (await import(
        pathToFileURL(path.join(INTEGRATED, 'src/lib/sb3-creator.js')).href)).default;

    // Two families, so a divergence that only shows on one core cannot hide.
    for (const exampleId of ['nano03-two-tasks', 'pico02-pot-print']) {
        const source = readFileSync(path.join(EXAMPLES, exampleId, 'program.bw'), 'utf8');
        const creator = new SB3Creator();
        creator.parse(source);
        const direct = creator.generateC(undefined, {debug: true});

        const buffer = Buffer.from(await (await creator.generateSB3()).arrayBuffer());
        const vm = new VM();
        // No Worker in node; the extension classes are irrelevant to serialisation
        // and loading them would be a second, unrelated dependency on this gate.
        vm.extensionManager.loadExtensionURL = () => Promise.resolve();
        await vm.loadProject(buffer);
        if (creator.project.stc) vm.runtime.stc = creator.project.stc;
        // Exactly what debug-runner.js's projectForEmit() does.
        const project = JSON.parse(vm.toJSON());
        project.stc = vm.runtime.stc;
        const viaVm = new SB3Creator().generateC(project, {debug: true});
        vm.quit();

        assert.equal(shipped.canonicalCode(viaVm), shipped.canonicalCode(direct),
            `${exampleId}: the C the browser would POST is not the C the build script ` +
            `compiled (${viaVm.length} vs ${direct.length} chars). Every shipped image ` +
            `is keyed on that string, so this divergence silently disables all of them.`);

        // And the ONLY thing canonicalisation is allowed to hide is the block
        // id. If the raw strings match too, the normalisation is doing nothing
        // here; if they differ ANYWHERE outside an `@bw yield` line, the key is
        // hiding a real difference and this gate would be certifying nothing.
        const rawDiff = direct.split('\n')
            .map((line, i) => [i, line, viaVm.split('\n')[i]])
            .filter(([, a, b]) => a !== b);
        assert.ok(rawDiff.every(([, a]) => /@bw yield/.test(a)),
            `${exampleId}: the two emitter paths differ outside the yield markers: ` +
            rawDiff.filter(([, a]) => !/@bw yield/.test(a)).slice(0, 3)
                .map(([i, a, b]) => `line ${i}: ${a} || ${b}`).join(' ; '));
    }
});

// ── 2. The drift gate ──────────────────────────────────────────────────────

test('every shipped image still describes the program it was built from', async () => {
    assert.ok(manifest.images.length > 0, 'the manifest ships no images at all');
    const problems = [];
    for (const entry of manifest.images) {
        const programPath = path.join(EXAMPLES, entry.program);
        if (!existsSync(programPath)) {
            problems.push(`${entry.exampleId}: ${entry.program} is gone`);
            continue;
        }
        const source = programOf(entry);
        if (sha256(source) !== entry.programSha256) {
            problems.push(`${entry.exampleId}: ${entry.program} changed since the image was ` +
                `built (program sha ${sha256(source).slice(0, 12)} vs manifest ` +
                `${entry.programSha256.slice(0, 12)})`);
            continue;
        }
        const code = shipped.canonicalCode(await generateDebugC(source));
        if (sha256(code) !== entry.codeSha256) {
            problems.push(`${entry.exampleId}: the emitter no longer produces the C this ` +
                `image was built from (code sha ${sha256(code).slice(0, 12)} vs manifest ` +
                `${entry.codeSha256.slice(0, 12)})`);
            continue;
        }
        if (code.length !== entry.codeLength) {
            problems.push(`${entry.exampleId}: codeLength ${entry.codeLength} but the C is ` +
                `${code.length} chars — the lookup narrows on this and would never hit`);
        }
        const payload = JSON.parse(readFileSync(path.join(IMAGES, entry.file), 'utf8'));
        if (payload.code !== code) {
            problems.push(`${entry.exampleId}: the payload's stored code is not the code the ` +
                `emitter produces — the exact compare in shippedImageFor would miss`);
        }
        if (!payload.base64) problems.push(`${entry.exampleId}: the payload carries no image`);
        if (entry.format !== 'bin' && !payload.symbols) {
            problems.push(`${entry.exampleId}: no symbol table, so the debugger could not ` +
                `say where it is`);
        }
    }
    assert.deepEqual(problems, [],
        `Shipped images have drifted from their programs. Rebuild with\n` +
        `  node scripts/build-lesson-images.mjs --force\n` +
        `and commit the manifest and payloads in the SAME commit as the program change.\n` +
        problems.map(p => `  - ${p}`).join('\n'));
});

test('the manifest and the directory hold exactly the same files', () => {
    const onDisk = readdirSync(IMAGES).filter(f => f !== 'manifest.json').sort();
    const declared = manifest.images.map(e => e.file).sort();
    assert.deepEqual(onDisk, declared,
        'a payload on disk that no manifest entry names is dead weight the app will never ' +
        'read; a manifest entry with no payload is a promise the lookup cannot keep');
});

test('the manifest records the provenance a later reader needs', () => {
    assert.match(manifest.builtAt, /^\d{4}-\d{2}-\d{2}$/);
    assert.match(manifest.service, /stc-compiler\.vercel\.app @ [0-9a-f]{7,40}/);
    for (const entry of manifest.images) {
        assert.ok(entry.toolchain, `${entry.exampleId} records no compiler version`);
        assert.ok(entry.lessons.length, `${entry.exampleId} names no lesson — why is it shipped?`);
        assert.ok(/^[0-9a-f]{64}$/.test(entry.codeSha256));
        assert.ok(/^[0-9a-f]{64}$/.test(entry.programSha256));
    }
    // 8051 is the family the browser compiles itself since 2026-08-31. Shipping
    // an image for it would be a second source of truth for a build the app can
    // already do — and the stale one would win.
    for (const entry of manifest.images) {
        assert.ok(!shipped.LOCAL_8051_TARGETS.has(entry.target),
            `${entry.exampleId} ships an image for ${entry.target}, which compiles in the ` +
            `browser. Delete it rather than keeping two answers to the same question.`);
    }
});

// ── 3. The enumeration ─────────────────────────────────────────────────────

test('every lesson bench that needs a shipped image has one, or is a named refusal', () => {
    const survey = surveyLessonExamples();
    const need = survey.filter(r => r.needsImage).map(r => r.exampleId).sort();
    const have = [...new Set(manifest.images.map(e => e.exampleId))].sort();
    const refused = (manifest.refused || []).map(r => r.exampleId).sort();
    assert.deepEqual([...have, ...refused].sort(), need,
        'a lesson names an example that needs a compiler the browser does not carry, and ' +
        'the manifest neither ships an image for it nor records why it could not. Run ' +
        '`node scripts/build-lesson-images.mjs`.');
});

/**
 * THE HONEST RESIDUE, ratcheted.
 *
 * `arduino-02-blink-without-delay` cannot be built by anybody — with or
 * without a network. Measured 2026-08-31: sb3-creator's AVR preamble emits the
 * millisecond ISR and `bw_ms`, and `main()`'s idle fast-forward calls
 * `bw_now()` twice, but the AVR path only DEFINES `bw_now()` when something
 * else in the program set `_cUses.now` — which `wait` does and `timer` does
 * not. Five of the 80 AVR examples in the corpus emit C that calls `bw_now()`
 * and never defines it (`arduino-02-blink-without-delay`, `arduino-02-button`,
 * `arduino-02-debounce`, `arduino-08-string-addition`,
 * `arduino-sk-p09-motorized-pinwheel`); one of them, this one, is a Wave 5
 * lesson bench (`debug-timing-bugs`). It is sb3-creator's emitter to fix and
 * lite must not patch a vendored file, so it is named here and in
 * docs/WAVE-OPEN-DEFECTS.md rather than papered over.
 *
 * The list may only SHRINK. A new refusal fails this gate.
 */
const KNOWN_REFUSALS = new Set(['arduino-02-blink-without-delay']);

test('the refusal list is exactly the known upstream hole — no new ones, no stale ones', () => {
    const refused = new Set((manifest.refused || []).map(r => r.exampleId));
    assert.deepEqual([...refused].sort(), [...KNOWN_REFUSALS].sort(),
        'a lesson bench that cannot be built changed. A NEW entry is a new defect and needs ' +
        'a row; a MISSING entry means the upstream fix landed — rebuild the images and take ' +
        'it off KNOWN_REFUSALS in the same commit.');
    for (const r of manifest.refused || []) {
        assert.match(r.error, /bw_now/,
            `${r.exampleId} now fails for a different reason than the recorded one: ${r.error}`);
    }
});

test('the survey names a reason for everything it skips', () => {
    for (const row of surveyLessonExamples()) {
        if (row.needsImage) continue;
        assert.ok(row.reason && row.reason.length > 8,
            `${row.exampleId} was skipped with no stated reason`);
    }
});

// ── 4. Offline attach, per family ──────────────────────────────────────────

/**
 * `fetch` cut down to the shipped-image directory on disk. Anything else — the
 * hosted compiler above all — throws the way a dead network does. This is the
 * node half of "the debugger starts with no connection".
 */
function offlineFetch () {
    const allowed = pathToFileURL(`${IMAGES}/`).href;
    const asked = [];
    const previous = globalThis.fetch;
    globalThis.fetch = async input => {
        const url = String(input && input.url ? input.url : input);
        asked.push(url);
        if (!url.startsWith(allowed)) {
            throw new TypeError(`fetch failed: the network is cut (asked for ${url})`);
        }
        const body = readFileSync(new URL(url), 'utf8');
        return {ok: true, status: 200, json: async () => JSON.parse(body)};
    };
    return {asked, restore: () => { globalThis.fetch = previous; }};
}

const BASE_URI = pathToFileURL(path.join(OVERLAY, 'index.html')).href;

test('AVR: a lesson image attaches and RUNS with the network cut', async () => {
    const entry = manifest.images.find(e => e.exampleId === 'nano03-two-tasks');
    assert.ok(entry, 'nano03-two-tasks is debug-task-scheduling\'s own bench');
    const code = await generateDebugC(programOf(entry));

    shipped.resetShippedManifest();
    const net = offlineFetch();
    let out;
    try {
        out = await shipped.shippedImageFor(code, entry.target, entry.format, BASE_URI);
    } finally {
        net.restore();
    }
    assert.ok(out && out.success, 'no prebuilt image came back for the lesson\'s own program');
    assert.ok(out.symbols, 'the image came without the symbol table from the same build');
    assert.equal(out.provenance.exampleId, 'nano03-two-tasks');
    assert.ok(net.asked.every(u => u.startsWith('file:')),
        `the lookup touched something outside the shipped directory: ${net.asked.join(', ')}`);

    // Attach it to a REAL board through the real boundary-A adapter and run it.
    const {createDebugTarget, createDebugSession, BoardImpl} =
        await import(pathToFileURL(path.join(BW_BOARD, 'index.js')).href);
    (await import(pathToFileURL(path.join(BW_BOARD, 'register-all.js')).href)).registerAllDevices();

    const board = new BoardImpl();
    board.setNetlist([
        {id: 'u1', kind: 'mcu', terminals: ['D13', 'gnd']},
        {id: 'r1', kind: 'resistor', params: {ohms: 220}, terminals: ['a', 'b']},
        {id: 'd1', kind: 'led', params: {color: 'red'}, terminals: ['anode', 'cathode']},
        {id: 'g1', kind: 'gnd', terminals: ['gnd']}
    ], [
        {id: 'n1', terminals: [{part: 'u1', terminal: 'D13'}, {part: 'r1', terminal: 'a'}]},
        {id: 'n2', terminals: [{part: 'r1', terminal: 'b'}, {part: 'd1', terminal: 'anode'}]},
        {id: 'n3', terminals: [{part: 'd1', terminal: 'cathode'},
            {part: 'g1', terminal: 'gnd'}, {part: 'u1', terminal: 'gnd'}]}
    ]);
    board.setPower(true);

    const hex = Buffer.from(out.base64, 'base64').toString('binary');
    const {target, adapter} = await createDebugTarget('avr8js',
        {board, hex, symbols: out.symbols, clockHz: 16_000_000});
    const caps = target.capabilities();
    assert.ok(caps.steps.includes('block'),
        'the shipped image attached without block-level position — its symbols did not take');

    const session = createDebugSession(target, {onChange: () => {}});
    session.start();
    // nano03-two-tasks blinks D13 at 1 Hz. Two seconds of SIMULATED time is
    // enough to see both halves; nothing here sleeps in wall-clock.
    const seen = new Set();
    for (let i = 0; i < 40; i++) {
        adapter.advanceNs(50_000_000);
        seen.add(board.ledBrightness('d1') > 0.05 ? 'on' : 'off');
    }
    assert.deepEqual([...seen].sort(), ['off', 'on'],
        `the prebuilt AVR image ran but never toggled the LED (saw ${[...seen]})`);
    assert.ok(adapter.stats.instructions > 100000,
        `only ${adapter.stats.instructions} instructions executed — the image did not run`);
});

test('ARM: the Pico lesson image attaches and PRINTS with the network cut', async () => {
    const entry = manifest.images.find(e => e.exampleId === 'pico02-pot-print');
    assert.ok(entry, 'pico02-pot-print is debug-simulation-hardware\'s own bench');
    const code = await generateDebugC(programOf(entry));

    shipped.resetShippedManifest();
    const net = offlineFetch();
    let out;
    try {
        out = await shipped.shippedImageFor(code, entry.target, entry.format, BASE_URI);
    } finally {
        net.restore();
    }
    assert.ok(out && out.success, 'no prebuilt image came back for the Pico lesson');
    assert.equal(out.provenance.target, 'rp2040');

    const {createDebugTarget, createDebugSession, BoardImpl} =
        await import(pathToFileURL(path.join(BW_BOARD, 'index.js')).href);
    (await import(pathToFileURL(path.join(BW_BOARD, 'register-all.js')).href)).registerAllDevices();

    const board = new BoardImpl(3.3);
    board.setNetlist([
        {id: 'u1', kind: 'mcu', terminals: ['GP26', 'gnd']},
        {id: 'p1', kind: 'potentiometer', params: {ohms: 10000, position: 0.5},
            terminals: ['a', 'wiper', 'b']},
        {id: 'v1', kind: 'vsource', params: {volts: 3.3}, terminals: ['pos', 'neg']},
        {id: 'g1', kind: 'gnd', terminals: ['gnd']}
    ], [
        {id: 'n1', terminals: [{part: 'u1', terminal: 'GP26'}, {part: 'p1', terminal: 'wiper'}]},
        {id: 'n2', terminals: [{part: 'p1', terminal: 'a'}, {part: 'v1', terminal: 'pos'}]},
        {id: 'n3', terminals: [{part: 'p1', terminal: 'b'}, {part: 'v1', terminal: 'neg'},
            {part: 'g1', terminal: 'gnd'}, {part: 'u1', terminal: 'gnd'}]}
    ]);
    board.setPower(true);

    const bytes = new Uint8Array(Buffer.from(out.base64, 'base64'));
    const padded = bytes.length & 1 ? new Uint8Array([...bytes, 0]) : bytes;
    const program = new Uint16Array(padded.buffer, padded.byteOffset, padded.length / 2);
    const {target, adapter} = await createDebugTarget('rp2040js',
        {board, program, symbols: out.symbols, clockHz: 125_000_000});
    assert.ok(target.capabilities().steps.includes('block'));

    let serial = '';
    adapter.onSerial(b => { serial += String.fromCharCode(b); });
    const session = createDebugSession(target, {onChange: () => {}});
    session.start();
    for (let i = 0; i < 60; i++) adapter.advanceNs(50_000_000);

    // The program prints `read pot1` once a second. A half-turned 10k pot on
    // 3.3 V is mid-scale on a 12-bit ADC; the assertion is deliberately on the
    // RANGE, because the exact count belongs to the divider model, not to this
    // gate — what is being proven is that the shipped image executed.
    const numbers = serial.split(/\r?\n/).filter(Boolean).map(Number).filter(n => !isNaN(n));
    assert.ok(numbers.length >= 2,
        `the prebuilt Pico image printed nothing usable: ${JSON.stringify(serial.slice(0, 80))}`);
    assert.ok(numbers.every(n => n > 1200 && n < 2900),
        `the ADC readings ${numbers.slice(0, 4)} are not a half-turned pot`);
});

// ── 5. An edit falls through, and 8051 never asks ──────────────────────────

test('one changed character misses, so a prebuilt image never stands in for an edit', async () => {
    const entry = manifest.images.find(e => e.exampleId === 'nano03-two-tasks');
    const code = await generateDebugC(programOf(entry));

    shipped.resetShippedManifest();
    const net = offlineFetch();
    try {
        assert.ok(await shipped.shippedImageFor(code, entry.target, entry.format, BASE_URI),
            'the control case did not hit, so the miss below proves nothing');
        // Same length, one character different — the case a hash-only lookup
        // would have to get right and an exact compare cannot get wrong.
        const swapped = `${code.slice(0, code.length - 1)}\t`;
        assert.equal(swapped.length, code.length);
        assert.equal(
            await shipped.shippedImageFor(swapped, entry.target, entry.format, BASE_URI), null);
        // Different length, and a different target and format too.
        assert.equal(
            await shipped.shippedImageFor(`${code}\n`, entry.target, entry.format, BASE_URI), null);
        assert.equal(await shipped.shippedImageFor(code, 'atmega2560', 'ihx', BASE_URI), null);
        assert.equal(await shipped.shippedImageFor(code, entry.target, 'bin', BASE_URI), null);
    } finally {
        net.restore();
    }
});

test('a missing manifest costs ONE failed request, not one per Run', async () => {
    shipped.resetShippedManifest();
    let calls = 0;
    const previous = globalThis.fetch;
    globalThis.fetch = async () => { calls++; throw new TypeError('fetch failed'); };
    try {
        for (let i = 0; i < 5; i++) {
            assert.equal(await shipped.shippedImageFor('int main(){}', 'atmega328p', 'ihx',
                BASE_URI), null);
        }
    } finally {
        globalThis.fetch = previous;
        shipped.resetShippedManifest();
    }
    assert.equal(calls, 1,
        `${calls} manifest fetches for five builds — a build with no manifest must remember ` +
        `the failure, not re-ask on every Run`);
});

// ── 6. The runner asks in the right order, and says so ─────────────────────

test('the runner asks for a shipped image before any network, and never for 8051', () => {
    const src = readFileSync(
        path.join(OVERLAY, 'src/lib/bw-debug/debug-runner.js'), 'utf8');
    const lookup = src.indexOf('await shippedImageFor(');
    const hosted = src.indexOf('`${compilerUrl}/compile`');
    const lru = src.indexOf('compileCacheGet(cacheKey)');
    assert.ok(lookup > 0, 'debug-runner no longer consults the shipped images at all');
    assert.ok(hosted > lookup && lru > lookup,
        'the shipped-image lookup must come BEFORE the localStorage LRU and the hosted ' +
        'POST — asking the network first makes the whole mechanism pointless');
    assert.match(src, /LOCAL_8051_TARGETS\.has\(compileTarget\)\s*\n?\s*\?\s*null/,
        'the 8051 targets must skip the shipped lookup: they compile in the browser, and a ' +
        'shipped image for them would be a second source of truth');
    // The maps must be shared, not copied. Two copies is how an image built for
    // `atmega328p` stops matching a runner asking for `arduino-nano`.
    assert.ok(!/const COMPILE_TARGET = \{/.test(src),
        'debug-runner has grown its own copy of the device -> target map again');
});

test('the panel renders the provenance sentence, and not as a warning', () => {
    const src = readFileSync(
        path.join(OVERLAY, 'src/components/tw-pseudocode/debug-panel.jsx'), 'utf8');
    assert.match(src, /data-image-provenance=/,
        'nothing renders the prebuilt-image provenance, so the honest sentence is unreachable');
    assert.match(src, /ui\.imageProvenance\.sentence/);
    // Amber (#f39c12) is the refusal colour in this panel. A prebuilt image is
    // not a refusal, and painting it amber would teach a learner to read a
    // working bench as a broken one.
    const block = src.slice(src.indexOf('data-image-provenance'),
        src.indexOf('data-image-provenance') + 400);
    assert.ok(!block.includes('#f39c12'),
        'the provenance line is painted in the refusal colour');
});

test('the sentence says all three things it has to say, in both languages', () => {
    const provenance = manifest.images.find(e => e.exampleId === 'nano03-two-tasks');
    const en = shipped.provenanceSentence({...provenance, builtAt: manifest.builtAt}, 'en');
    const de = shipped.provenanceSentence({...provenance, builtAt: manifest.builtAt}, 'de');
    for (const [lang, text] of [['en', en], ['de', de]]) {
        assert.ok(text.includes('nano03-two-tasks'), `${lang}: does not name the lesson bench`);
        assert.ok(text.includes(manifest.builtAt), `${lang}: does not say when it was built`);
        assert.ok(text.includes('avr-gcc'), `${lang}: does not say which compiler built it`);
    }
    assert.match(en, /without the network/i, 'en: does not say the network was not used');
    assert.match(en, /[Ee]dit the program/, 'en: does not say what makes it stop applying');
    assert.match(de, /ohne Netzwerk/i);
    assert.match(de, /änderst/);
    assert.equal(shipped.provenanceSentence(null), '');
});
