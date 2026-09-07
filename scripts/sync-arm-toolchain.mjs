/**
 * The ARM GNU embedded toolchain, fetched by exact versioned URL and pinned by
 * sha256 — the compiler that turns generateC's Pico output into a Cortex-M0+
 * image the rp2040js oracle runs (plan N11 Door 1 / N11a).
 *
 * SAME DISCIPLINE AS THE MICROPYTHON UF2 (scripts/probe-pico-micropython.mjs)
 * AND sync-labwired-wasm: a 171 MB binary in git to serve one CI job is a bad
 * trade, so it is fetched and NEVER committed (it lands in gitignored
 * artifacts/). The URL path names a version (arm-gnu-toolchain-13.2.rel1),
 * effectively immutable by ARM's convention — but the sha256, NOT the URL, is
 * what decides what runs: the download is verified byte-for-byte against
 * ARM_TOOLCHAIN.sha256 BEFORE it is extracted, and a mismatch refuses to unpack.
 * The sha256 was computed from the bytes of a real download, not copied from a
 * page. The pinned version MATCHES the box's own arm-none-eabi-gcc (Ubuntu's
 * 15:13.2.rel1-2 / "13.2.1 20231009"), so the release measured with is the
 * release pinned; after extraction the toolchain's own --version is asserted to
 * contain VERSION_STRING, so a drift between the pin and this record fails loud.
 *
 * LOCALLY nothing is fetched: the box already has arm-none-eabi-gcc, so
 * armGccPath() returns it. The fetch path runs only in CI, where the toolchain is
 * absent — the caller (the differential) SKIPS BY NAME when neither the box gcc
 * nor a fetched one is present, so a missing toolchain is a loud skip, never a
 * silent pass. This is declared content-pinned in test/fetch-pinning.test.mjs.
 */
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {createWriteStream, createReadStream, existsSync, mkdirSync, rmSync, readdirSync} from 'node:fs';
import {Readable} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const ARM_TOOLCHAIN = {
    version: '13.2.rel1',
    // Asserted to be a substring of the extracted gcc's `--version` output.
    versionString: '13.2.1 20231009',
    url: 'https://developer.arm.com/-/media/Files/downloads/gnu/13.2.rel1/binrel/arm-gnu-toolchain-13.2.rel1-x86_64-arm-none-eabi.tar.xz',
    // sha256 computed from the downloaded bytes (179,347,712 B), not from a page.
    sha256: '6cd1bbc1d9ae57312bcd169ae283153a9572bd6a8e4eeae2fedfbc33b115fdbb',
    // The single directory the tarball unpacks to (note the capital R).
    dir: 'arm-gnu-toolchain-13.2.Rel1-x86_64-arm-none-eabi',
};

export const CACHE_DIR = path.join(ROOT, 'artifacts', 'arm-toolchain');
const TARBALL = path.join(CACHE_DIR, 'arm-gnu-toolchain-13.2.rel1.tar.xz');
const GCC_NAME = 'arm-none-eabi-gcc';

/** arm-none-eabi-gcc inside the extracted pinned toolchain, or '' if not there. */
export function cachedGccPath () {
    const p = path.join(CACHE_DIR, ARM_TOOLCHAIN.dir, 'bin', GCC_NAME);
    return existsSync(p) ? p : '';
}

/** The box's own arm-none-eabi-gcc from PATH, or '' if it is not installed. */
export function boxGccPath () {
    try {
        return execFileSync('command', ['-v', GCC_NAME], {shell: '/bin/bash', encoding: 'utf8'}).trim();
    } catch {
        return '';
    }
}

/**
 * A usable arm-none-eabi-gcc WITHOUT fetching anything: the box's if installed,
 * else the pinned toolchain if it has already been extracted, else ''. The
 * differential uses this and skips by name on ''.
 */
export function armGccPath () {
    return boxGccPath() || cachedGccPath();
}

const sha256Stream = async (file) => {
    const hash = createHash('sha256');
    await pipeline(createReadStream(file), hash);
    return hash.digest('hex');
};

/** Assert the toolchain at `gcc` reports the pinned version. */
function assertVersion (gcc) {
    const out = execFileSync(gcc, ['--version'], {encoding: 'utf8'});
    if (!out.includes(ARM_TOOLCHAIN.versionString)) {
        throw new Error(`${gcc} --version does not contain ${JSON.stringify(ARM_TOOLCHAIN.versionString)} `
            + `— the pin and this record have drifted:\n${out.split('\n')[0]}`);
    }
    return out.split('\n')[0];
}

/**
 * Ensure the sha-pinned toolchain is available and return its gcc path.
 * Fetches + verifies + extracts only if it is not already extracted. Meant for
 * the CI step; locally armGccPath() finds the box gcc and this is never reached.
 * @param {{quiet?: boolean, offline?: boolean}} [opts]
 */
export async function ensureArmToolchain (opts = {}) {
    const log = (m) => { if (!opts.quiet) console.log(m); };
    const cached = cachedGccPath();
    if (cached) { log(`arm toolchain present (${assertVersion(cached)})`); return cached; }
    if (opts.offline) throw new Error(`${CACHE_DIR} has no extracted toolchain and offline was given`);

    mkdirSync(CACHE_DIR, {recursive: true});
    log(`fetching ${ARM_TOOLCHAIN.url}`);
    const res = await fetch(ARM_TOOLCHAIN.url);
    if (!res.ok) throw new Error(`fetch failed: HTTP ${res.status} ${res.statusText}`);
    await pipeline(Readable.fromWeb(res.body), createWriteStream(TARBALL));

    const got = await sha256Stream(TARBALL);
    if (got !== ARM_TOOLCHAIN.sha256) {
        rmSync(TARBALL, {force: true});
        throw new Error(`downloaded sha256 ${got}, expected ${ARM_TOOLCHAIN.sha256} — refusing to extract`);
    }
    log(`sha256 verified (${ARM_TOOLCHAIN.sha256}); extracting`);
    // -J = xz; the tarball holds one top-level dir (ARM_TOOLCHAIN.dir).
    execFileSync('tar', ['-xJf', TARBALL, '-C', CACHE_DIR]);
    rmSync(TARBALL, {force: true});   // the extracted tree is what we keep

    const gcc = cachedGccPath();
    if (!gcc) throw new Error(`extraction did not yield ${ARM_TOOLCHAIN.dir}/bin/${GCC_NAME} `
        + `— tarball contents: ${readdirSync(CACHE_DIR).join(', ')}`);
    log(`arm toolchain ready (${assertVersion(gcc)})`);
    return gcc;
}

// CLI: fetch/verify/extract if needed, print the bin dir (for GITHUB_PATH).
if (process.argv[1] === fileURLToPath(import.meta.url)) {
    const offline = process.argv.includes('--offline');
    const box = boxGccPath();
    if (box) {
        console.log(`using the box arm-none-eabi-gcc: ${box}`);
        console.log(`BIN_DIR=${path.dirname(box)}`);
    } else {
        const gcc = await ensureArmToolchain({offline});
        console.log(`BIN_DIR=${path.dirname(gcc)}`);
    }
}
