#!/usr/bin/env node
/**
 * sync:makecode — fetch the pinned Microsoft MakeCode runtime (MIT) and serve it.
 *
 * WHAT IT IS FOR. MakeCode's own compiler and simulators, run inside lite with no
 * makecode.com: an imported MakeCode project (micro:bit or Arcade) is compiled
 * by pxt's real compiler and runs in pxt's real simulator, and a micro:bit
 * program compiles to a real, flashable .hex. Measured on the spike (2026-09-25):
 * a micro:bit program compiles to simulator JS in ~5 s and to a universal .hex in
 * ~9 s with ZERO network requests, and that .hex is byte-identical to the one
 * Microsoft's own `makecode` CLI builds; an Arcade game compiles to simulator JS
 * in ~10-19 s. See lib/bw-makecode/pxt-runtime.js for the driver.
 *
 * WHERE IT COMES FROM. The four npm tarballs below, fetched by exact versioned
 * registry URL and pinned by sha256 — the sha256, not the URL, decides what
 * ships: every byte is verified BEFORE anything is extracted, and a replaced or
 * corrupted tarball fails closed. ~48 MB of tarball; only the runtime files are
 * extracted (~15 MB served). NEVER committed: the tarballs are cached in
 * artifacts/makecode/ and the runtime is written under
 * packages/scratch-gui/static/makecode/, both gitignored; webpack copies static/
 * wholesale. A build that never ran this sync simply does not offer the MakeCode
 * runtime, and the UI says so by name (the pico-micropython contract).
 *
 * WHY THESE VERSIONS TOGETHER. Each target is compiled by the pxt-core it was
 * built against (its own dependency), so pxt-microbit 9.1.1 pairs with pxt-core
 * 13.0.1 and pxt-arcade 4.2.1 with 13.2.1 — the pairs the spike ran.
 *
 * WHAT IS NOT HERE. Arcade hardware (.uf2): pxt-arcade ships no precompiled
 * firmware base ("hexcache"), so a native Arcade build would need MakeCode's
 * cloud C++ compiler; the driver refuses it by name (NO_BASE_HEX) rather than
 * reaching the network. The same refusal covers a micro:bit project that adds a
 * C++ extension beyond the default core+radio+microphone set.
 *
 * Usage:
 *   npm run sync:makecode           # fetch (verify sha256) + extract under static/
 *   npm run sync:makecode:check     # verify the cache and the served files; never fetch
 */
// WHAT THIS SHIPS, for THIRD-PARTY-NOTICES.md: test/notices-drift.test.mjs reads this
// declaration (strict JSON) from every sync script that places an artifact under static/,
// and fails by name when the notices do not carry the name, licence and holder.
export const NOTICE = {"name":"Microsoft MakeCode","licence":"MIT","holder":"Microsoft Corporation"};
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const CACHE_DIR = path.join(ROOT, 'artifacts', 'makecode');
export const STATIC_DIR = path.join(ROOT, 'packages', 'scratch-gui', 'static', 'makecode');
const ARCADE_PAGE = path.join(ROOT, 'scripts', 'makecode', 'arcade-simulator.html');
const HOST_PAGE = path.join(ROOT, 'scripts', 'makecode', 'host.html');

