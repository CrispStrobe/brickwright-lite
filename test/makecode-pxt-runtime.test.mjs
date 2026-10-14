/**
 * MakeCode's own compiler, run here with no makecode.com (lib/bw-makecode/pxt-runtime.js).
 *
 * The glue that runs inside the pxt worker is evaluated here in a vm sandbox —
 * the SAME text the browser's Web Worker runs — over the runtime
 * scripts/sync-makecode-runtime.mjs serves. What is asserted, and why each:
 *
 *   - an IMPORTED project (the fixture's recovered source, written by MakeCode
 *     7.0.57) compiles for the simulator: the road for "run someone's program";
 *   - a native build LINKS THE PROGRAM ONTO THE REAL FIRMWARE: the V2 image equals
 *     the shipped CODAL base below the program region and differs inside it — a
 *     .hex that merely equalled the base, or merely existed, would pass a weaker
 *     check and flash a board that does nothing;
 *   - Arcade compiles for the simulator, and a native Arcade build that names no
 *     hardware is REFUSED by name (NO_BASE_HEX: the generic default has no C++
 *     runtime, so no base — per-hardware bases are test/makecode-arcade-bases),
 *     as is a micro:bit project with a C++ package outside the shipped base set —
 *     never sent to the network;
 *   - a program with a type error returns success:false with the error, not a
 *     throw and not a silent empty build;
 *   - zero network attempts across every compile — "offline" measured, not assumed.
 *
 * Needs the synced runtime (npm run sync:makecode, ~48 MB of pinned tarballs);
 * CI runs the sync before the unit tests. Without it every case SKIPS BY NAME.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import util from 'node:util';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const STATIC = path.join(ROOT, 'packages/scratch-gui/static/makecode');
const {PXT_GLUE_JS, MICROBIT_DEFAULT_DEPENDENCIES} =
    await import(path.join(ROOT, 'overlay/scratch-gui/src/lib/bw-makecode/pxt-runtime.js'));
const {unpackMakeCodeSource} = await import(path.join(ROOT, 'overlay/scratch-gui/src/lib/bw-makecode/embedded-source.js'));
const {BASES, MICROBIT_EMU_BASES} = await import(path.join(ROOT, 'scripts/sync-makecode-runtime.mjs'));
const {baseLicence} = await import(path.join(ROOT, 'overlay/scratch-gui/src/lib/bw-makecode/base-licences.js'));
const sha256 = b => crypto.createHash('sha256').update(b).digest('hex');

const SYNCED = ['microbit', 'arcade'].every(t => fs.existsSync(path.join(STATIC, t, 'pxtworker.js')));
const skip = SYNCED ? false : 'MakeCode runtime not synced (npm run sync:makecode) — pxt compiler absent';

const sandboxes = new Map();
/** The worker's globals in a vm: the target bundle, pxtworker.js, then the glue. */
function pxtFor (target) {
    if (sandboxes.has(target)) return sandboxes.get(target);
    const dir = path.join(STATIC, target);
    const quiet = () => {};
    const sb = {
        setTimeout, clearTimeout, setInterval, clearInterval, setImmediate, clearImmediate,
        TextEncoder: util.TextEncoder, TextDecoder: util.TextDecoder, Buffer,
        console: {log: quiet, debug: quiet, info: quiet, warn: quiet, error: quiet},
        pxtTargetBundle: JSON.parse(fs.readFileSync(path.join(dir, 'target.json'), 'utf8'))
    };
    sb.global = sb;
    sb.self = sb;
    // pxt evaluates generated code (the simulator program is checked by eval);
    // the browser worker has eval natively. Same bridge as the makecode CLI's.
    sb.eval = src => vm.runInContext(src, sb, {filename: 'eval'});
    vm.createContext(sb, {codeGeneration: {strings: false, wasm: false}});
    vm.runInContext(fs.readFileSync(path.join(dir, 'pxtworker.js'), 'utf8'), sb, {filename: 'pxtworker.js'});
    vm.runInContext(PXT_GLUE_JS, sb, {filename: 'pxt-glue.js'});
    sandboxes.set(target, sb);
    return sb;
}
/** The browser worker fetches hexcache/<sha>.hex; this reads the same file. */
const getBaseHex = target => async sha => {
    const p = path.join(STATIC, target, 'hexcache', `${sha}.hex`);
    return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null;
};
// Through JSON: objects built inside the vm belong to ITS realm, and a
// cross-realm [] is not deepStrictEqual to this one's (the browser gets the
// same plain data through postMessage's structured clone).
const compile = async (target, files, native = false, embedSource = null) =>
    JSON.parse(JSON.stringify(await pxtFor(target).bwMakeCode.compile(files, {native, embedSource, getBaseHex: getBaseHex(target)})));
