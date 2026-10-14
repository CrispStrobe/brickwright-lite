#!/usr/bin/env node
/**
 * build:makecode-emu-bases — Bluetooth-free micro:bit V2 firmware bases, built
 * from source, for EMULATING MakeCode programs (lib/bw-makecode/pxt-runtime.js
 * compileMakeCodeForEmulator). The official bases stay the download path.
 *
 * WHY. pxt-microbit's precompiled bases (built/hexcache, served by the sync) are
 * Microsoft's cloud builds of CODAL WITH Bluetooth: the V2 image carries
 * Nordic's S113 SoftDevice at 0x1000-0x1B3FF, the MBR at 0-0xAFF and a
 * bootloader at 0x77000, under the nRF5 SDK licence ("4. This software ... must
 * only be used with a Nordic Semiconductor ASA integrated circuit. 5. Any
 * software provided in binary form under this license must not be reverse
 * engineered, decompiled, modified and/or disassembled."). An emulator runs —
 * and a debugger disassembles — whatever is in the image, on something that is
 * not a Nordic chip. So the emulator gets its own bases, in which none of that
 * code is present, and base-licences.js refuses the official ones by name.
 *
 * WHAT IS BUILT. For each package set in EMU_BASES, the build request the SERVED
 * pxt-microbit forms for its V2 variant ('mbcodal': codal-microbit-v2 via
 * microbit-v2-samples, the same repo and tag pxt uses), built the way
 * build-makecode-arcade-bases.mjs builds an Arcade base (its buildRequest, run,
 * gitCommits — no Docker, the host's arm-none-eabi-gcc), with THREE changes, all
 * recorded in the manifest:
 *   1. codal.json config DEVICE_BLE = 0. codal-microbit-v2's CMakeLists then
 *      links with ld/nrf52833.ld (application at 0, RAM from 0x20000000)
 *      instead of nrf52833-softdevice.ld (MBR 0, SD 0x1000, app 0x1C000,
 *      bootloader 0x77000) and does not define SOFTDEVICE_PRESENT. pxt's own
 *      request already sets MICROBIT_BLE_ENABLED 0 for a radio project; it is
 *      DEVICE_BLE that decides whether the SoftDevice is in the image.
 *   2. codal-microbit-v2/lib/{softdevice,mbr,bootloader,settings,uicr}.o —
 *      Nordic's binaries converted to objects, which CMake hands the linker
 *      whatever the config — are removed before the build (the target is
 *      cloned here, at the tag codal.json names, so the build finds it
 *      "already installed"). With DEVICE_BLE 0 the linker would discard all but
 *      .uicr (8 bytes: the bootloader address), but "not even offered to the
 *      linker" is the claim the gate can hold.
 *   3. The output is keyed by pxt's sha for the UNCHANGED request — the file
 *      name the compiler asks for — under a different directory
 *      (static/makecode/microbit/hexcache-emu/), never the official one.
 * Origin 0: the emulated nRF52833 boots from the vector table at 0 (there is no
 * MBR to forward from); CODAL without a SoftDevice is linked there already.
 *
 * THE GATE (scripts/makecode/firmware-licence-gate.mjs). The build FAILS, and
 * writes nothing, when the linker map shows any libcodal-microbit-nrf5sdk.a
 * member or any .softdevice/.mbr/.bootloader/.settings/.uicr section in the
 * image, any of Nordic's objects LOADed, or a byte attributed to no known
 * component; when the hex has a record outside application flash (UICR
 * included) or a vector table that cannot boot bare; or when any 256-byte chunk
 * of the removed Nordic binaries (read as data before removal — never executed
 * or disassembled) occurs in the image outside toolchain code (one does, inside
 * it: newlib's memcpy, which the bootloader links too — recorded in the
 * manifest). The per-component byte counts go in the manifest.
 *
 * V1 (nRF51822, microbit-dal) AND CALLIOPE mini 1/2 ARE NOT BUILT. Measured
 * 2026-09-25 against lancaster-university/microbit v2.2.0-rc6 (what pxt-microbit
 * 9.1.1 requests) and its locked deps: (a) the build is yotta (pxt runs it in
 * Docker, pext/yotta:gcc5); no yotta on the host, and a CMake port of it is a
 * port; (b) the DAL issues SoftDevice supervisor calls with Bluetooth disabled:
 * MicroBitThermometer::updateSample calls sd_softdevice_is_enabled()
 * unconditionally, and ble_running() — reached from MicroBitRadio, MicroBitFlash
 * and the random seed — does so whenever MICROBIT_BLE_PAIRING_MODE is set, which
 * pxt's config.json sets (pairing_mode 1). With no SoftDevice the SVC lands in
 * the application's default handler: a hang. Removing that needs a DAL change or
 * an SVC stub standing in for the SoftDevice, not a build switch. The source
 * dependencies themselves are clean: nrf51-sdk v2.2.0+mb4, 121 of 121 C/H files
 * under Nordic's BSD-3 (no chip clause).
 *
 * Usage:
 *   npm run build:makecode-emu-bases                        # every EMU_BASES entry
 *   node scripts/build-makecode-emu-bases.mjs --set v2-radio-microphone
 *   node scripts/build-makecode-emu-bases.mjs --plan        # shas only
 *   node scripts/build-makecode-emu-bases.mjs --work /tmp/w --out /tmp/o
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {buildRequest, run, gitCommits, BUILD_ENV} from './build-makecode-arcade-bases.mjs';
import {auditMap, hexAudit, hexToFlat, chunksFound, classifyMatches} from './makecode/firmware-licence-gate.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const MICROBIT_STATIC = path.join(ROOT, 'packages', 'scratch-gui', 'static', 'makecode', 'microbit');
export const EMU_BASES_DIR = path.join(ROOT, 'artifacts', 'makecode', 'emu-bases');

/** The Nordic binaries codal-microbit-v2 converts to objects (lib/README.md there). */
export const NORDIC_OBJECTS = Object.freeze(['softdevice.o', 'mbr.o', 'bootloader.o', 'settings.o', 'uicr.o']);

