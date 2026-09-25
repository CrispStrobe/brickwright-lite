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
    }
};

/**
 * What each served target is made of: [tarball, path inside it (under package/),
 * path under static/makecode/<target>/]. A trailing '/' copies a directory.
 */
export const TARGETS = {
    microbit: {
        target: 'pxt-microbit@9.1.1',
        core: 'pxt-core@13.0.1',
        files: [
            ['pxt-microbit@9.1.1', 'built/target.json', 'target.json'],
            ['pxt-microbit@9.1.1', 'built/sim.js', 'sim/sim.js'],
            ['pxt-microbit@9.1.1', 'built/hexcache/', 'hexcache/'],
            ['pxt-microbit@9.1.1', 'sim/public/', 'sim/'],
            ['pxt-microbit@9.1.1', 'LICENSE.txt', 'LICENSE-pxt-microbit.txt'],
            ['pxt-core@13.0.1', 'built/web/pxtworker.js', 'pxtworker.js'],
            ['pxt-core@13.0.1', 'built/web/pxtsim.js', 'sim/pxtsim.js'],
            ['pxt-core@13.0.1', 'LICENSE', 'LICENSE-pxt-core.txt']
        ]
    },
    arcade: {
        target: 'pxt-arcade@4.2.1',
        core: 'pxt-core@13.2.1',
        files: [
            ['pxt-arcade@4.2.1', 'built/target.json', 'target.json'],
            ['pxt-arcade@4.2.1', 'built/sim.js', 'sim/sim.js'],
            ['pxt-arcade@4.2.1', 'built/common-sim.js', 'sim/common-sim.js'],
            ['pxt-arcade@4.2.1', 'LICENSE', 'LICENSE-pxt-arcade.txt'],
            ['pxt-core@13.2.1', 'built/web/pxtworker.js', 'pxtworker.js'],
            ['pxt-core@13.2.1', 'built/web/pxtsim.js', 'sim/pxtsim.js'],
            ['pxt-core@13.2.1', 'LICENSE', 'LICENSE-pxt-core.txt']
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

/** The simulator pages load their scripts by ABSOLUTE path (/cdn/pxtsim.js); served here they sit side by side. */
function relativisePage (html) {
    return html
        .replace(/src="\/cdn\/pxtsim\.js"/g, 'src="pxtsim.js"')
        .replace(/src="\/sim\/sim\.js"/g, 'src="sim.js"');
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
    const mbPage = files.get('microbit/sim/simulator.html');
    if (!mbPage) throw new Error('pxt-microbit: sim/public/simulator.html is missing');
    files.set('microbit/sim/simulator.html', Buffer.from(relativisePage(mbPage.toString('utf8'))));
    // pxt-arcade ships no simulator page (MakeCode generates it inside its own
    // build); ours is committed beside this script — see its header.
    files.set('arcade/sim/simulator.html', fs.readFileSync(ARCADE_PAGE));
    // The app's side: one host page per target, beside that target's pxtsim.js
    // (see its header), and the simulator block of target.json it needs —
    // a few hundred bytes instead of the multi-MB bundle.
    for (const target of Object.keys(TARGETS)) {
        files.set(`${target}/sim/host.html`, fs.readFileSync(HOST_PAGE));
        const sim = JSON.parse(files.get(`${target}/target.json`).toString('utf8')).simulator || {};
        files.set(`${target}/sim/config.json`, Buffer.from(JSON.stringify({
            boardDefinition: sim.boardDefinition || null,
            aspectRatio: sim.aspectRatio || 1
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
        `${path.relative(ROOT, STATIC_DIR)} (microbit + arcade)`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    main().catch(e => { console.error(`[sync:makecode] ${e.message}`); process.exit(1); });
}