const netAttempts = target => JSON.parse(JSON.stringify(pxtFor(target).bwMakeCode.netAttempts));

/** Flash bytes 0..0x80000 of an Intel HEX (the nRF52833 image); other record types ignored. */
function flashImage (hex) {
    const img = new Uint8Array(0x80000).fill(0xff);
    let base = 0;
    for (const line of hex.split(/\r?\n/)) {
        if (!line.startsWith(':')) continue;
        const b = Buffer.from(line.slice(1), 'hex');
        const n = b[0], addr = b.readUInt16BE(1), type = b[3];
        if (type === 4) base = b.readUInt16BE(4) * 0x10000;
        // Type 02 (segment address, x16): MakeCode's CDN bases use it where the npm ones use 04.
        else if (type === 2) base = b.readUInt16BE(4) * 16;
        else if (type === 0 && base + addr + n <= img.length) img.set(b.subarray(4, 4 + n), base + addr);
        else if (type === 1) break;
    }
    return img;
}

const tinyMicrobit = main => ({
    'pxt.json': JSON.stringify({name: 'bw-test', dependencies: MICROBIT_DEFAULT_DEPENDENCIES, files: ['main.ts']}),
    'main.ts': main
});

test('an imported micro:bit project compiles for the simulator, offline', {skip}, async () => {
    const {files} = await unpackMakeCodeSource(new Uint8Array(fs.readFileSync(path.join(ROOT, 'test/fixtures/makecode/microbit-blocks.hex'))));
    assert.match(files['main.ts'], /analogReadPin/, 'the fixture is not the program this test expects');
    const r = await compile('microbit', files);
    assert.deepEqual(r.diagnostics, []);
    assert.equal(r.success, true);
    assert.ok(r.outfiles['binary.js'] && r.outfiles['binary.js'].length > 1000, 'no simulator program');
    assert.deepEqual(r.netAttempts, []);
});

test('a native micro:bit build links the program onto the shipped CODAL firmware', {skip}, async () => {
    const {files} = await unpackMakeCodeSource(new Uint8Array(fs.readFileSync(path.join(ROOT, 'test/fixtures/makecode/microbit-blocks.hex'))));
    const r = await compile('microbit', files, true);
    assert.equal(r.success, true, JSON.stringify(r.diagnostics));
    assert.deepEqual(r.netAttempts, []);
    assert.ok(r.outfiles['binary.hex'], 'no universal .hex');
    const v2 = r.outfiles['mbcodal-binary.hex'];
    assert.ok(v2, 'no V2 (nRF52833) section');
    // The base it was linked onto: the hexcache file whose image matches below the program.
    const img = flashImage(v2);
    const bases = fs.readdirSync(path.join(STATIC, 'microbit/hexcache')).map(f => ({f, img: flashImage(fs.readFileSync(path.join(STATIC, 'microbit/hexcache', f), 'utf8'))}));
    const base = bases.find(b => b.img.subarray(0, 0x40000).every((x, i) => x === img[i]));
    assert.ok(base, 'the V2 image matches no shipped CODAL base below 0x40000');
    let differ = 0;
    for (let i = 0x40000; i < img.length; i++) if (img[i] !== base.img[i]) differ++;
    assert.ok(differ > 500, `only ${differ} bytes above 0x40000 differ from the base: the program is not linked in`);
    assert.match(r.outfiles['mbcodal-binary.asm'] || '', /analogReadPin|showNumber/, 'the listing does not contain the program');
});