/** The pinned tarballs. sha256 of the .tgz bytes, measured 2026-09-25. */
export const TARBALLS = {
    'pxt-microbit@9.1.1': {
        url: 'https://registry.npmjs.org/pxt-microbit/-/pxt-microbit-9.1.1.tgz',
        sha256: 'b0885ffb255df740f29802f5a29a510766be0e13e2682b23c6b0051c4da4dff6'
    },
    'pxt-arcade@4.2.1': {
        url: 'https://registry.npmjs.org/pxt-arcade/-/pxt-arcade-4.2.1.tgz',
        sha256: 'd403926da1c96dd71a696f0182dbdd82b97babb9d0de9281b8e2a6b67c57cf32'
    },
    'pxt-core@13.0.1': {
        url: 'https://registry.npmjs.org/pxt-core/-/pxt-core-13.0.1.tgz',
        sha256: '049331a7757cf45aad38f111743c8c5fa5843a9ac0e5407439c38301d1aa0d38'
    },
    'pxt-core@13.2.1': {
        url: 'https://registry.npmjs.org/pxt-core/-/pxt-core-13.2.1.tgz',
        sha256: 'e2c4c2a3f353f02abff1eff98ad066eab28e643311d0688961fb8b0388578033'
    },
    'pxt-calliope@3.0.30': {
        url: 'https://registry.npmjs.org/pxt-calliope/-/pxt-calliope-3.0.30.tgz',
        sha256: '3bd1964d2294b4a893b0406dcf1511bbe944d49d73dea9aff2773d02d09c5470'
    },
    'pxt-core@6.0.23': {
        url: 'https://registry.npmjs.org/pxt-core/-/pxt-core-6.0.23.tgz',
        sha256: '0c2eb6f4205769d2d67073944b3ee1cec43344642f2c15c263b7def919745b3b'
    },
    'pxt-ev3@1.4.41': {
        url: 'https://registry.npmjs.org/pxt-ev3/-/pxt-ev3-1.4.41.tgz',
        sha256: '6a47621dce07d4f3a5146c1458bbe14ce540f14ff1bb56d5b096d1a8fec62b16'
    },
    'pxt-core@9.3.19': {
        url: 'https://registry.npmjs.org/pxt-core/-/pxt-core-9.3.19.tgz',
        sha256: '382eef0801733feeaac2f4ea3639c05c816d1b0869f70ac0527d2b5f33cef159'
    },
    'pxt-adafruit@1.6.8': {
        url: 'https://registry.npmjs.org/pxt-adafruit/-/pxt-adafruit-1.6.8.tgz',
        sha256: 'f083c49fc0da9e4cac75ca48d09d48d2d637385e0d13fba7f07eac04b3da1769'
    },
    'pxt-core@6.2.6': {
        url: 'https://registry.npmjs.org/pxt-core/-/pxt-core-6.2.6.tgz',
        sha256: '8f49c0f44838a0e9a29e6f383923d3f2ebe9295f50390843a72c168eafcd9ac7'
    }
};

/**
 * Firmware bases the npm packages do not ship but MakeCode's own CDN serves,
 * content-addressed by the extinfo sha pxt computes for a package set (the URL
 * names the C++ package set, not a user program — nothing of anyone's code is
 * sent). Measured 2026-09-25 for each target's default set; pinned by sha256
 * of the bytes like every tarball above.
 */
export const BASES = {
    ev3: [{sha: '9630f4e8f6dff8f47ffc38e86e2d44fa2ac463f7e91e9bc15f5d8f8b279d0d68',
        sha256: '39cd6ff7e0b2b1db2018470f881053e8f13bc05148ffb1b7c9178c74b22e5fec'}],
    adafruit: [{sha: '1a8dde8af2ff6661af42bf0b22638f633ede578627092cc35377f628bcd09056',
        sha256: 'a3fa24bbf0c37ffce26e3e62713fc24517cb0d99c8e15e11e713ba2f20740297'}]
};
const baseUrl = sha => `https://cdn.makecode.com/compile/${sha}.hex`;

/**
 * What each served target is made of: its target tarball, the pxt-core it was
 * built against, and which of their files are served under
 * static/makecode/<target>/ (the directory name is the pxt target id, the
 * `pxtTarget` a MakeCode file names). `sim` is the simulator page's source: the
 * target's own sim/public (its page loads /cdn/*.js and /sim/*.js by absolute
 * path, rewritten to sit side by side) or ours (Arcade ships none).
 */
