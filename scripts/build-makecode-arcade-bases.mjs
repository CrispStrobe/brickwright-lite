#!/usr/bin/env node
/**
 * build:makecode-bases — build MakeCode ARCADE's precompiled firmware bases
 * ourselves, from the open-source C++ runtime, so a native Arcade build links
 * offline (lib/bw-makecode/pxt-runtime.js refuses it by name, NO_BASE_HEX,
 * until a base for the project's sha is served).
 *
 * WHAT A "BASE" IS. pxt links a MakeCode program onto a precompiled C++ runtime
 * image: the CODAL device runtime + pxt-common-packages' C++ (core---rp2040,
 * screen---st7735, mixer---…, game…) for ONE hardware variant. pxt names that
 * image by `extinfo.sha` = sha256 of the exact build request it would send to
 * MakeCode's cloud compiler — {config: serviceId, tag: codal gittag,
 * replaceFiles: every generated + package C++ file} (pxtlib getExtensionInfo).
 * pxt-microbit ships those images as built/hexcache/<sha>.hex; pxt-arcade ships
 * none. MakeCode's CDN has its cloud build of each (cdn.makecode.com/compile/
 * <sha>.hex — GET only: HEAD answers 404, which once read as "absent"), and the
 * sync fetches those by default; THIS script is the route with no Microsoft
 * service in it, and the makecode-arcade-bases workflow keeps it reproducible.
 *
 * WHAT THIS DOES, per hardware variant (hw---<variant>):
 *   1. asks the SERVED pxt runtime (static/makecode/arcade: target.json +
 *      pxtworker.js — the compiler the app runs) for the build request of the
 *      default project {device} with that variant, keeping the C++ files
 *      (`compile.keepCppFiles`, which pxt otherwise strips — why
 *      `extinfo.compileData` came back empty in the app);
 *   2. re-derives sha256(request) and refuses if it is not pxt's `extinfo.sha`
 *      (so the file name IS what the glue will ask for);
 *   3. does what pxt's own `codal` build engine does (pxt-core
 *      built/buildengine.js: prepCodalBuildDirAsync + buildAsync), minus Docker:
 *      clone github.com/<githubCorePackage> at the variant's `gittag`, write
 *      the request's files over it, run `python3 build.py` — which clones the
 *      codal target at the tag codal.json names and its libraries at the
 *      commits that target's target-locked.json pins;
 *   4. copies build/<codalBinary>.hex (what pxt's patchCodalHexInfo reads) to
 *      <out>/<sha>.hex and records a manifest: sha256 of the hex, every git
 *      commit that went in, the compiler version, the wall time.
 *
 * TOOLCHAIN. pxt runs step 3 in Docker (`pext/yotta:latest`, `pext/arm:gcc9`
 * for rp2040). PXT_NODOCKER is honoured by pxt for exactly this case; here the
 * host's arm-none-eabi-gcc + cmake + python3 + git are used directly (Ubuntu
 * 24.04: `apt-get install gcc-arm-none-eabi libnewlib-arm-none-eabi cmake`).
 * Measured 2026-09-25 on gcc 13.2.1: hw---rp2040 builds in ~1m45s.
 *
 * NOTHING HERE IS COMMITTED OR SERVED. Output goes to artifacts/ (gitignored);
 * sync-makecode-runtime.mjs serves a base only when its sha256 is pinned there
 * (ARCADE_BASES[v].built), and `--built-bases` serves only these.
 *
 * Usage:
 *   npm run build:makecode-bases                                    # rp2040
 *   node scripts/build-makecode-arcade-bases.mjs --variant rp2040,samd51
 *   node scripts/build-makecode-arcade-bases.mjs --work /tmp/codal --out artifacts/makecode/arcade-bases
 *   node scripts/build-makecode-arcade-bases.mjs --variant rp2040 --plan   # sha + request only, no build
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import util from 'node:util';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const ARCADE_STATIC = path.join(ROOT, 'packages', 'scratch-gui', 'static', 'makecode', 'arcade');
export const DEFAULT_OUT = path.join(ROOT, 'artifacts', 'makecode', 'arcade-bases');

/**
 * The hardware variants whose base is a CODAL build (pxt's `codal` engine).
 * hw---rpi (dockermake, Linux) and hw---vm (dockercross) use other engines and
 * are not built here.
 */
export const CODAL_VARIANTS = Object.freeze(['rp2040', 'samd51', 'samd51adafruit', 'stm32f401', 'n3', 'gdk', 'n4']);

/**
 * Seeded into CMake's CMAKE_C/CXX_FLAGS (codal APPENDS its own). gcc >= 12's
 * variable-location views break gas on codal-core's Timer.cpp ("leb128 operand
 * is an undefined symbol: .LVU22", measured on gcc 13.2.1 for samd51 and
 * stm32f401; pxt's docker images carry gcc 9, which predates the views). The
 * flag only changes DWARF, never code: the rp2040 image is byte-identical with
 * and without it (measured).
 */
