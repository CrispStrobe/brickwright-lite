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
 * ARCADE HARDWARE (.uf2). pxt-arcade ships no precompiled firmware base
 * ("hexcache"). MakeCode's cloud has one per hardware variant for the default
 * package set, content-addressed by pxt's sha (ARCADE_BASES below): fetched here
 * and pinned by sha256, exactly as the tarballs are. We can also BUILD them from
 * the open-source C++ runtime (CODAL + pxt-common-packages) with
 * scripts/build-makecode-arcade-bases.mjs — the from-source fallback, proved by
 * the makecode-arcade-bases workflow. Either way a base is served under
 * arcade/hexcache/<sha>.hex only when its bytes match a pin. A base that cannot
 * be had is skipped BY NAME: the driver then refuses that variant's native build
 * (NO_BASE_HEX) rather than reaching the network, as it does for a micro:bit
 * project with a C++ extension beyond the default core+radio+microphone set.
 *
 * Usage:
 *   npm run sync:makecode           # fetch (verify sha256) + extract under static/
 *   npm run sync:makecode:check     # verify the cache and the served files; never fetch
 *   npm run sync:makecode -- --strict-bases   # and fail unless every pinned Arcade base is served
 *   npm run sync:makecode -- --built-bases    # serve ONLY our from-source builds, all of them, or fail
 *   npm run sync:makecode -- --emu-bases      # and fail unless every pinned micro:bit emulator base is served
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

/**
 * MakeCode Arcade firmware bases, one per hardware variant (hw---<variant>) for
 * the default project {device}.
 *   sha     pxt's extinfo.sha — the file name the driver asks for. Identical for
 *           pxt-arcade 4.2.1 (npm, what we serve) and 4.1.25 (arcade.makecode.com
 *           live, 2026-09-25): the C++ did not change between them.
 *   url     MakeCode's own cloud build of that request, content-addressed by
 *           the sha (cdn.makecode.com/compile/<sha>.hex — the file pxt's editor
 *           downloads; a GET, the CDN answers HEAD with 404). Fetched at SYNC,
 *           never at runtime; its bytes are pinned below like the tarballs'.
 *   sha256  of those bytes: what ships by default (the micro:bit bases
 *           pxt-microbit ships are the same kind of file).
 *   built   our own from-source build (scripts/build-makecode-arcade-bases.mjs,
 *           gcc 13.2.1 = Ubuntu 24.04's gcc-arm-none-eabi 15:13.2.rel1-2;
 *           byte-reproducible across build directories), accepted in place of
 *           the CDN bytes when present in artifacts/makecode/arcade-bases/.
 *           Different bytes (Microsoft builds with gcc 9), the same program ABI:
 *           test/makecode-arcade-bases links a game onto both. null: we cannot
 *           build it yet (n4 — newlib 4.4's crt0 needs __wrap_atexit).
 * A new pxt-arcade pin can change every sha: re-derive (build script --plan),
 * re-fetch, re-pin.
 */
