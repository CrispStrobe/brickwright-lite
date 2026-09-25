/**
 * MakeCode ARCADE on real hardware, offline: per-hardware firmware bases, served
 * by the sync only when their bytes match a sha256 pinned in
 * scripts/sync-makecode-runtime.mjs (ARCADE_BASES) — MakeCode's cloud build
 * or ours (scripts/build-makecode-arcade-bases.mjs) — and linked by MakeCode's
 * own compiler in lib/bw-makecode/pxt-runtime.js.
 *
 * What is asserted, and why each:
 *   - every pinned base is keyed by the sha the SERVED pxt computes for that
 *     variant's default project — a pxt-arcade pin bump changes every sha, and a
 *     base keyed by a stale sha is never asked for (the build silently reverts to
 *     NO_BASE_HEX); this half needs only the synced runtime, so it runs in CI;
 *   - for each served base, a real game LINKS: the output is a valid UF2 (every
 *     block's magics, the variant's family id, numBlocks = the block count,
 *     block numbers 0..n-1) or, for the nRF52833 boards, an Intel HEX; the image
 *     equals the base below the program except pxt's patch of the bytecode
 *     pointer (a few bytes — measured 16 on rp2040), and the program region is
 *     not the base's — a file that merely EXISTS, or that equals the base, would
 *     pass a weaker check and flash a board that does nothing;
 *   - zero network attempts.
 *
 * Which bytes are linked depends on what the sync served: in the build job,
 * MakeCode's own cloud builds (fetched by sha, pinned by sha256); in the
 * makecode-arcade-bases workflow, OUR from-source builds, served with
 * --built-bases and checked here with BW_REQUIRE_ARCADE_BASES=built — where a
 * missing base FAILS. A base the sync could not get (offline) skips BY NAME.
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
const STATIC = path.join(ROOT, 'packages/scratch-gui/static/makecode/arcade');
const {PXT_GLUE_JS, ARCADE_HARDWARE, firmwareFile} = await import(path.join(ROOT, 'overlay/scratch-gui/src/lib/bw-makecode/pxt-runtime.js'));
const {ARCADE_BASES} = await import(path.join(ROOT, 'scripts/sync-makecode-runtime.mjs'));
const {buildRequest} = await import(path.join(ROOT, 'scripts/build-makecode-arcade-bases.mjs'));

const SYNCED = fs.existsSync(path.join(STATIC, 'pxtworker.js'));
const skip = SYNCED ? false : 'MakeCode runtime not synced (npm run sync:makecode) — pxt compiler absent';
const REQUIRE = process.env.BW_REQUIRE_ARCADE_BASES || '';   // '' | '1' (every pin) | 'built' (every pin we can build)
const NOT_BUILT = 'Arcade firmware base not served — `npm run sync:makecode` fetches it (or build it: scripts/build-makecode-arcade-bases.mjs)';

let sandbox = null;
function pxt () {
    if (sandbox) return sandbox;
    const quiet = () => {};
    const sb = {
        setTimeout, clearTimeout, setInterval, clearInterval, setImmediate, clearImmediate,
        TextEncoder: util.TextEncoder, TextDecoder: util.TextDecoder, Buffer, atob,
        console: {log: quiet, debug: quiet, info: quiet, warn: quiet, error: quiet},
        pxtTargetBundle: JSON.parse(fs.readFileSync(path.join(STATIC, 'target.json'), 'utf8'))
    };
    sb.global = sb;
    sb.self = sb;
    sb.eval = src => vm.runInContext(src, sb, {filename: 'eval'});
    vm.createContext(sb, {codeGeneration: {strings: false, wasm: false}});
    vm.runInContext(fs.readFileSync(path.join(STATIC, 'pxtworker.js'), 'utf8'), sb, {filename: 'pxtworker.js'});
    vm.runInContext(PXT_GLUE_JS, sb, {filename: 'pxt-glue.js'});
    sandbox = sb;
    return sb;
}

const GAME = {
    'pxt.json': JSON.stringify({name: 'bw-arcade-hw', dependencies: {device: '*'}, files: ['main.ts']}),
    'main.ts': 'let hero = sprites.create(img`\n. 5 .\n5 5 5\n`, SpriteKind.Player)\ncontroller.moveSprite(hero)\ninfo.setScore(3)\ngame.splash("bw arcade hw")\n'
};

/** Flash bytes from an Intel HEX: {bytes by absolute address} as a sparse Map of 256-byte pages. */
function hexImage (text) {
    const mem = new Map();
    let base = 0;
    for (const line of text.split(/\r?\n/)) {
        if (!line.startsWith(':')) continue;
        const b = Buffer.from(line.slice(1), 'hex');
        const n = b[0], addr = b.readUInt16BE(1), type = b[3];
        if (type === 4) base = b.readUInt16BE(4) * 0x10000;
        else if (type === 2) base = b.readUInt16BE(4) * 16;
        else if (type === 0) for (let i = 0; i < n; i++) mem.set(base + addr + i, b[4 + i]);
        else if (type === 1) break;
    }
    return mem;
}