test('an Arcade game compiles for the simulator; a native Arcade build naming no hardware is refused by name', {skip}, async () => {
    const files = {
        'pxt.json': JSON.stringify({name: 'bw-test', dependencies: {device: '*'}, files: ['main.ts']}),
        'main.ts': 'let hero = sprites.create(img`\n. 5 .\n5 5 5\n`, SpriteKind.Player)\ncontroller.moveSprite(hero)\ninfo.setScore(3)\n'
    };
    const sim = await compile('arcade', files);
    assert.equal(sim.success, true, JSON.stringify(sim.diagnostics));
    assert.ok(sim.outfiles['binary.js'].length > 100000, 'the game engine is not compiled in');
    await assert.rejects(compile('arcade', files, true), e => e.code === 'NO_BASE_HEX');
    assert.deepEqual(netAttempts('arcade'), []);
});

test('a micro:bit project with a C++ package outside the shipped set: simulator yes, native refused', {skip}, async () => {
    const files = tinyMicrobit('basic.showNumber(1)\n');
    const cfg = JSON.parse(files['pxt.json']);
    // flashlog is a C++ package (flashlog.cpp) outside the core+radio+microphone
    // set the shipped bases were built for. (bluetooth would be the obvious pick,
    // but MakeCode refuses it beside radio: the two are mutually exclusive.)
    cfg.dependencies = {...cfg.dependencies, flashlog: '*'};
    files['pxt.json'] = JSON.stringify(cfg);
    const sim = await compile('microbit', files);
    assert.equal(sim.success, true, JSON.stringify(sim.diagnostics));
    await assert.rejects(compile('microbit', files, true), e => e.code === 'NO_BASE_HEX' && /[0-9a-f]{64}/.test(e.sha));
});

test('a type error comes back as a diagnostic, not a throw and not an empty build', {skip}, async () => {
    const r = await compile('microbit', tinyMicrobit('basic.showNumber("seven")\nbasic.noSuchThing()\n'));
    assert.equal(r.success, false);
    assert.ok(r.diagnostics.length >= 1);
    assert.ok(r.diagnostics.some(d => d.line === 1 && /noSuchThing|does not exist/.test(d.message)),
        JSON.stringify(r.diagnostics));
    assert.deepEqual(netAttempts('microbit'), []);
});

test('the network counter counts: a GitHub package is refused offline and the attempt is recorded', {skip}, async () => {
    // Positive control for every "zero network attempts" above: without it, a
    // counter that never fires would make those assertions vacuous.
    const files = tinyMicrobit('basic.showNumber(1)\n');
    const cfg = JSON.parse(files['pxt.json']);
    cfg.dependencies = {...cfg.dependencies, neopixel: 'github:microsoft/pxt-neopixel#v0.7.6'};
    files['pxt.json'] = JSON.stringify(cfg);
    const before = netAttempts('microbit').length;
    const r = await compile('microbit', files).catch(e => ({threw: e.message}));
    assert.ok(r.threw || r.success === false, 'a GitHub dependency compiled with the network refused');
    assert.ok(netAttempts('microbit').length > before, 'the refused fetch was not counted');
});

test('the firmware carries the project: MakeCode\'s own importer (and ours) opens it', {skip}, async () => {
    const files = tinyMicrobit('basic.showString("hi")\n');
    const r = await compile('microbit', files, true, {files, name: 'embed test', editorUrl: 'https://makecode.microbit.org/'});
    assert.equal(r.success, true, JSON.stringify(r.diagnostics));
    const hex = r.outfiles['binary.hex'];
    // pxt.cpp.unpackSourceFromHexAsync is the code makecode.microbit.org runs
    // when a .hex is dropped on it; it is in the same pxtworker we compile with.
    const sb = pxtFor('microbit');
    sb.__hexBytes = new Uint8Array(Buffer.from(hex, 'utf8'));
    const theirs = await vm.runInContext('pxt.cpp.unpackSourceFromHexAsync(__hexBytes)', sb);
    assert.ok(theirs && theirs.source, 'MakeCode\'s importer found no source in the .hex');
    assert.equal(JSON.parse(theirs.source)['main.ts'], files['main.ts']);
    const {importArtefact} = await import(path.join(ROOT, 'overlay/scratch-gui/src/lib/bw-makecode/index.js'));
    const ours = await importArtefact(new Uint8Array(Buffer.from(hex, 'utf8')), {name: 'embed.hex'});
    assert.equal(ours.files['main.ts'], files['main.ts']);
    assert.equal(ours.project.target, 'microbit');
    // ...and embedding did not unlink the program from the firmware.
    assert.match(r.outfiles['mbcodal-binary.asm'] || '', /showString/);
});