export const BUILD_ENV = Object.freeze({CFLAGS: '-gno-variable-location-views', CXXFLAGS: '-gno-variable-location-views'});

const sha256 = s => crypto.createHash('sha256').update(s).digest('hex');

/** The program every base is keyed on: MakeCode Arcade's default package set. */
export const DEFAULT_PROJECT = Object.freeze({
    'pxt.json': JSON.stringify({name: 'arcade-base', dependencies: {device: '*'}, files: ['main.ts'], binaryonly: true}),
    'main.ts': ''
});

/**
 * pxt's C++ build request for `variant`, from the served runtime.
 * @returns {Promise<{sha: string, request: {config: string, tag: string, replaceFiles: Object<string,string>}, compileService: object}>}
 */
export async function buildRequest (variant, {staticDir = ARCADE_STATIC, files = DEFAULT_PROJECT} = {}) {
    const bundle = JSON.parse(fs.readFileSync(path.join(staticDir, 'target.json'), 'utf8'));
    bundle.compile.keepCppFiles = true;
    const quiet = () => {};
    const sb = {
        setTimeout, clearTimeout, setInterval, clearInterval, setImmediate, clearImmediate,
        TextEncoder: util.TextEncoder, TextDecoder: util.TextDecoder, Buffer,
        console: {log: quiet, debug: quiet, info: quiet, warn: quiet, error: quiet},
        pxtTargetBundle: bundle
    };
    sb.global = sb;
    sb.self = sb;
    sb.eval = src => vm.runInContext(src, sb, {filename: 'eval'});
    vm.createContext(sb);
    vm.runInContext(fs.readFileSync(path.join(staticDir, 'pxtworker.js'), 'utf8'), sb, {filename: 'pxtworker.js'});
    sb.__variant = variant;
    sb.__files = files;
    const json = await vm.runInContext(`(async () => {
        pxt.setupSimpleCompile({
            cacheGet: () => Promise.resolve(null), cacheSet: () => Promise.resolve(),
            httpRequestAsync: o => Promise.reject(new Error('offline: ' + (o && o.url))),
            pkgOverrideAsync: () => Promise.resolve(null)
        });
        pxt.packagesConfigAsync = () => Promise.resolve({});
        pxt.setupWebConfig({cdnUrl: 'https://offline.invalid'});
        pxt.setHwVariant(__variant);
        const copts = await pxt.simpleGetCompileOptionsAsync(__files, {native: true});
        return JSON.stringify(copts.extinfo);
    })()`, sb);
    const extinfo = JSON.parse(json);
    // The variant's compile service: target.json's base one, overlaid by
    // variants[<compileServiceVariant of hw---<variant>>] — what pxt applies.
    const hw = JSON.parse(bundle.bundledpkgs[`hw---${variant}`]['pxt.json']);
    const compileService = {...bundle.compileService, ...((bundle.variants[hw.compileServiceVariant] || {}).compileService || {})};
    if (!extinfo || !extinfo.compileData) throw new Error(`${variant}: pxt formed no C++ build request`);
    const data = Buffer.from(extinfo.compileData, 'base64').toString('utf8');
    // The request must hash to pxt's own sha, or the file we produce is keyed wrong.
    if (sha256(data) !== extinfo.sha) throw new Error(`${variant}: sha256(request) ${sha256(data)} is not pxt's extinfo.sha ${extinfo.sha}`);
    return {sha: extinfo.sha, request: JSON.parse(data), compileService};
}

function run (cmd, args, opts = {}) {
    const r = spawnSync(cmd, args, {stdio: opts.quiet ? 'pipe' : 'inherit', encoding: 'utf8', maxBuffer: 1 << 28, ...opts});
    if (r.status !== 0) throw new Error(`${cmd} ${args.join(' ')} (in ${opts.cwd || '.'}): exit ${r.status}${r.stderr ? '\n' + r.stderr.slice(-2000) : ''}`);
    return (r.stdout || '').trim();
}

/** Every git checkout under dir (the build root, the codal target, its libraries, their submodules). */
function gitCommits (dir) {
    const out = {};
    const walk = (d, depth) => {
        if (depth > 4 || !fs.existsSync(d)) return;
        if (fs.existsSync(path.join(d, '.git'))) {
            let url = '';
            try { url = run('git', ['-C', d, 'config', '--get', 'remote.origin.url'], {quiet: true}); } catch { /* submodule without origin */ }
            out[path.relative(dir, d) || '.'] = {commit: run('git', ['-C', d, 'rev-parse', 'HEAD'], {quiet: true}), url};
        }
        for (const e of fs.readdirSync(d, {withFileTypes: true})) {
            if (e.isDirectory() && !e.name.startsWith('.') && e.name !== 'build' && e.name !== 'pxtapp') walk(path.join(d, e.name), depth + 1);
        }
    };
    walk(dir, 0);
    return out;
}