/** The config the emulator build changes, over pxt's codal.json. */
export const EMU_CONFIG = Object.freeze({DEVICE_BLE: 0});

/**
 * The micro:bit package sets the emulator is given a base for (V2 only).
 * {core, radio, microphone} is MakeCode's new-project set. {core, radio} is what
 * a current project without the microphone asks for — pxt-microbit ships NO
 * official base for it (its V1/V2 shas f7b3cfda…/137d8c97… are not in
 * hexcache: such a project's download is NO_BASE_HEX today). A {core, radio}
 * pxt.json WITHOUT targetVersions is upgraded by pxt-microbit's patch
 * "0.0.0 - 3.0.18": {missingPackage: {'.*': 'microphone'}} and asks for the
 * microphone set instead (measured).
 */
export const EMU_BASES = Object.freeze({
    'v2-radio': {dependencies: {core: '*', radio: '*'}},
    'v2-radio-microphone': {dependencies: {core: '*', radio: '*', microphone: '*'}}
});

const sha256 = b => crypto.createHash('sha256').update(b).digest('hex');

/** The project a base is keyed on: an empty program with `dependencies`. */
export function projectFor (dependencies) {
    return {
        'pxt.json': JSON.stringify({name: 'emu-base', dependencies, files: ['main.ts'], binaryonly: true}),
        'main.ts': ''
    };
}

/** pxt's V2 build request for a package set, from the served pxt-microbit. */
export function emuRequest (set, {staticDir = MICROBIT_STATIC} = {}) {
    const spec = EMU_BASES[set];
    if (!spec) throw new Error(`${set}: not an emulator base (${Object.keys(EMU_BASES).join(', ')})`);
    return buildRequest('', {staticDir, files: projectFor(spec.dependencies), appVariant: 'mbcodal'});
}