test('a real Arcade game with tilemaps and animation — what the translation drops — compiles as MakeCode wrote it', {skip}, async () => {
    // arcade-translate.js names tilemaps and animation as unsupported; this is
    // the road where nothing is dropped, because nothing is translated.
    const {files} = await unpackMakeCodeSource(new Uint8Array(fs.readFileSync(path.join(ROOT, 'test/fixtures/makecode/arcade-tilemap.hex'))));
    assert.match(files['main.ts'] + (files['main.blocks'] || ''), /tiles\.|tilemap/i, 'the fixture is not a tilemap game');
    assert.ok(JSON.parse(files['pxt.json']).dependencies.animation, 'the fixture no longer uses the animation extension');
    const r = await compile('arcade', files);
    assert.equal(r.success, true, JSON.stringify(r.diagnostics.slice(0, 3)));
    assert.deepEqual(r.netAttempts, []);
});

test('every lite micro:bit example compiles, through the MakeCode export, to real firmware', {skip}, async () => {
    // pseudocode -> MakeCode TypeScript (export.js) -> pxt -> universal .hex.
    // Two of ten failed here before the export learned the dialect's 1/0 truth
    // (census 2026-09-25: `input.buttonIsPressed(Button.A) > 0`).
    const {default: SB3Creator} = await import(path.join(ROOT, 'overlay/scratch-gui/src/lib/sb3-creator.js'));
    const {exportToMakeCode} = await import(path.join(ROOT, 'overlay/scratch-gui/src/lib/bw-makecode/export.js'));
    const dir = path.join(ROOT, 'overlay/scratch-gui/examples');
    const examples = fs.readdirSync(dir).filter(d => {
        const p = path.join(dir, d, 'program.bw');
        return fs.existsSync(p) && /^DEVICE\s+MICROBIT\b/im.test(fs.readFileSync(p, 'utf8'));
    });
    assert.ok(examples.length >= 10, `only ${examples.length} micro:bit examples found`);
    const failed = [];
    for (const id of examples) {
        const ex = exportToMakeCode(new SB3Creator().parse(fs.readFileSync(path.join(dir, id, 'program.bw'), 'utf8')), {name: id});
        const r = await compile('microbit', ex.files, true);
        if (!r.success || !r.outfiles['binary.hex']) failed.push(`${id}: ${(r.diagnostics[0] || {}).message || r.error}`);
    }
    assert.deepEqual(failed, []);
});

test('census batch 1: a program using every call comes back from lite and MakeCode compiles it', {skip}, async () => {
    // MakeCode's led/game/Math calls the census found refused or silently lost
    // (2026-09-25). The loop is the census's own: import -> pseudocode ->
    // blocks -> export -> pxt. MakeCode compiling the ORIGINAL is the control:
    // the program is valid MakeCode before lite touches it.
    const {default: SB3Creator} = await import(path.join(ROOT, 'overlay/scratch-gui/src/lib/sb3-creator.js'));
    const {microbitToPseudocode} = await import(path.join(ROOT, 'overlay/scratch-gui/src/lib/bw-makecode/microbit-translate.js'));
    const {projectToMakeCodeTs} = await import(path.join(ROOT, 'overlay/scratch-gui/src/lib/bw-makecode/export.js'));
    const original = [
        'let v = 0',
        'basic.forever(function () {',
        '    led.plotBarGraph(input.lightLevel(), 255)',
        '    led.toggle(1, 2)',
        '    led.setBrightness(v * 2)',
        '    led.stopAnimation()',
        '    game.addScore(1)',
        '    game.setScore(4)',
        '    game.removeLife(1)',
        '    basic.showNumber(game.score())',
        '    v = Math.min(v, Math.max(v - 1, 0))',
        '    v = Math.idiv(v, 4)',
        '    v = pins.map(pins.analogReadPin(AnalogPin.P0), 0, 1023, 0, 4)',
        '    if (Math.randomBoolean()) {',
        '        game.gameOver()',
        '    }',
        '})'
    ].join('\n');
    const control = await compile('microbit', tinyMicrobit(original));
    assert.equal(control.success, true, `the original is not valid MakeCode: ${JSON.stringify(control.diagnostics.slice(0, 2))}`);

    const imported = microbitToPseudocode(original);
    assert.deepEqual(imported.unsupported, [], 'the import refused something');
    const {ts, unsupported} = projectToMakeCodeTs(new SB3Creator().parse(imported.code));
    assert.deepEqual(unsupported, [], 'the export refused something');
    for (const call of ['led.plotBarGraph', 'led.toggle', 'led.setBrightness', 'led.stopAnimation', 'game.addScore',
        'game.setScore', 'game.removeLife', 'game.score', 'game.gameOver', 'Math.min', 'Math.max', 'Math.idiv',
        'pins.map', 'Math.randomBoolean']) {
        assert.ok(ts.includes(`${call}(`), `${call} did not come back:\n${ts}`);
    }
    const r = await compile('microbit', tinyMicrobit(ts));
    assert.equal(r.success, true, `MakeCode refused the re-export: ${JSON.stringify(r.diagnostics.slice(0, 2))}\n${ts}`);
});