/** Build one variant's base. Returns its manifest entry. */
export async function buildBase (variant, {work, out}) {
    const t0 = Date.now();
    const {sha, request, compileService} = await buildRequest(variant);
    const cs = compileService;
    if ((cs.buildEngine || 'codal') !== 'codal') throw new Error(`${variant}: build engine ${cs.buildEngine} is not codal`);
    const codalJson = JSON.parse(request.replaceFiles['/codal.json']);
    const repo = codalJson.pxt_gitrepo;
    const tag = codalJson.pxt_gittag;
    if (tag !== request.tag) throw new Error(`${variant}: codal.json tag ${tag} != request tag ${request.tag}`);
    const dir = path.join(work, variant);
    if (!fs.existsSync(path.join(dir, '.git'))) {
        fs.rmSync(dir, {recursive: true, force: true});
        run('git', ['clone', '--quiet', '--branch', tag, '--depth', '1', `https://github.com/${repo}`, dir]);
    }
    // Stale generated files from a previous request would be compiled in.
    fs.rmSync(path.join(dir, 'pxtapp'), {recursive: true, force: true});
    fs.rmSync(path.join(dir, 'build'), {recursive: true, force: true});
    for (const [f, text] of Object.entries(request.replaceFiles)) {
        const p = path.join(dir, f);
        fs.mkdirSync(path.dirname(p), {recursive: true});
        fs.writeFileSync(p, text);
    }
    console.log(`[bases] ${variant}: sha ${sha} — ${repo}@${tag}, target ${codalJson.target.name}@${codalJson.target.branch}`);
    // BUILD_ENV: flags the image bytes must NOT depend on (see its comment), plus
    // the build directory mapped away: STM32Cube's assert_param() compiles
    // __FILE__ into the stm32f401 image, so its bytes named the directory the
    // build ran in (measured: work2/ vs work3/, 10 bytes, three different
    // sha256s from three directories). Mapped, any directory builds the pinned bytes.
    const flags = `${BUILD_ENV.CFLAGS} -ffile-prefix-map=${dir}=.`;
    run('python3', ['build.py'], {cwd: dir, env: {...process.env, CFLAGS: flags, CXXFLAGS: flags}});
    const hexFile = path.join(dir, 'build', `${cs.codalBinary}.hex`);
    if (!fs.existsSync(hexFile)) throw new Error(`${variant}: the build produced no ${cs.codalBinary}.hex`);
    const hex = fs.readFileSync(hexFile);
    fs.mkdirSync(out, {recursive: true});
    fs.writeFileSync(path.join(out, `${sha}.hex`), hex);
    const gcc = run('arm-none-eabi-gcc', ['--version'], {quiet: true}).split('\n')[0];
    return {
        variant, sha, file: `${sha}.hex`, sha256: sha256(hex), bytes: hex.length,
        serviceId: request.config, codalBinary: cs.codalBinary,
        core: {repo, tag}, target: codalJson.target,
        commits: gitCommits(dir), toolchain: gcc, seconds: Math.round((Date.now() - t0) / 1000)
    };
}

async function main () {
    const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
    const variants = arg('--variant', 'rp2040').split(',');
    const work = path.resolve(arg('--work', path.join(ROOT, 'artifacts', 'makecode', 'codal-work')));
    const out = path.resolve(arg('--out', DEFAULT_OUT));
    if (!fs.existsSync(path.join(ARCADE_STATIC, 'pxtworker.js'))) throw new Error('the Arcade runtime is not synced — run `npm run sync:makecode` first');
    for (const v of variants) if (!CODAL_VARIANTS.includes(v)) throw new Error(`${v}: not a CODAL variant (${CODAL_VARIANTS.join(', ')})`);
    if (process.argv.includes('--plan')) {
        for (const v of variants) {
            const {sha, request} = await buildRequest(v);
            console.log(v, sha, request.config, request.tag, Object.keys(request.replaceFiles).length, 'files');
        }
        return;
    }
    const manifestFile = path.join(out, 'manifest.json');
    const manifest = fs.existsSync(manifestFile) ? JSON.parse(fs.readFileSync(manifestFile, 'utf8')) : {};
    for (const v of variants) {
        const entry = await buildBase(v, {work, out});
        manifest[v] = entry;
        fs.writeFileSync(manifestFile, JSON.stringify(manifest, null, 2) + '\n');
        console.log(`[bases] ${v}: ${entry.file} ${entry.bytes} bytes sha256 ${entry.sha256} in ${entry.seconds}s`);
    }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    main().catch(e => { console.error(`[bases] ${e.message}`); process.exit(1); });
}