/** Build one base; throws (writing nothing) when the licence gate fails. */
export async function buildEmuBase (set, {work, out}) {
    const t0 = Date.now();
    const {sha, request, compileService: cs} = await emuRequest(set);
    if ((cs.buildEngine || 'codal') !== 'codal') throw new Error(`${set}: build engine ${cs.buildEngine} is not codal`);
    const codalJson = JSON.parse(request.replaceFiles['/codal.json']);
    const repo = codalJson.pxt_gitrepo;
    const tag = codalJson.pxt_gittag;
    const target = codalJson.target;
    if (tag !== request.tag) throw new Error(`${set}: codal.json tag ${tag} != request tag ${request.tag}`);
    const dir = path.join(work, set);
    fs.rmSync(dir, {recursive: true, force: true});
    run('git', ['clone', '--quiet', '--branch', tag, '--depth', '1', `https://github.com/${repo}`, dir]);
    for (const [f, text] of Object.entries(request.replaceFiles)) {
        const p = path.join(dir, f);
        fs.mkdirSync(path.dirname(p), {recursive: true});
        fs.writeFileSync(p, text);
    }
    // 1. DEVICE_BLE 0: the no-SoftDevice linker script, no SOFTDEVICE_PRESENT.
    codalJson.config = {...codalJson.config, ...EMU_CONFIG};
    fs.writeFileSync(path.join(dir, 'codal.json'), JSON.stringify(codalJson, null, 4));
    // 2. The target, cloned at its tag, minus Nordic's binaries.
    const tdir = path.join(dir, 'libraries', target.name);
    run('git', ['clone', '--quiet', '--branch', target.branch, '--depth', '1', target.url, tdir]);
    const removed = {};
    const blobs = [];
    for (const o of NORDIC_OBJECTS) {
        const p = path.join(tdir, 'lib', o);
        if (!fs.existsSync(p)) continue;
        const bytes = fs.readFileSync(p);
        removed[`lib/${o}`] = sha256(bytes);
        blobs.push({name: o, bytes});
        fs.rmSync(p);
    }
    const left = fs.readdirSync(path.join(tdir, 'lib')).filter(f => /\.(o|a)$/.test(f));
    if (left.length) throw new Error(`${set}: ${target.name}/lib still holds ${left.join(', ')} — a new Nordic object this build does not know`);
    console.log(`[emu-bases] ${set}: sha ${sha} — ${repo}@${tag}, ${target.name}@${target.branch}, DEVICE_BLE 0, removed ${Object.keys(removed).join(' ')}`);
    const flags = `${BUILD_ENV.CFLAGS} -ffile-prefix-map=${dir}=.`;
    const b = spawnSync('python3', ['build.py'], {cwd: dir, encoding: 'utf8', maxBuffer: 1 << 28, env: {...process.env, CFLAGS: flags, CXXFLAGS: flags}});
    const log = `${b.stdout || ''}\n${b.stderr || ''}`;
    fs.writeFileSync(path.join(work, `${set}.build.log`), log);
    if (b.status !== 0) throw new Error(`${set}: python3 build.py exit ${b.status}\n${log.slice(-3000)}`);
    // CMake's message() goes to stderr: both streams are searched.
    if (!/Building WITHOUT softdevice support/.test(log)) throw new Error(`${set}: CMake did not select the no-SoftDevice build`);
    const hexFile = path.join(dir, 'build', `${cs.codalBinary}.hex`);
    const mapFile = path.join(dir, 'build', `${cs.codalBinary}.map`);
    for (const f of [hexFile, mapFile]) if (!fs.existsSync(f)) throw new Error(`${set}: the build produced no ${path.basename(f)}`);
    const hex = fs.readFileSync(hexFile);
    // THE GATE.
    const mapText = fs.readFileSync(mapFile, 'utf8');
    const map = auditMap(mapText);
    const img = hexAudit(hex.toString('utf8'));
    const flat = hexToFlat(hex.toString('utf8'));
    const bytewise = {};
    const violations = [...map.violations, ...img.violations];
    for (const {name, bytes} of blobs) {
        const r = chunksFound(bytes, flat);
        const c = classifyMatches(name, r.matches, mapText);
        bytewise[name] = {chunks: r.chunks, found: r.matches.length, sharedToolchainCode: c.toolchain};
        violations.push(...c.violations);
    }
    if (violations.length) throw new Error(`${set}: LICENCE GATE FAILED — nothing written:\n  ${violations.join('\n  ')}`);
    fs.mkdirSync(out, {recursive: true});
    fs.writeFileSync(path.join(out, `${sha}.hex`), hex);
    const gcc = run('arm-none-eabi-gcc', ['--version'], {quiet: true}).split('\n')[0];
    return {
        set, sha, file: `${sha}.hex`, sha256: sha256(hex), bytes: hex.length,
        dependencies: EMU_BASES[set].dependencies, appVariant: 'mbcodal', serviceId: request.config,
        core: {repo, tag}, target, config: EMU_CONFIG, removed,
        licence: {
            classification: 'clean',
            image: {start: `0x${img.ranges[0].start.toString(16)}`, end: `0x${img.imageEnd.toString(16)}`,
                sp: `0x${img.sp.toString(16)}`, reset: `0x${img.reset.toString(16)}`},
            imageBytes: map.image, allocatedBytes: map.bytes, inputFiles: map.members, nordicChunksFound: bytewise
        },
        commits: gitCommits(dir), toolchain: gcc, seconds: Math.round((Date.now() - t0) / 1000)
    };
}

async function main () {
    const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
    const sets = arg('--set', Object.keys(EMU_BASES).join(',')).split(',');
    const work = path.resolve(arg('--work', path.join(ROOT, 'artifacts', 'makecode', 'codal-work-emu')));
    const out = path.resolve(arg('--out', EMU_BASES_DIR));
    if (!fs.existsSync(path.join(MICROBIT_STATIC, 'pxtworker.js'))) throw new Error('the micro:bit runtime is not synced — run `npm run sync:makecode` first');
    if (process.argv.includes('--plan')) {
        for (const s of sets) {
            const {sha, request} = await emuRequest(s);
            console.log(s, sha, request.config, request.tag, Object.keys(request.replaceFiles).length, 'files');
        }
        return;
    }
    const manifestFile = path.join(out, 'manifest.json');
    const manifest = fs.existsSync(manifestFile) ? JSON.parse(fs.readFileSync(manifestFile, 'utf8')) : {};
    for (const s of sets) {
        const entry = await buildEmuBase(s, {work, out});
        manifest[s] = entry;
        fs.mkdirSync(out, {recursive: true});
        fs.writeFileSync(manifestFile, JSON.stringify(manifest, null, 2) + '\n');
        console.log(`[emu-bases] ${s}: ${entry.file} ${entry.bytes} bytes sha256 ${entry.sha256} in ${entry.seconds}s`);
        console.log(`[emu-bases] ${s}: image bytes by component ${JSON.stringify(entry.licence.imageBytes)}`);
    }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    main().catch(e => { console.error(`[emu-bases] ${e.message}`); process.exit(1); });
}