test('census batch 2: radio handlers, music, A+B and stored truth values come back from lite and MakeCode compiles them', {skip}, async () => {
    // The calls the census found lost WITHOUT a word (2026-09-27) — radio
    // handlers in 20 apps, music.beat in 12 — and the recompile failures: a
    // comparison stored in a variable, a string shown with showNumber, `let
    // light` against pxt's `light`. Same loop as batch 1; the original
    // compiling is the control.
    const {default: SB3Creator} = await import(path.join(ROOT, 'overlay/scratch-gui/src/lib/sb3-creator.js'));
    const {microbitToPseudocode} = await import(path.join(ROOT, 'overlay/scratch-gui/src/lib/bw-makecode/microbit-translate.js'));
    const {projectToMakeCodeTs} = await import(path.join(ROOT, 'overlay/scratch-gui/src/lib/bw-makecode/export.js'));
    const original = [
        'let clock = 0',
        'let isSwitched = false',
        'let word = ""',
        'radio.onReceivedNumber(function (receivedNumber) {',
        '    clock += receivedNumber',
        '    music.playTone(music.noteFrequency(Note.C), music.beat(BeatFraction.Quarter))',
        '})',
        'radio.onReceivedString(function (receivedString) {',
        '    word = receivedString',
        '})',
        'input.onButtonPressed(Button.AB, function () {',
        '    music._playDefaultBackground(music.builtInPlayableMelody(Melodies.Dadadadum), music.PlaybackMode.InBackground)',
        '})',
        'basic.forever(function () {',
        '    let light = input.lightLevel()',
        '    isSwitched = Math.abs(input.magneticForce(Dimension.Strength)) > 100',
        '    music.setTempo(100)',
        '    music.ringTone(262)',
        '    music.rest(music.beat(BeatFraction.Half))',
        '    basic.showString(word + light)',
        '})'
    ].join('\n');
    const control = await compile('microbit', tinyMicrobit(original));
    assert.equal(control.success, true, `the original is not valid MakeCode: ${JSON.stringify(control.diagnostics.slice(0, 2))}`);

    const imported = microbitToPseudocode(original);
    assert.deepEqual(imported.unsupported, [], 'the import refused something');
    const {ts, unsupported} = projectToMakeCodeTs(new SB3Creator().parse(imported.code));
    assert.deepEqual(unsupported, [], 'the export refused something');
    for (const call of ['radio.onReceivedNumber', 'radio.onReceivedString', 'music.playTone', 'music.noteFrequency',
        'music.beat', 'music._playDefaultBackground', 'music.builtInPlayableMelody', 'input.buttonIsPressed',
        'input.magneticForce', 'music.setTempo', 'music.ringTone', 'music.rest', 'basic.showString']) {
        assert.ok(ts.includes(`${call}(`), `${call} did not come back:\n${ts}`);
    }
    assert.match(ts, /Button\.AB/);
    const r = await compile('microbit', tinyMicrobit(ts));
    assert.equal(r.success, true, `MakeCode refused the re-export: ${JSON.stringify(r.diagnostics.slice(0, 2))}\n${ts}`);
});

