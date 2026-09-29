/**
 * Third-party MakeCode extensions, offline (scripts/sync-makecode-extensions.mjs,
 * lib/bw-makecode/extensions-vendored.js, the pxt glue in pxt-runtime.js).
 *
 * What is asserted, and why each:
 *
 *   - THE VENDORED BYTES ARE THE PINNED ONES. Every file's git blob sha is
 *     re-derived here from the committed text and must equal the one recorded
 *     from the commit's tree; the sync script's pins and the vendored module
 *     agree on repo, tag and commit; every file pxt.json lists is present. A
 *     hand edit to the vendored source, or a pin moved without a re-sync, is
 *     red BY NAME without a network.
 *   - THE LICENCE IS CHECKED, NOT ASSUMED. Each vendored LICENSE is recognised as
 *     the licence its pin declares and names its holder; the verdict REFUSES by
 *     name a copyleft text, an unrecognised text, and a holder mismatch — so the
 *     refusal path is proved to fire, not merely present.
 *   - A PROJECT THAT NAMES AN EXTENSION COMPILES OFFLINE: each vendored
 *     extension, named the way MakeCode's docs name it, compiles for the
 *     simulator with zero network attempts — with the process's own `fetch`
 *     replaced by one that throws, so no path here can reach a network — and a
 *     turtle program builds real firmware (a .hex) on the shipped base.
 *   - THE MUTATIONS RED WITH A NAME: with the extension removed from the glue's
 *     table, or pinned to a commit this build does not carry, the compile is
 *     refused as NO_EXTENSION naming the dependency (and the refused fetch is
 *     counted, the positive control for every "zero attempts" above).
 *
 * The compile cases need the synced runtime (npm run sync:makecode); without it
 * they SKIP BY NAME. The vendoring and licence cases always run.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import util from 'node:util';
import {fileURLToPath} from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const STATIC = path.join(ROOT, 'packages/scratch-gui/static/makecode');
const LIB = path.join(ROOT, 'overlay/scratch-gui/src/lib/bw-makecode');
const {VENDORED_EXTENSIONS} = await import(path.join(LIB, 'extensions-vendored.js'));
const {PXT_GLUE_JS, MICROBIT_DEFAULT_DEPENDENCIES} = await import(path.join(LIB, 'pxt-runtime.js'));
const {EXTENSIONS, REDISTRIBUTABLE, gitBlobSha, licenceOf, licenceVerdict} =
    await import(path.join(ROOT, 'scripts/sync-makecode-extensions.mjs'));

// No path in this file may reach a network: the compile runs in a vm with no
// fetch at all, and this process's own fetch refuses.
globalThis.fetch = async url => { throw new Error(`network used in an offline test: ${url}`); };

const SYNCED = fs.existsSync(path.join(STATIC, 'microbit/pxtworker.js'));
const skip = SYNCED ? false : 'MakeCode runtime not synced (npm run sync:makecode) — pxt compiler absent';

// ── the vendored source ─────────────────────────────────────────────────

test('every vendored file is the pinned upstream blob (re-derived from the committed text)', () => {
    assert.equal(VENDORED_EXTENSIONS.length, EXTENSIONS.length, 'the vendored module and the pins list different extensions');
    const wrong = [];
    for (const e of VENDORED_EXTENSIONS) {
        for (const [name, f] of [...Object.entries(e.files), [e.licenceFile, e.licenceText]]) {
            const got = gitBlobSha(Buffer.from(f.text, 'utf8'));
            if (got !== f.blob) wrong.push(`${e.repo}@${e.commit.slice(0, 12)} ${name}: text hashes to blob ${got}, pinned ${f.blob}`);
        }
    }
    assert.deepEqual(wrong, [], 'vendored MakeCode extension source differs from its pinned commit — re-run ' +
        '`node scripts/sync-makecode-extensions.mjs` (never edit extensions-vendored.js by hand):\n  ' + wrong.join('\n  '));
});

test('the pins and the vendored module agree; every pin is an exact commit; pxt.json\'s files are all there', () => {
    for (const pin of EXTENSIONS) {
        assert.match(pin.commit, /^[0-9a-f]{40}$/, `${pin.repo}: the pin is not a full commit sha`);
        const e = VENDORED_EXTENSIONS.find(x => x.id === pin.id);
        assert.ok(e, `${pin.id} is pinned but not vendored — run the sync`);
        for (const k of ['spec', 'repo', 'tag', 'commit', 'licence', 'holder']) {
            assert.equal(e[k], pin[k], `${pin.id}: ${k} is ${e[k]} in the vendored module, ${pin[k]} in the pin — re-run the sync`);
        }
        const cfg = JSON.parse(e.files['pxt.json'].text);
        for (const f of cfg.files) assert.ok(e.files[f], `${pin.id}: pxt.json lists ${f}, which is not vendored`);
        assert.equal(`github:${pin.repo}#${pin.tag}`.toLowerCase(), pin.spec.toLowerCase(), `${pin.id}: spec and repo/tag disagree`);
    }
});

test('each vendored licence is the declared, redistributable one and names its holder', () => {
    for (const e of VENDORED_EXTENSIONS) {
        assert.ok(REDISTRIBUTABLE.includes(e.licence), `${e.repo}: ${e.licence}`);
        assert.equal(licenceOf(e.licenceText.text), e.licence, `${e.repo}: its LICENSE does not read as ${e.licence}`);
        assert.deepEqual(licenceVerdict(e, e.licenceText.text), {ok: true});
    }
    // The shipped licence text carries every holder, and the notices name each extension.
    const shipped = fs.readFileSync(path.join(ROOT, 'overlay/scratch-gui/static/licenses/makecode-extensions.MIT.txt'), 'utf8');
    const notices = fs.readFileSync(path.join(ROOT, 'THIRD-PARTY-NOTICES.md'), 'utf8');
    for (const e of VENDORED_EXTENSIONS) {
        assert.ok(shipped.includes(e.licenceText.text.trim().split('\n').find(l => /Copyright/.test(l)).trim()),
            `${e.repo}: its copyright line is not in static/licenses/makecode-extensions.MIT.txt`);
        assert.ok(notices.includes(e.repo) && notices.includes(e.commit), `${e.repo}@${e.commit} is not in THIRD-PARTY-NOTICES.md`);
    }
});

test('the licence verdict REFUSES by name: copyleft, unrecognised text, wrong holder', () => {
    const pin = EXTENSIONS[0];
    const gpl = 'GNU GENERAL PUBLIC LICENSE Version 3, 29 June 2007\nCopyright (C) 2007 Free Software Foundation';
    assert.match(licenceVerdict(pin, gpl).reason, /not a licence this sync recognises — refused/);
    const mit = VENDORED_EXTENSIONS[0].licenceText.text;
    assert.match(licenceVerdict({...pin, holder: 'Someone Else'}, mit).reason, /does not name Someone Else/);
    assert.match(licenceVerdict({...pin, licence: 'Apache-2.0'}, mit).reason, /LICENSE says MIT, the pin declares Apache-2.0/);
    assert.equal(licenceOf('Redistribution and use in source and binary forms, with or without modification'), 'BSD-2-Clause');
});

// ── compiling with them, offline ────────────────────────────────────────

/** The worker's globals in a vm, as test/makecode-pxt-runtime.test.mjs builds them. */
function pxtSandbox () {
    const quiet = () => {};
    const sb = {
        setTimeout, clearTimeout, setInterval, clearInterval, setImmediate, clearImmediate,
        TextEncoder: util.TextEncoder, TextDecoder: util.TextDecoder, Buffer,
        console: {log: quiet, debug: quiet, info: quiet, warn: quiet, error: quiet},
        pxtTargetBundle: JSON.parse(fs.readFileSync(path.join(STATIC, 'microbit/target.json'), 'utf8'))
    };
    sb.global = sb;
    sb.self = sb;
    sb.eval = src => vm.runInContext(src, sb, {filename: 'eval'});
    vm.createContext(sb, {codeGeneration: {strings: false, wasm: false}});
    vm.runInContext(fs.readFileSync(path.join(STATIC, 'microbit/pxtworker.js'), 'utf8'), sb, {filename: 'pxtworker.js'});
    vm.runInContext(PXT_GLUE_JS, sb, {filename: 'pxt-glue.js'});
    return sb;
}
let shared = null;
const sandbox = () => (shared = shared || pxtSandbox());
const plain = x => JSON.parse(JSON.stringify(x));
const project = (main, extra) => ({
    'pxt.json': JSON.stringify({name: 'ext-test', dependencies: {...MICROBIT_DEFAULT_DEPENDENCIES, ...extra}, files: ['main.ts']}),
    'main.ts': main
});
const getBaseHex = async sha => {
    const p = path.join(STATIC, 'microbit/hexcache', `${sha}.hex`);
    return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null;
};