const MAKECODE_CDN = 'https://cdn.makecode.com/compile/';
export const ARCADE_BASES_DIR = path.join(ROOT, 'artifacts', 'makecode', 'arcade-bases');
export const ARCADE_BASES = {
    rp2040: {sha: 'a62909b15aac9c857b6fd620f3679a7f5e05a41ab27915d9427cc4b74ee626a5',
        url: `${MAKECODE_CDN}a62909b15aac9c857b6fd620f3679a7f5e05a41ab27915d9427cc4b74ee626a5.hex`, sha256: '9055c740a7282afe5ecf1b151a0f1cc4d0cb48c09d4e9e32472c056b889c0daf', bytes: 288515,
        built: {sha256: 'ac1e891bd6d451ca83e97f452f97050cb07322ba6c7d75af88ab761bd323fd2f', bytes: 310152}},
    samd51: {sha: 'c160106c8559347801cd81c14bb4569af0ea0d946fac0fe5408f22a39af497de',
        url: `${MAKECODE_CDN}c160106c8559347801cd81c14bb4569af0ea0d946fac0fe5408f22a39af497de.hex`, sha256: 'e07518572d4c43f77d90eef6c7c76878daf3940ec16201319aab8b013f890166', bytes: 359398,
        built: {sha256: '5d617fdaa6d88466c23ef8e9c708ecf2495df165b6a23bbf53c658bb08c6357f', bytes: 374931}},
    samd51adafruit: {sha: '19efcdc73769fdfdeb51aa215c528bebad59782cbc538f72f4a194326f1f42b1',
        url: `${MAKECODE_CDN}19efcdc73769fdfdeb51aa215c528bebad59782cbc538f72f4a194326f1f42b1.hex`, sha256: '842c30c5fc1db2346a949837c2e21acdb57937aa0a82f4d505725e995ff02b97', bytes: 361828,
        built: {sha256: '9c2310bd5a65f0543c69a076e51a4067c803202a39228f3a7de41451be0da9ca', bytes: 376911}},
    stm32f401: {sha: '1915b044ab6c65c236601e9e05c7ce8acaa3b757f86bb7f6e1c745b14962aea7',
        url: `${MAKECODE_CDN}1915b044ab6c65c236601e9e05c7ce8acaa3b757f86bb7f6e1c745b14962aea7.hex`, sha256: 'd2c9e20091c3e27ff38fb279fe89b169ea430c4b64023181e8924d41d601ee1d', bytes: 404513,
        built: {sha256: '446ba6c78a13b43335f68a54b3c53413b37e67c7bb12c18ceea8dfe3128ec560', bytes: 423659}},
    n3: {sha: '533be6dacf73215424c471cdcc0adca232b99876282f12451bbc8f8b57547365',
        url: `${MAKECODE_CDN}533be6dacf73215424c471cdcc0adca232b99876282f12451bbc8f8b57547365.hex`, sha256: '7c3cf6220ffe6ee325c19c96ce6103e69b2e0735127f9ff1e7110889f3bbbd25', bytes: 328296,
        built: {sha256: 'f27c91352f8208869ae9e8bb5479a258127e1d4b005df9cf780974ce737b8455', bytes: 345719}},
    gdk: {sha: '429b694f33f0bde17af5f67b87ca7bec325d9aca297ea7bf178c8d95c3e05121',
        url: `${MAKECODE_CDN}429b694f33f0bde17af5f67b87ca7bec325d9aca297ea7bf178c8d95c3e05121.hex`, sha256: '285daaa7bb94e3de58808e0a167e9fad9ccad87089812d8b7159f37ff4ee798f', bytes: 329135,
        built: {sha256: '6d120bcf68a9aae42f81aa40092dd57122c2cfa673426a68e0f22fffbed32cca', bytes: 346828}},
    n4: {sha: '6dec95e447be3440084b2e3ee685da90bbb87fe2d3115f0160ca168262a730d4',
        url: `${MAKECODE_CDN}6dec95e447be3440084b2e3ee685da90bbb87fe2d3115f0160ca168262a730d4.hex`, sha256: 'b5d63295e30ad891835adfcb7b7b381c8905aab39d3f6b9916bcf34fbff4756c', bytes: 305251,
        built: null}
};

/**
 * micro:bit EMULATOR bases: Bluetooth-free CODAL V2 builds of pxt-microbit's
 * default package sets (scripts/build-makecode-emu-bases.mjs), for linking a
 * program the EMULATOR runs — the official hexcache carries Nordic's
 * SoftDevice, whose licence allows it to run only on a Nordic chip
 * (lib/bw-makecode/base-licences.js). Keyed by the same pxt sha as the official
 * base for that package set (the request is the same; the bytes are ours), and
 * served beside it under microbit/hexcache-emu/, never in hexcache/.
 *   sha     pxt's extinfo.sha for the V2 ('mbcodal') variant.
 *   sha256  of our build (gcc-arm-none-eabi 15:13.2.rel1-2, Ubuntu 24.04);
 *           byte-identical across three build directories (measured 2026-09-25).
 * NOT FETCHED: nothing hosts them. Built locally or by the makecode-arcade-bases
 * workflow's emu job into artifacts/makecode/emu-bases/; served only when the
 * bytes match. Absent, the emulator's compile is refused (NO_BASE_HEX) — the
 * official bases are never substituted.
 */
export const EMU_BASES_DIR = path.join(ROOT, 'artifacts', 'makecode', 'emu-bases');
export const MICROBIT_EMU_BASES = {
    'v2-radio': {sha: '137d8c972fe969dae4c15a314658e85c8910206d5f45c741c535ee616e3961a1',
        sha256: '93892ba327fc49240cdbad3cc3b53358765467fb1d06f47a98a32fb0242a910e', bytes: 398847},
    'v2-radio-microphone': {sha: '354b97da4696027afdaa3977420ec181bfc88a2faa2d2c0174842767718551e7',
        sha256: '9c5e1cc82148ebe4d825ce7134a61a81fe577a46b64eefb6dc8d3b798f683e53', bytes: 400242}
};

/**
 * The emulator bases that can be served: {rel -> bytes}. Only a local file whose
 * sha256 is the pin; anything else is refused by name. `strict` makes a missing
 * or refused base fatal (the workflow's --emu-bases).
 */