// ---- which base a micro:bit DOWNLOAD links onto ----
// The owner's rule: Microsoft's official bases wherever one exists; ours (the
// Bluetooth-free V2 build, hexcache-emu/) only where none does. For {core, radio}
// the npm hexcache has none, but MakeCode's CDN has both halves (V1 f7b3cfda…,
// V2 137d8c97…), pinned in the sync's BASES — so a {core, radio} download is a
// full universal .hex on the official bases, and our base stays the emulator's.

/** A native micro:bit build through the download's own base lookup (hexcache/), recording what it asked for. */
async function download (deps) {
    const files = {'pxt.json': JSON.stringify({name: 'bw-dl', dependencies: deps, files: ['main.ts'], targetVersions: {target: '9.1.1'}}),
        'main.ts': 'basic.showString("DL")\n'};
    const asked = [];
    const sb = pxtFor('microbit');
    const r = JSON.parse(JSON.stringify(await sb.bwMakeCode.compile(files, {native: true, getBaseHex: async sha => {
        asked.push(sha);
        return getBaseHex('microbit')(sha);
    }})));
    return {r, asked};
}
const flat = hex => flashImage(hex);
const servedBase = sha => fs.readFileSync(path.join(STATIC, 'microbit/hexcache', `${sha}.hex`));

test('a {core, radio} micro:bit project downloads a universal .hex on MakeCode\'s official V1 and V2 bases', {skip}, async () => {
    const [v1, v2] = BASES.microbit;
    const {r, asked} = await download({core: '*', radio: '*'});
    assert.equal(r.success, true, JSON.stringify(r.diagnostics.slice(0, 2)));
    assert.deepEqual(asked, [v1.sha, v2.sha], 'the universal build asks for the V1 (mbdal) then the V2 (mbcodal) base');
    // The served bytes ARE the pinned official builds (sha256), and are classified as such.
    for (const pin of [v1, v2]) {
        assert.equal(sha256(servedBase(pin.sha)), pin.sha256, `${pin.sha}: the served base is not the pinned CDN build`);
        const l = baseLicence(pin.sha256);
        assert.ok(l && l.classification === 'chip-restricted' && /MakeCode CDN/.test(l.source), `${pin.sha}: not classified as the official cloud build`);
    }
    assert.ok(r.outfiles['mbdal-binary.hex'] && r.outfiles['mbcodal-binary.hex'], 'both halves of the universal .hex');
    // The V2 image contains the official base's bytes below the program — and not our emulator build's.
    const img = flat(r.outfiles['mbcodal-binary.hex']);
    const official = flat(servedBase(v2.sha).toString('utf8'));
    const same = (a, b, from, to) => { let d = 0; for (let i = from; i < to; i++) if (a[i] !== b[i]) d++; return d; };
    assert.equal(same(img, official, 0, 0x1C000), 0, 'the MBR and S113 SoftDevice region is not the official base\'s');
    assert.ok(same(img, official, 0x1C000, 0x40000) <= 64, 'the CODAL region differs from the official base by more than pxt\'s patch');
    // …and the V1 image carries the official V1 base (MBR + S110) unchanged.
    assert.equal(same(flat(r.outfiles['mbdal-binary.hex']), flat(servedBase(v1.sha).toString('utf8')), 0, 0x18000), 0,
        'the V1 MBR and S110 SoftDevice region is not the official V1 base\'s');
    const ours = path.join(STATIC, 'microbit/hexcache-emu', `${MICROBIT_EMU_BASES['v2-radio'].sha}.hex`);
    if (fs.existsSync(ours)) {
        assert.ok(same(img, flat(fs.readFileSync(ours, 'utf8')), 0, 0x40000) > 1000, 'the download linked onto OUR emulator base');
    }
    assert.deepEqual(r.netAttempts, []);
});

test('a project that already had an official base still gets the same one: {core, radio, microphone} from pxt-microbit\'s own hexcache', {skip}, async () => {
    const {r, asked} = await download({core: '*', radio: '*', microphone: '*'});
    assert.equal(r.success, true, JSON.stringify(r.diagnostics.slice(0, 2)));
    assert.deepEqual(asked, ['949fbd03bf2de1d4bf409bb1e68613a9d8745ca0bbafef44aa472a60ef9c0f73', '354b97da4696027afdaa3977420ec181bfc88a2faa2d2c0174842767718551e7']);
    for (const sha of asked) {
        const l = baseLicence(sha256(servedBase(sha)));
        assert.ok(l && /pxt-microbit 9\.1\.1 hexcache/.test(l.source), `${sha}: not the base pxt-microbit ships (${l && l.source})`);
    }
    assert.ok(!BASES.microbit.some(p => asked.includes(p.sha)), 'the CDN pins must not shadow a set the npm package covers');
});