/** One program per vendored extension, in the spelling MakeCode's docs use for it. */
const PROGRAMS = {
    microturtle: 'turtle.setPosition(0, 0)\nturtle.turnRight()\nturtle.pen(TurtlePenMode.Down)\nturtle.forward(4)\nturtle.back(1)\n',
    'radio-blockchain': 'blockchain.addBlock(1)\nbasic.showNumber(blockchain.valuesFrom(blockchain.id()).length)\nbasic.showNumber(blockchain.length())\n',
    'pxt-kitronik-motor-driver': 'kitronik.motorOn(kitronik.Motors.Motor1, kitronik.MotorDirection.Forward, 100)\nkitronik.motorOff(kitronik.Motors.Motor2)\n'
};

test('each vendored extension compiles for the simulator with zero network attempts', {skip}, async () => {
    const sb = sandbox();
    for (const pin of EXTENSIONS) {
        const r = plain(await sb.bwMakeCode.compile(project(PROGRAMS[pin.id], {[pin.id]: pin.spec}), {}));
        assert.equal(r.success, true, `${pin.id}: ${JSON.stringify(r.diagnostics.slice(0, 3))}`);
        assert.deepEqual(r.netAttempts, [], `${pin.id} reached for the network`);
        assert.ok(r.outfiles['binary.js'].length > 1000, `${pin.id}: no simulator program`);
    }
    // Spelled by commit instead of tag, and with the owner in another case: the same source.
    const t = EXTENSIONS.find(p => p.id === 'microturtle');
    const byCommit = plain(await sb.bwMakeCode.compile(project(PROGRAMS.microturtle, {microturtle: `github:MICROSOFT/pxt-microturtle#${t.commit}`}), {}));
    assert.equal(byCommit.success, true, JSON.stringify(byCommit.diagnostics.slice(0, 3)));
    assert.deepEqual(plain(sb.bwMakeCode.netAttempts), []);
});

