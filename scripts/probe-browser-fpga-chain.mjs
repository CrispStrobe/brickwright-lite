#!/usr/bin/env node
/**
 * A developer instrument, NOT a CI gate: run the WHOLE Gowin flow — Yosys,
 * nextpnr, and Apicula's packer — inside a real browser, and report the
 * bitstream, so "TN6b is possible" is a measurement rather than an argument.
 *
 * WHY IT EXISTS. docs/TANG-NANO.md §8c said there was no path from a GPL core
 * to silicon through this app. §8d closed half of that: the packer runs, under
 * Pyodide, byte-identical to native. This closes the other half — nextpnr, the
 * 183 MB stage nobody had tried — and the two together make the chain real.
 *
 * WHAT IT MEASURES, and why each number is here rather than in prose:
 *
 *   Whether each stage RUNS in a browser at all. Node 20 cannot: Yosys fails
 *   with `invalid value type 'noexternref', enable with --experimental-wasm-gc`,
 *   which is lib/bw-fpga/wasm-capabilities.js's refusal arriving from the engine
 *   instead of from our probe. Chromium 151 runs it.
 *
 *   What it actually DOWNLOADS. The npm packages fetch their resources on first
 *   run, and nextpnr fetches ALL FOUR chipdb tarballs regardless of the target
 *   family. That is where the 183 MB lives — the wasm itself is 2.5 MB — so it
 *   is the lever anyone shrinking this will reach for, and it should be a
 *   measured number when they do.
 *
 *   Whether the result is the SAME bitstream. Two toolchains that both produce
 *   a bitstream and disagree about which one give bug reports nobody can
 *   reproduce. The packer's own gate makes this argument; the chain owes it too.
 *
 * WHAT IT DOES NOT DO. It does not assert, and there is deliberately no gate
 * behind it. ~280 MB per run buys a re-proof of an EXISTENCE claim, and
 * existence does not regress the way behaviour does. test/fpga-pyodide-packer
 * gates the packer because that is 20 MB and it is the half that can silently
 * break — an upstream Apicula release can change a bitstream; a browser cannot
 * stop having WebAssembly.
 *
 * NOTE THE VERSION SKEW, it is the interesting part of the result. The npm
 * nextpnr and the PyPI one are different builds, and their `--write` JSON
 * differs by a few bytes. The BITSTREAM does not. The differential holds where
 * it matters and not where it doesn't, which is the outcome you want and not
 * the one you would predict from hashing the intermediate.
 *
 * Usage:
 *   node scripts/probe-browser-fpga-chain.mjs            # needs --install once
 *   node scripts/probe-browser-fpga-chain.mjs --install  # ~260 MB into artifacts/
 *   node scripts/probe-browser-fpga-chain.mjs --keep     # leave the workdir
 */

import {createHash} from 'node:crypto';
import {createServer} from 'node:http';
import {execFileSync} from 'node:child_process';
import {existsSync, mkdirSync, readFileSync, writeFileSync, rmSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

import {DESIGNS, FIXTURES, FAMILY, packWithPyodide, PYODIDE_ENTRY, INSTALL_HINT}
    from './probe-pyodide-packer.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const YOWASP_DIR = path.join(ROOT, 'artifacts', 'yowasp');
const DEVICE = 'GW2AR-LV18QN88C8/I7';

const PKGS = ['@yowasp/yosys', '@yowasp/nextpnr-himbaechel-gowin'];

function installYowasp () {
    mkdirSync(YOWASP_DIR, {recursive: true});
    // Same trap as the pyodide probe: with no manifest npm walks UP and
    // installs 260 MB into this repo's own tree, silently.
    writeFileSync(path.join(YOWASP_DIR, 'package.json'),
        JSON.stringify({name: 'bw-yowasp-probe', private: true, version: '0.0.0'}, null, 2));
    execFileSync('npm', ['install', '--no-save', '--silent', ...PKGS],
        {cwd: YOWASP_DIR, stdio: 'inherit'});
}

/** Serve one directory over http, because a module graph cannot load from file://. */
function serve (dir) {
    const types = {'.js': 'text/javascript', '.mjs': 'text/javascript',
        '.html': 'text/html', '.json': 'application/json', '.wasm': 'application/wasm',
        '.tar': 'application/x-tar', '.v': 'text/plain', '.cst': 'text/plain'};
    const server = createServer((req, res) => {
        const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '');
        const file = path.join(dir, rel);
        // Serving a whole node_modules means a path escape is worth refusing
        // rather than assuming the URL is well-meant.
        if (!file.startsWith(dir) || !existsSync(file)) { res.writeHead(404); return res.end(); }
        res.writeHead(200, {'content-type': types[path.extname(file)] || 'application/octet-stream'});
        res.end(readFileSync(file));
    });
    return new Promise(resolve => server.listen(0, '127.0.0.1',
        () => resolve({server, port: server.address().port})));
}