test('THIRD-PARTY-NOTICES says which base a {core, radio} download carries', () => {
    const notices = fs.readFileSync(path.join(ROOT, 'THIRD-PARTY-NOTICES.md'), 'utf8');
    const section = notices.slice(notices.indexOf('## Microsoft MakeCode'), notices.indexOf('### micro:bit emulator firmware bases'));
    for (const pin of BASES.microbit) {
        assert.ok(section.includes(pin.sha.slice(0, 8)), `the MakeCode notice does not name the ${pin.sha.slice(0, 8)}… base`);
        const l = baseLicence(pin.sha256);
        assert.ok(l, `${pin.sha}: not classified in base-licences.js`);
        assert.ok(section.includes(l.base), `the notice does not say ${pin.sha.slice(0, 8)}… is the ${l.base} base`);
    }
    assert.match(section, /\{core, radio\}[^]*S110[^]*S113|\{core, radio\}[^]*S113[^]*S110/, 'and names the SoftDevices they carry');
});

test('census batch 3: sound, the logo, signal strength, results, break and for-of come back from lite and MakeCode compiles them', {skip}, async () => {
    const {default: SB3Creator} = await import(path.join(ROOT, 'overlay/scratch-gui/src/lib/sb3-creator.js'));
    const {microbitToPseudocode} = await import(path.join(ROOT, 'overlay/scratch-gui/src/lib/bw-makecode/microbit-translate.js'));
    const {projectToMakeCodeTs} = await import(path.join(ROOT, 'overlay/scratch-gui/src/lib/bw-makecode/export.js'));
    const original = [
        'let total = 0',
        'let nums: number[] = [3, 5]',
        'function seriesSum(n: number) {',
        '    if (n < 1) {',
        '        return 0',
        '    }',
        '    return (n * (n + 1)) / 2',
        '}',
        'radio.onReceivedNumber(function (receivedNumber) {',
        '    total = radio.receivedPacket(RadioPacketProperty.SignalStrength)',
        '    if (receivedNumber == 0) {',
        '        return',
        '    }',
        '    music.playSoundEffect(music.createSoundEffect(WaveShape.Sine, 5000, 1, 255, 0, 300, SoundExpressionEffect.Vibrato, InterpolationCurve.Linear), SoundExpressionPlayMode.InBackground)',
        '})',
        'input.onLogoEvent(TouchButtonEvent.Pressed, function () {',
        '    music.play(music.builtinPlayableSoundEffect(soundExpression.hello), music.PlaybackMode.UntilDone)',
        '})',
        'basic.forever(function () {',
        '    total = seriesSum(4) + 1',
        '    for (let n of nums) {',
        '        total += n',
        '        if (total > 20) {',
        '            break',
        '        }',
        '        basic.showNumber(total)',
        '    }',
        '    music.play(music.tonePlayable(262, music.beat(BeatFraction.Quarter)), music.PlaybackMode.UntilDone)',
        '})'
    ].join('\n');
    const control = await compile('microbit', tinyMicrobit(original));
    assert.equal(control.success, true, `the original is not valid MakeCode: ${JSON.stringify(control.diagnostics.slice(0, 2))}`);
    const imported = microbitToPseudocode(original);
    assert.deepEqual(imported.unsupported, [], 'the import refused something');
    const {ts, unsupported} = projectToMakeCodeTs(new SB3Creator().parse(imported.code));
    assert.deepEqual(unsupported, [], 'the export refused something');
    for (const call of ['radio.receivedPacket', 'music.playSoundEffect', 'music.createSoundEffect', 'input.logoIsPressed',
        'music.builtinPlayableSoundEffect', 'music.tonePlayable', 'seriesSum']) {
        assert.ok(ts.includes(`${call}(`), `${call} did not come back:\n${ts}`);
    }
    const r = await compile('microbit', tinyMicrobit(ts));
    assert.equal(r.success, true, `MakeCode refused the re-export: ${JSON.stringify(r.diagnostics.slice(0, 2))}\n${ts}`);
});