test('a turtle program builds real micro:bit firmware on the shipped base, offline', {skip}, async () => {
    const t = EXTENSIONS.find(p => p.id === 'microturtle');
    const r = plain(await sandbox().bwMakeCode.compile(project(PROGRAMS.microturtle, {microturtle: t.spec}), {native: true, getBaseHex}));
    assert.equal(r.success, true, JSON.stringify(r.diagnostics.slice(0, 3)));
    assert.deepEqual(r.netAttempts, []);
    assert.ok(r.outfiles['binary.hex'] && r.outfiles['binary.hex'].length > 100000, 'no universal .hex');
});

test('MUTATION: the extension removed from the build is refused as NO_EXTENSION, by name', {skip}, async () => {
    const sb = pxtSandbox();   // its own sandbox: this one's table is mutated
    const t = EXTENSIONS.find(p => p.id === 'microturtle');
    vm.runInContext(`bwMakeCode.extensions = bwMakeCode.extensions.filter(function (e) { return e.id !== 'microturtle'; });`, sb);
    await assert.rejects(sb.bwMakeCode.compile(project(PROGRAMS.microturtle, {microturtle: t.spec}), {}),
        e => e.code === 'NO_EXTENSION' &&
            e.message.includes(`microturtle (${t.spec})`) && /not available offline/.test(e.message));
    assert.ok(sb.bwMakeCode.netAttempts.length > 0, 'the refused fetch was not counted');
});

test('MUTATION: an extension pinned to a commit this build does not carry is refused as NO_EXTENSION', {skip}, async () => {
    const sb = sandbox();
    const before = sb.bwMakeCode.netAttempts.length;
    const other = 'github:microsoft/pxt-microturtle#0000000000000000000000000000000000000000';
    await assert.rejects(sb.bwMakeCode.compile(project(PROGRAMS.microturtle, {microturtle: other}), {}),
        e => e.code === 'NO_EXTENSION' && e.message.includes(other));
    assert.ok(sb.bwMakeCode.netAttempts.length > before, 'the refused fetch was not counted');
});