/** A UF2, block by block; throws naming the first defect. */
function uf2Image (bytes, family) {
    assert.equal(bytes.length % 512, 0, 'a UF2 is whole 512-byte blocks');
    const n = bytes.length / 512;
    const buf = Buffer.from(bytes);
    const mem = new Map();
    for (let i = 0; i < n; i++) {
        const o = i * 512;
        assert.equal(buf.readUInt32LE(o), 0x0A324655, `block ${i}: first magic`);
        assert.equal(buf.readUInt32LE(o + 4), 0x9E5D5157, `block ${i}: second magic`);
        assert.equal(buf.readUInt32LE(o + 508), 0x0AB16F30, `block ${i}: final magic`);
        const flags = buf.readUInt32LE(o + 8);
        assert.ok(flags & 0x2000, `block ${i}: no family id flag`);
        assert.equal(buf.readUInt32LE(o + 28), family, `block ${i}: family 0x${buf.readUInt32LE(o + 28).toString(16)}`);
        assert.equal(buf.readUInt32LE(o + 20), i, `block ${i}: blockNo`);
        assert.equal(buf.readUInt32LE(o + 24), n, `block ${i}: numBlocks`);
        const addr = buf.readUInt32LE(o + 12), size = buf.readUInt32LE(o + 16);
        assert.ok(size > 0 && size <= 476, `block ${i}: payload ${size}`);
        for (let k = 0; k < size; k++) mem.set(addr + k, buf[o + 32 + k]);
    }
    return {mem, blocks: n};
}

test('every pinned Arcade base is keyed by the sha the served pxt computes for its hardware', {skip}, async () => {
    const variants = Object.keys(ARCADE_BASES);
    assert.ok(variants.length >= 1, 'no Arcade base is pinned');
    for (const v of variants) {
        assert.ok(ARCADE_HARDWARE[v], `${v} is pinned but not in ARCADE_HARDWARE`);
        const {sha} = await buildRequest(v, {staticDir: STATIC});
        assert.equal(ARCADE_BASES[v].sha, sha, `${v}: pinned sha is not what pxt asks for — rebuild the bases for this pxt-arcade`);
    }
});

for (const [variant, pin] of Object.entries(ARCADE_BASES).filter(([, p]) => REQUIRE !== 'built' || p.built)) {
    const served = SYNCED && fs.existsSync(path.join(STATIC, 'hexcache', `${pin.sha}.hex`));
    const why = skip || (!served && !REQUIRE && NOT_BUILT);
    test(`an Arcade game links onto the ${variant} base: flashable firmware, base intact below the program`, {skip: why}, async () => {
        assert.ok(served, `${variant}: ${NOT_BUILT}`);
        if (REQUIRE === 'built') {
            const got = crypto.createHash('sha256').update(fs.readFileSync(path.join(STATIC, 'hexcache', `${pin.sha}.hex`))).digest('hex');
            assert.equal(got, pin.built.sha256, `${variant}: the served base is not OUR build`);
        }
        const sb = pxt();
        const before = sb.bwMakeCode.netAttempts.length;
        const asked = [];
        const r = JSON.parse(JSON.stringify(await sb.bwMakeCode.compile(GAME, {
            native: true, hwVariant: variant,
            getBaseHex: async sha => {
                asked.push(sha);
                const p = path.join(STATIC, 'hexcache', `${sha}.hex`);
                return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null;
            }
        })));
        assert.equal(r.success, true, JSON.stringify(r.diagnostics.slice(0, 3)));
        assert.deepEqual(asked, [pin.sha], 'the compile asked for a different base than the pinned one');
        assert.equal(sb.bwMakeCode.netAttempts.length, before, 'a network attempt');
        const fw = firmwareFile(r.outfiles);
        assert.ok(fw, `no firmware in outfiles: ${Object.keys(r.outfiles)}`);
        const family = ARCADE_HARDWARE[variant].family;
        let img;
        if (family === null) {
            assert.equal(fw.name, 'binary.hex');
            img = hexImage(new TextDecoder().decode(fw.bytes));
        } else {
            assert.equal(fw.name, 'binary.uf2');
            img = uf2Image(fw.bytes, family).mem;
        }
        const base = hexImage(fs.readFileSync(path.join(STATIC, 'hexcache', `${pin.sha}.hex`), 'utf8'));
        let patched = 0, missing = 0;
        for (const [a, v] of base) {
            if (!img.has(a)) missing++;
            else if (img.get(a) !== v) patched++;
        }
        assert.equal(missing, 0, `${missing} base bytes are absent from the firmware`);
        assert.ok(patched <= 64, `${patched} base bytes changed — more than pxt's bytecode-pointer patch`);
        const extra = [...img.keys()].filter(a => !base.has(a)).length;
        assert.ok(extra > 20000, `only ${extra} bytes beyond the base: the program is not linked in`);
        assert.match(r.outfiles['binary.asm'] || '', /bw arcade hw/, 'the listing does not contain the program');
    });
}
