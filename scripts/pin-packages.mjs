#!/usr/bin/env node
// The two upstream repos lite takes as PACKAGES — bw-board (the board engine)
// and bw-circuit-ui (the circuit designer) — are pinned by sha in
// vendor-pins.json, exactly like sb3-creator, and installed by npm from that
// sha rather than copied in. vendor-pins.json stays the ONE authority: this
// script derives the package.json specs from it (root devDependencies here;
// integrate.mjs derives packages/scratch-gui's the same way at integrate time),
// so a pin bump is one edit followed by `npm run pin:packages`.
//
//   (default)        write root package.json specs from vendor-pins.json and
//                    `npm install` so package-lock.json follows.
//   --check          exit non-zero (without writing) if package.json or
//                    package-lock.json disagrees with vendor-pins.json, for CI.
//   --set <repo>=<sha>
//                    move the pin FIRST (recordPin, the same writer every sync
//                    used, so the pin-move gates see one writer), then do the
//                    default. The only way a pin moves here.
//
// Why a git-sha spec and not a registry version: the sha IS the review unit —
// the same 40-hex value the pin-move gates, the CI evidence gate
// (verify-bw-board-ci.mjs) and the census all key on. A semver range would put
// a second, looser identity beside it.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { recordPin } from './lib-pin.mjs';
import {githubIdentityMatches, verifyInstalledPackage, verifySingleEngineResolution} from './package-provenance.mjs';

export const PACKAGES = Object.freeze(['bw-board', 'bw-circuit-ui']);
export const OWNER = 'CrispStrobe';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PINS = path.join(ROOT, 'vendor-pins.json');
const PKG = path.join(ROOT, 'package.json');
const LOCK = path.join(ROOT, 'package-lock.json');
const SHA = /^[0-9a-f]{40}$/;

export const specFor = (name, sha) => `github:${OWNER}/${name}#${sha}`;

/** What vendor-pins.json says each package should be, validated. */
export function pinnedSpecs (pinsFile = PINS) {
    const pins = JSON.parse(readFileSync(pinsFile, 'utf8'));
    const out = {};
    for (const name of PACKAGES) {
        const sha = pins[name];
        if (!SHA.test(sha || '')) throw new Error(`vendor-pins.json: ${name} must be a 40-hex sha, got ${JSON.stringify(sha)}`);
        out[name] = specFor(name, sha);
    }
    return out;
}

/**
 * Where package.json and package-lock.json disagree with the pins. Empty means
 * consistent. Each finding names the file and the two values so the fix is
 * readable from the message.
 */
export function findings ({pinsFile = PINS, pkgFile = PKG, lockFile = LOCK} = {}) {
    const want = pinnedSpecs(pinsFile);
    const out = [];
    const pkg = JSON.parse(readFileSync(pkgFile, 'utf8'));
    for (const name of PACKAGES) {
        const have = pkg.devDependencies?.[name];
        if (have !== want[name]) out.push(`package.json devDependencies.${name} is ${JSON.stringify(have)}, vendor-pins.json says ${want[name]}`);
    }
    if (existsSync(lockFile)) {
        const lock = JSON.parse(readFileSync(lockFile, 'utf8'));
        for (const name of PACKAGES) {
            const entry = lock.packages?.[`node_modules/${name}`];
            const resolved = entry?.resolved || '';
            const sha = want[name].slice(-40);
            if (lock.packages?.['']?.devDependencies?.[name] !== want[name]) out.push(`package-lock.json root devDependencies.${name} does not match ${want[name]}`);
            if (!githubIdentityMatches(resolved, OWNER, name, sha) || entry?.link) out.push(`package-lock.json node_modules/${name} resolved ${JSON.stringify(resolved)} is not exactly ${OWNER}/${name}@${sha}`);
        }
    } else {
        out.push('package-lock.json is missing');
    }
    return out;
}

function writeSpecs () {
    const want = pinnedSpecs();
    const pkg = JSON.parse(readFileSync(PKG, 'utf8'));
    pkg.devDependencies = pkg.devDependencies || {};
    for (const name of PACKAGES) pkg.devDependencies[name] = want[name];
    pkg.devDependencies = Object.fromEntries(Object.entries(pkg.devDependencies).sort(([a], [b]) => a.localeCompare(b)));
    writeFileSync(PKG, JSON.stringify(pkg, null, 4) + '\n');
    for (const name of PACKAGES) console.log(`  package.json: ${name} -> ${want[name]}`);
}

async function main () {
    const args = process.argv.slice(2);
    const setIdx = args.indexOf('--set');
    if (setIdx !== -1 && (args.includes('--check') || args.includes('--verify-installed'))) throw new Error('--set cannot be combined with read-only verification');
    if (setIdx !== -1) {
        const m = /^([a-z0-9-]+)=([0-9a-f]{40})$/.exec(args[setIdx + 1] || '');
        if (!m || !PACKAGES.includes(m[1])) {
            console.error(`--set wants <${PACKAGES.join('|')}>=<40-hex sha>`);
            process.exit(2);
        }
        await setPackagePin(m[1], m[2]);
    }
    if (args.includes('--check') || args.includes('--verify-installed')) {
        const f = findings();
        if (f.length) {
            for (const line of f) console.error(`STALE: ${line}`);
            console.error('Run `npm run pin:packages` to derive package.json from vendor-pins.json and reinstall.');
            process.exit(1);
        }
        console.log(`pin:packages: ${PACKAGES.join(', ')} metadata consistent (installed contents not verified)`);
        if (args.includes('--verify-installed')) {
            const installedRoots = args.flatMap((arg, i) => {
                if (arg !== '--installed-root') return [];
                if (!args[i + 1] || args[i + 1].startsWith('--')) throw new Error('--installed-root requires a node_modules directory');
                return [path.resolve(args[i + 1])];
            });
            if (!installedRoots.length) installedRoots.push(path.join(ROOT, 'node_modules'));
            for (const name of PACKAGES) {
                const prefix = `${name}=`;
                const sources = args.flatMap((arg, i) => arg === '--source' && args[i + 1]?.startsWith(prefix) ? [args[i + 1].slice(prefix.length)] : []);
                if (sources.length !== 1 || !sources[0]) throw new Error(`verification requires exactly one --source ${name}=/trusted/local/git/repo`);
                for (const installedRoot of installedRoots) {
                    const result = verifyInstalledPackage({repoDir: path.resolve(sources[0]), installedDir: path.join(installedRoot, name), owner: OWNER, name, sha: pinnedSpecs()[name].slice(-40)});
                    console.log(JSON.stringify({installedRoot, ...result}));
                }
            }
            for (const installedRoot of installedRoots) console.log(JSON.stringify({installedRoot, ...verifySingleEngineResolution(installedRoot)}));
        }
        return;
    }
    writeSpecs();
    execFileSync('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund'], {cwd: ROOT, stdio: 'inherit'});
    const f = findings();
    if (f.length) {
        for (const line of f) console.error(`STILL STALE after install: ${line}`);
        process.exit(1);
    }
    console.log('pin:packages: package.json and package-lock.json follow vendor-pins.json');
}

/** --set is itself explicit pin-move authority, unlike a file sync. */
export async function setPackagePin(name, sha, {pinsFile = PINS, log = console.log} = {}) {
    if (!PACKAGES.includes(name) || !SHA.test(sha || '')) throw new Error('invalid explicit package pin');
    return recordPin(name, sha, {pinsFile, log, explicit: true, scoped: false});
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    main().catch((e) => { console.error(e.message); process.exit(1); });
}