const PAGE = `<!doctype html><meta charset="utf-8"><title>chain</title>
<script type="module">
const fetched = {};
const prog = name => e => { fetched[name] = e.totalLength; };
window.RESULT = null;
try {
    const v   = await (await fetch('/design.v')).text();
    const cst = await (await fetch('/design.cst')).text();
    const t = {};

    const {runYosys} = await import('/node_modules/@yowasp/yosys/gen/bundle.js');
    let t0 = performance.now();
    const y = await runYosys(['-q', '-p',
        'read_verilog design.v; synth_gowin -top TOPNAME -json design.json'],
        {'design.v': v}, {stdout: null, stderr: null, fetchProgress: prog('yosys')});
    t.yosysMs = performance.now() - t0;

    const {runNextpnrHimbaechelGowin} =
        await import('/node_modules/@yowasp/nextpnr-himbaechel-gowin/gen/bundle.js');
    t0 = performance.now();
    const n = await runNextpnrHimbaechelGowin(
        ['--json', 'design.json', '--write', 'out.json', '--device', 'DEVICENAME',
         '--vopt', 'family=FAMILYNAME', '--vopt', 'cst=design.cst'],
        {'design.json': y['design.json'], 'design.cst': cst},
        {stdout: null, stderr: null, fetchProgress: prog('nextpnr')});
    t.nextpnrMs = performance.now() - t0;

    window.RESULT = {ok: true, pnr: n['out.json'], fetched, ...t};
} catch (e) { window.RESULT = {error: (e.message || String(e)).split('\\n')[0]}; }
</script>`;

export async function runChainInBrowser (design, {keep = false} = {}) {
    const {chromium} = await import('playwright');
    const work = path.join(YOWASP_DIR, 'work');
    mkdirSync(work, {recursive: true});
    // The browser serves out of the install dir so node_modules is reachable;
    // the design files are copied in beside it.
    writeFileSync(path.join(YOWASP_DIR, 'design.v'),
        readFileSync(path.join(FIXTURES, `${design}.v`)));
    writeFileSync(path.join(YOWASP_DIR, 'design.cst'),
        readFileSync(path.join(FIXTURES, `${design}.cst`)));
    writeFileSync(path.join(YOWASP_DIR, 'index.html'), PAGE
        .replace('TOPNAME', design).replace('DEVICENAME', DEVICE).replace('FAMILYNAME', FAMILY));

    const {server, port} = await serve(YOWASP_DIR);
    const browser = await chromium.launch();
    try {
        const page = await browser.newPage();
        await page.goto(`http://127.0.0.1:${port}/index.html`);
        await page.waitForFunction('window.RESULT !== null', {timeout: 900000});
        const result = await page.evaluate('window.RESULT');
        if (result.error) throw new Error(`the chain failed in the browser: ${result.error}`);
        return {...result, version: browser.version()};
    } finally {
        await browser.close();
        server.close();
        if (!keep) rmSync(work, {recursive: true, force: true});
    }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    const argv = process.argv.slice(2);
    if (argv.includes('--install')) installYowasp();
    if (!existsSync(path.join(YOWASP_DIR, 'node_modules', '@yowasp', 'yosys'))) {
        process.stderr.write('the YoWASP packages are not installed. Run:\n'
            + '  node scripts/probe-browser-fpga-chain.mjs --install   '
            + '(~260 MB into artifacts/, gitignored)\n');
        process.exit(2);
    }
    if (!existsSync(PYODIDE_ENTRY)) {
        process.stderr.write(`the packer needs pyodide. Run:\n  ${INSTALL_HINT}\n`);
        process.exit(2);
    }

    const design = 'blink';
    const spec = DESIGNS[design];
    const r = await runChainInBrowser(design, {keep: argv.includes('--keep')});
    const pnrSha = createHash('sha256').update(r.pnr).digest('hex');

    // The browser's place-and-route output, packed. Pyodide runs in node here
    // rather than in the page only because it is the same WebAssembly either
    // way and the page has already made its point.
    const workPnr = path.join(FIXTURES, `.browser-${design}-pnr.json`);
    writeFileSync(workPnr, r.pnr);
    let packed;
    try {
        packed = await packWithPyodide(design, {pnrOverride: workPnr});
    } finally {
        rmSync(workPnr, {force: true});
    }

    process.stdout.write(
        `chromium ${r.version}\n`
        + `  yosys     ${(r.yosysMs / 1000).toFixed(1)}s   fetched `
        + `${(r.fetched.yosys / 1e6).toFixed(1)} MB\n`
        + `  nextpnr   ${(r.nextpnrMs / 1000).toFixed(1)}s   fetched `
        + `${(r.fetched.nextpnr / 1e6).toFixed(1)} MB\n`
        + `  packer    ${(packed.packMs / 1000).toFixed(1)}s   (Pyodide, ~20 MB)\n\n`
        + `  nextpnr JSON  ${pnrSha}\n`
        + `  bitstream     ${packed.sha256}\n`
        + `  native was    ${spec.sha256}\n`
        + `  ${packed.sha256 === spec.sha256
            ? 'IDENTICAL — the browser chain and the native chain agree'
            : 'DIFFERENT — this is the interesting case, do not paper over it'}\n`);
}