const coreFiles = core => [
    [core, 'built/web/pxtworker.js', 'pxtworker.js'],
    [core, 'built/web/pxtsim.js', 'sim/pxtsim.js'],
    [core, 'LICENSE', 'LICENSE-pxt-core.txt']
];
export const TARGETS = {
    microbit: {
        target: 'pxt-microbit@9.1.1', core: 'pxt-core@13.0.1', sim: 'public',
        files: [
            ['pxt-microbit@9.1.1', 'built/target.json', 'target.json'],
            ['pxt-microbit@9.1.1', 'built/sim.js', 'sim/sim.js'],
            ['pxt-microbit@9.1.1', 'built/hexcache/', 'hexcache/'],
            ['pxt-microbit@9.1.1', 'sim/public/', 'sim/'],
            ['pxt-microbit@9.1.1', 'LICENSE.txt', 'LICENSE-pxt-microbit.txt'],
            ...coreFiles('pxt-core@13.0.1')
        ]
    },
    arcade: {
        target: 'pxt-arcade@4.2.1', core: 'pxt-core@13.2.1', sim: 'ours',
        files: [
            ['pxt-arcade@4.2.1', 'built/target.json', 'target.json'],
            ['pxt-arcade@4.2.1', 'built/sim.js', 'sim/sim.js'],
            ['pxt-arcade@4.2.1', 'built/common-sim.js', 'sim/common-sim.js'],
            ['pxt-arcade@4.2.1', 'LICENSE', 'LICENSE-pxt-arcade.txt'],
            ...coreFiles('pxt-core@13.2.1')
        ]
    },
    // Calliope mini: its npm package ships its own firmware bases (hexcache).
    // 3.0.30 is the last npm release — older than makecode.calliope.cc's editor.
    calliopemini: {
        target: 'pxt-calliope@3.0.30', core: 'pxt-core@6.0.23', sim: 'public',
        files: [
            ['pxt-calliope@3.0.30', 'built/target.json', 'target.json'],
            ['pxt-calliope@3.0.30', 'built/sim.js', 'sim/sim.js'],
            ['pxt-calliope@3.0.30', 'built/hexcache/', 'hexcache/'],
            ['pxt-calliope@3.0.30', 'sim/public/', 'sim/'],
            ['pxt-calliope@3.0.30', 'LICENSE.txt', 'LICENSE-pxt-calliope.txt'],
            ['pxt-core@6.0.23', 'built/web/bluebird.min.js', 'sim/bluebird.min.js'],
            ...coreFiles('pxt-core@6.0.23')
        ]
    },
    // LEGO MINDSTORMS EV3: programs are ARM Linux ELFs in a file-container
    // UF2; the base comes from BASES.
    ev3: {
        target: 'pxt-ev3@1.4.41', core: 'pxt-core@9.3.19', sim: 'public',
        files: [
            ['pxt-ev3@1.4.41', 'built/target.json', 'target.json'],
            ['pxt-ev3@1.4.41', 'built/sim.js', 'sim/sim.js'],
            ['pxt-ev3@1.4.41', 'built/common-sim.js', 'sim/common-sim.js'],
            ['pxt-ev3@1.4.41', 'sim/public/', 'sim/'],
            ['pxt-ev3@1.4.41', 'LICENSE', 'LICENSE-pxt-ev3.txt'],
            ...coreFiles('pxt-core@9.3.19')
        ]
    },
    // Adafruit Circuit Playground Express (SAMD21); the base comes from BASES.
    adafruit: {
        target: 'pxt-adafruit@1.6.8', core: 'pxt-core@6.2.6', sim: 'public',
        files: [
            ['pxt-adafruit@1.6.8', 'built/target.json', 'target.json'],
            ['pxt-adafruit@1.6.8', 'built/sim.js', 'sim/sim.js'],
            ['pxt-adafruit@1.6.8', 'built/common-sim.js', 'sim/common-sim.js'],
            ['pxt-adafruit@1.6.8', 'sim/public/', 'sim/'],
            ['pxt-adafruit@1.6.8', 'LICENSE', 'LICENSE-pxt-adafruit.txt'],
            ['pxt-core@6.2.6', 'built/web/bluebird.min.js', 'sim/bluebird.min.js'],
            ...coreFiles('pxt-core@6.2.6')
        ]
    }
};

const tgzPath = id => path.join(CACHE_DIR, id.replace('@', '-') + '.tgz');
const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex');

/** The pinned tarball's bytes: from the cache (re-verified) or fetched (verified before written). */
async function tarball (id, {offline}) {
    const pin = TARBALLS[id];
    const file = tgzPath(id);
    if (fs.existsSync(file)) {
        const bytes = fs.readFileSync(file);
        if (sha256(bytes) === pin.sha256) return bytes;
        if (offline) throw new Error(`${id}: cached ${file} does not match the pinned sha256`);
    }
    if (offline) throw new Error(`${id}: not cached at ${file} — run \`npm run sync:makecode\``);
    const res = await fetch(pin.url);
    if (!res.ok) throw new Error(`${id}: ${pin.url} -> HTTP ${res.status}`);
    const bytes = Buffer.from(await res.arrayBuffer());
    const got = sha256(bytes);
    if (got !== pin.sha256) throw new Error(`${id}: sha256 ${got} is not the pinned ${pin.sha256} — refusing it`);
    fs.mkdirSync(CACHE_DIR, {recursive: true});
    fs.writeFileSync(file, bytes);
    return bytes;
}