export function emuBases ({strict = false, dir = EMU_BASES_DIR, log = console.log} = {}) {
    const files = new Map();
    const missing = [];
    const refused = [];
    for (const [set, pin] of Object.entries(MICROBIT_EMU_BASES)) {
        const local = path.join(dir, `${pin.sha}.hex`);
        if (!fs.existsSync(local)) { missing.push(set); continue; }
        const b = fs.readFileSync(local);
        const got = sha256(b);
        if (got !== pin.sha256) { refused.push(`${set} (${local}: sha256 ${got}, pinned ${pin.sha256})`); continue; }
        files.set(`microbit/hexcache-emu/${pin.sha}.hex`, b);
    }
    if (refused.length) log(`[sync:makecode] REFUSED micro:bit emulator base(s) whose bytes are not pinned: ${refused.join('; ')}`);
    if (missing.length) {
        log(`[sync:makecode] micro:bit emulator bases not built: ${missing.join(', ')} — emulating those package sets is refused ` +
            '(NO_BASE_HEX); build them with `npm run build:makecode-emu-bases`');
    }
    if (files.size) log(`[sync:makecode] micro:bit emulator bases: ${files.size} served (Bluetooth-free, built from source)`);
    if (strict && (missing.length || refused.length)) throw new Error('--emu-bases: every pinned micro:bit emulator base must be present and match its pin');
    return files;
}

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
 * (measured). A target without that enum gets none here: the EV3 has no edge
 * pins, and the Circuit Playground's pins are objects whose ids come from the
 * program's config at run time, so the host page names those from the running
 * simulator's pxsim.CPlayPinName instead (test/makecode-pin-bridge.test.mjs).
 */
function pinNames (bundle) {
    const out = {};
    const texts = Object.values(bundle.bundledpkgs || {}).flatMap(files => Object.values(files)).map(String);
    const text = texts.find(t => /enum DigitalPin\s*\{/.test(t));
    if (!text) return out;                          // no such enum: no static names (see above)
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

/**
 * The Arcade bases that can be served: {rel -> bytes} for each pinned base. A
 * local file (artifacts/makecode/arcade-bases/<sha>.hex, our own build) is used
 * when it matches the pin's `built` sha256 — or the CDN one; otherwise the pin's
 * url is fetched and must match `sha256`. Bytes that match neither are REFUSED,
 * never served; a base that cannot be had (offline, fetch failed) is reported by
 * name and its native builds are refused (NO_BASE_HEX). `strict` makes either
 * one fatal, and `requireBuilt` accepts only our own build (the
 * makecode-arcade-bases workflow proves the from-source route with it).
 */
export async function arcadeBases ({offline, strict = false, requireBuilt = false, dir = ARCADE_BASES_DIR, log = console.log} = {}) {
    const files = new Map();
    const missing = [];
    const refused = [];
    const source = {};
    for (const [variant, pin] of Object.entries(ARCADE_BASES)) {
        if (requireBuilt && !pin.built) continue;
        const local = path.join(dir, `${pin.sha}.hex`);
        let bytes = null;
        if (fs.existsSync(local)) {
            const b = fs.readFileSync(local);
            const got = sha256(b);
            if ((pin.built && got === pin.built.sha256) || (!requireBuilt && got === pin.sha256)) { bytes = b; source[variant] = pin.built && got === pin.built.sha256 ? 'built' : 'cdn'; }
            else refused.push(`${variant} (local ${local}: sha256 ${got} is neither pinned build)`);
        }
        if (!bytes && !requireBuilt && !offline && pin.url) {
            try {
                const res = await fetch(pin.url);
                if (res.ok) {
                    const b = Buffer.from(await res.arrayBuffer());
                    const got = sha256(b);
                    if (got === pin.sha256) {
                        bytes = b;
                        source[variant] = 'cdn';
                        fs.mkdirSync(dir, {recursive: true});
                        if (!fs.existsSync(local)) fs.writeFileSync(local, b);
                    } else refused.push(`${variant} (${pin.url}: sha256 ${got}, pinned ${pin.sha256})`);
                }
            } catch { /* offline or refused: reported as missing below */ }
        }
        if (!bytes) { missing.push(variant); continue; }
        files.set(`arcade/hexcache/${pin.sha}.hex`, bytes);
    }
    if (refused.length) log(`[sync:makecode] REFUSED Arcade firmware base(s) whose bytes are not pinned: ${refused.join('; ')}`);
    if (missing.length) {
        log(`[sync:makecode] Arcade firmware bases not available for: ${missing.join(', ')} — native Arcade builds for ` +
            'those boards are refused (NO_BASE_HEX)');
    }
    if (files.size) log(`[sync:makecode] Arcade firmware bases: ${Object.entries(source).map(([v, s]) => `${v} (${s})`).join(', ')}`);
    if (strict && (missing.length || refused.length)) throw new Error('--strict-bases: every pinned Arcade base must be present and match its pin');
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
    const strict = process.argv.includes('--strict-bases') || process.argv.includes('--built-bases');
    for (const [rel, bytes] of await arcadeBases({offline: check, strict, requireBuilt: process.argv.includes('--built-bases')})) files.set(rel, bytes);
    for (const [rel, bytes] of emuBases({strict: process.argv.includes('--emu-bases')})) files.set(rel, bytes);
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