/**
 * The entries of a .tgz as {name -> Buffer}, names without the leading
 * `package/`. ustar only (what npm writes): a 512-byte header per entry, name at
 * 0 (100 bytes) with the ustar prefix at 345, size as octal at 124, type at 156;
 * 'L' (GNU long name) is honoured for safety. No PATH tool, so it behaves the
 * same on every runner.
 */
export function untar (tgz) {
    const tar = zlib.gunzipSync(tgz);
    const out = new Map();
    const str = (b, o, n) => b.subarray(o, o + n).toString('utf8').replace(/\0.*$/s, '');
    let off = 0;
    let longName = null;
    while (off + 512 <= tar.length) {
        const h = tar.subarray(off, off + 512);
        if (h.every(x => x === 0)) break;
        const size = parseInt(str(h, 124, 12).trim() || '0', 8);
        const type = String.fromCharCode(h[156] || 48);
        const prefix = str(h, 345, 155);
        let name = longName || (prefix ? `${prefix}/${str(h, 0, 100)}` : str(h, 0, 100));
        longName = null;
        const body = tar.subarray(off + 512, off + 512 + size);
        if (type === 'L') longName = body.toString('utf8').replace(/\0.*$/s, '');
        else if (type === '0' || type === '\0') out.set(name.replace(/^package\//, ''), Buffer.from(body));
        off += 512 + Math.ceil(size / 512) * 512;
    }
    return out;
}

/**
 * The simulator pages load their scripts by ABSOLUTE path (/cdn/pxtsim.js,
 * /sim/common-sim.js, /cdn/bluebird.min.js); served here they sit side by side.
 */
function relativisePage (html) {
    return html.replace(/(src|href)="\/(cdn|sim)\/([A-Za-z0-9_.-]+)"/g, '$1="$3"');
}

/**
 * The simulator's pin ids by the name the circuit uses ('p0', 'c4', …), read
 * from the target's own `enum DigitalPin` — the ids are the target's, not an
 * index: on the micro:bit P1 is 101, on the Calliope P1 is 100 and P0 is 112
 * (measured). A target without that enum (the Circuit Playground's pins are
 * objects) gets none, and the host page bridges no pins for it.
 */
function pinNames (bundle) {
    const out = {};
    const texts = Object.values(bundle.bundledpkgs || {}).flatMap(files => Object.values(files)).map(String);
    const text = texts.find(t => /enum DigitalPin\s*\{/.test(t));
    if (!text) return out;                          // no such enum: this target has no edge pins to bridge
    const open = text.indexOf('{', text.search(/enum DigitalPin\s*\{/));
    let depth = 0;
    let end = open;
    for (; end < text.length; end++) {             // brace-matched, not a lazy capture
        if (text[end] === '{') depth++;
        else if (text[end] === '}' && --depth === 0) break;
    }
    const body = text.slice(open + 1, end).replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g, '');
    for (const [, name, id] of body.matchAll(/([A-Za-z][A-Za-z0-9]*)\s*=\s*(\d+)/g)) out[id] = name.toLowerCase();
    return out;
}

/** A CDN firmware base: from the cache (re-verified) or fetched (verified before written). */
async function base (target, pin, {offline}) {
    const file = path.join(CACHE_DIR, `base-${target}-${pin.sha}.hex`);
    if (fs.existsSync(file)) {
        const bytes = fs.readFileSync(file);
        if (sha256(bytes) === pin.sha256) return bytes;
        if (offline) throw new Error(`${target} base ${pin.sha}: cached copy does not match its sha256`);
    }
    if (offline) throw new Error(`${target} base ${pin.sha}: not cached — run \`npm run sync:makecode\``);
    const res = await fetch(baseUrl(pin.sha));
    if (!res.ok) throw new Error(`${target} base: ${baseUrl(pin.sha)} -> HTTP ${res.status}`);
    const bytes = Buffer.from(await res.arrayBuffer());
    const got = sha256(bytes);
    if (got !== pin.sha256) throw new Error(`${target} base ${pin.sha}: sha256 ${got} is not the pinned ${pin.sha256} — refusing it`);
    fs.mkdirSync(CACHE_DIR, {recursive: true});
    fs.writeFileSync(file, bytes);
    return bytes;
}

/** Every file the served runtime must hold, relative to STATIC_DIR. */
function plan (entries) {
    const files = new Map();
    for (const [target, spec] of Object.entries(TARGETS)) {
        for (const [id, from, to] of spec.files) {
            const tar = entries.get(id);
            if (from.endsWith('/')) {
                const hits = [...tar.keys()].filter(k => k.startsWith(from));
                if (!hits.length) throw new Error(`${id}: nothing under ${from}`);
                for (const k of hits) files.set(`${target}/${to}${k.slice(from.length)}`, tar.get(k));
            } else {
                if (!tar.has(from)) throw new Error(`${id}: no ${from} in the tarball`);
                files.set(`${target}/${to}`, tar.get(from));
            }
        }
    }
    for (const [target, spec] of Object.entries(TARGETS)) {
        if (spec.sim === 'ours') {
            // pxt-arcade ships no simulator page (MakeCode generates it inside
            // its own build); ours is committed beside this script.
            files.set(`${target}/sim/simulator.html`, fs.readFileSync(ARCADE_PAGE));
            continue;
        }
        const page = files.get(`${target}/sim/simulator.html`);
        if (!page) throw new Error(`${spec.target}: sim/public/simulator.html is missing`);
        files.set(`${target}/sim/simulator.html`, Buffer.from(relativisePage(page.toString('utf8'))));
    }
    // The app's side: one host page per target, beside that target's pxtsim.js
    // (see its header), and the simulator block of target.json it needs —
    // a few hundred bytes instead of the multi-MB bundle.
    for (const target of Object.keys(TARGETS)) {
        files.set(`${target}/sim/host.html`, fs.readFileSync(HOST_PAGE));
        const bundle = JSON.parse(files.get(`${target}/target.json`).toString('utf8'));
        const sim = bundle.simulator || {};
        files.set(`${target}/sim/config.json`, Buffer.from(JSON.stringify({
            boardDefinition: sim.boardDefinition || null,
            aspectRatio: sim.aspectRatio || 1,
            pinNames: pinNames(bundle)
        }) + '\n'));
    }
    files.set('VERSIONS.json', Buffer.from(JSON.stringify(Object.fromEntries(
        Object.entries(TARGETS).map(([t, s]) => [t, {target: s.target, core: s.core}])), null, 2) + '\n'));
    return files;
}

async function main () {
    const check = process.argv.includes('--check');
    const entries = new Map();
    for (const id of Object.keys(TARBALLS)) entries.set(id, untar(await tarball(id, {offline: check})));
    const files = plan(entries);
    for (const [target, pins] of Object.entries(BASES)) {
        for (const pin of pins) files.set(`${target}/hexcache/${pin.sha}.hex`, await base(target, pin, {offline: check}));
    }
    if (check) {
        const wrong = [...files].filter(([rel, bytes]) => {
            const p = path.join(STATIC_DIR, rel);
            return !fs.existsSync(p) || !fs.readFileSync(p).equals(bytes);
        }).map(([rel]) => rel);
        if (wrong.length) {
            console.error(`[sync:makecode] ${wrong.length} served file(s) missing or stale, e.g. ${wrong.slice(0, 3).join(', ')}`);
            console.error('  run `npm run sync:makecode`');
            process.exit(1);
        }
        console.log(`[sync:makecode] OK — ${files.size} files match the pinned tarballs`);
        return;
    }
    fs.rmSync(STATIC_DIR, {recursive: true, force: true});
    let bytes = 0;
    for (const [rel, data] of files) {
        const p = path.join(STATIC_DIR, rel);
        fs.mkdirSync(path.dirname(p), {recursive: true});
        fs.writeFileSync(p, data);
        bytes += data.length;
    }
    console.log(`[sync:makecode] ${files.size} files, ${(bytes / 1048576).toFixed(1)} MB under ` +
        `${path.relative(ROOT, STATIC_DIR)} (${Object.keys(TARGETS).join(', ')})`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    main().catch(e => { console.error(`[sync:makecode] ${e.message}`); process.exit(1); });
}
