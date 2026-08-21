#!/usr/bin/env node
// Sync the vendored circuit-designer panel into the overlay.
//
// bw-circuit-ui is the UI half of the simulator: parts palette, wiring canvas, multimeter,
// inference from the project's PIN declarations. It consumes bw-board through an injected
// engine (setEngine), so it does not care where the engine lives — which is what makes it
// vendorable at all.
//
// Same contract as the other sync scripts. Discovers files rather than hardcoding a list,
// and verifies afterwards that every relative import resolves.
//
//   --check      exit non-zero (without writing) if stale, for CI.
//   --dir <path> read from a local checkout instead of over HTTP.

import {readFile, writeFile, mkdir, readdir, unlink} from 'node:fs/promises';
import { guardSource } from './lib-source-guard.mjs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const dest = path.join(here, '..', 'overlay', 'scratch-gui', 'src', 'lib', 'bw-circuit-ui');
const check = process.argv.includes('--check');
const dirIdx = process.argv.indexOf('--dir');
const srcDir = dirIdx !== -1 ? process.argv[dirIdx + 1] : null;
if (dirIdx !== -1 && srcDir) guardSource(srcDir);
if (!srcDir) { console.error('needs --dir <bw-circuit-ui checkout> for now'); process.exit(2); }

// main.jsx is the Vite harness entry and has no business in the fork.
const SKIP = new Set(['main.jsx']);

async function walk (rel = '') {
    const out = [];
    for (const e of await readdir(path.join(srcDir, 'src', rel), {withFileTypes: true})) {
        const r = rel ? `${rel}/${e.name}` : e.name;
        if (e.isDirectory()) out.push(...await walk(r));
        else if (/\.(jsx?|json|svg|css)$/.test(e.name) && !SKIP.has(e.name)) out.push(r);
    }
    return out.sort();
}

// ── Local-divergence guard ─────────────────────────────────────────────
// The 930000d incident: a sync overwrote weeks of lite-local patches
// that had never been upstreamed, and production regressed wall to wall.
// The sync now records a manifest of what IT last wrote; if the vendored
// tree has since been edited locally, a write refuses and lists the
// files — those patches belong UPSTREAM first (or pass
// --overwrite-local to knowingly discard them).
import { createHash } from 'node:crypto';
const manifestPath = path.join(dest, '.vendor-manifest.json');
const sha = (s) => createHash('sha1').update(s).digest('hex');
const overwriteLocal = process.argv.includes('--overwrite-local');
if (!check) {
    const manifest = await readFile(manifestPath, 'utf8').then(JSON.parse).catch(() => null);
    if (manifest) {
        const diverged = [];
        for (const [rel, hash] of Object.entries(manifest)) {
            const cur = await readFile(path.join(dest, rel), 'utf8').catch(() => null);
            if (cur !== null && sha(cur) !== hash) diverged.push(rel);
        }
        if (diverged.length && !overwriteLocal) {
            console.error(`REFUSING to sync: ${diverged.length} vendored file(s) carry LOCAL edits not present at the last sync:`);
            for (const f of diverged) console.error(`  local ${f}`);
            console.error('\nUpstream these patches to bw-circuit-ui first, then re-sync.');
            console.error('To knowingly DISCARD them instead: --overwrite-local');
            process.exit(3);
        }
        if (diverged.length) console.error(`--overwrite-local: discarding local edits in ${diverged.length} file(s)`);
    }
}

let stale = 0;
const files = await walk();
const written = {};
for (const rel of files) {
    const out = path.join(dest, rel);
    const next = await readFile(path.join(srcDir, 'src', rel), 'utf8');
    const current = await readFile(out, 'utf8').catch(() => null);
    if (current === next) { console.log(`  ok    ${rel}`); written[rel] = sha(next); continue; }
    stale++;
    if (check) { console.log(`  STALE ${rel}`); continue; }
    await mkdir(path.dirname(out), {recursive: true});
    await writeFile(out, next);
    written[rel] = sha(next);
    console.log(`  wrote ${rel}`);
}
if (!check) await writeFile(manifestPath, JSON.stringify(written, null, 1));

// Delete vendored files that no longer exist upstream. Without this, a
// rename (e.g. hobby_gearmotor → gearmotor) leaves both names live, and
// nothing says which is real. The LICENSE file placed in this directory
// for MPL-2.0 compliance is not a vendored source file and must survive.
if (!check) {
    const KEEP = new Set(['LICENSE', '.vendor-manifest.json']);
    async function walkDest (rel = '') {
        const out = [];
        for (const e of await readdir(path.join(dest, rel), {withFileTypes: true})) {
            const r = rel ? `${rel}/${e.name}` : e.name;
            if (e.isDirectory()) out.push(...await walkDest(r));
            else if (/\.(jsx?|json|svg)$/.test(e.name)) out.push(r);
        }
        return out;
    }
    const sourceSet = new Set(files);
    let deleted = 0;
    for (const rel of await walkDest()) {
        if (KEEP.has(path.basename(rel))) continue;
        if (!sourceSet.has(rel)) {
            await unlink(path.join(dest, rel));
            console.log(`  DELETE ${rel}`);
            deleted++;
        }
    }
    if (deleted) console.log(`  removed ${deleted} file(s) no longer upstream`);
}

if (!check) {
    const have = new Set(files);
    const allowed = new Set(['react', 'react-dom', 'prop-types', '@lit/react', 'lit', '@wokwi/elements']); // react-dom: createPortal for the intro reader modal (deliberate, 2026-08-16)
    for (const rel of files) {
        const src = await readFile(path.join(dest, rel), 'utf8');
        // Only a real module specifier counts: a `from '...'` clause, or a
        // side-effect `import '...'`. The previous pattern took the first
        // quoted string on any line starting with import/export, so
        //     export function ExamplesBrowser({ examples, lang = 'en' })
        // was read as importing a package called "en" and the whole vendor
        // aborted. A gate that blocks correct code is as costly as one that
        // passes wrong code — this one blocked every re-vendor, which is the
        // only path anything reaches users by.
        for (const m of src.matchAll(
            /^\s*(?:import|export)\b[^\n]*?\bfrom\s*['"]([^'"]+)['"]|^\s*import\s*['"]([^'"]+)['"]/gm
        )) {
            const spec = m[1] || m[2];
            if (spec.startsWith('.')) {
                // resolve relative to this file, allowing an omitted .js/.jsx extension
                const target = path.posix.normalize(path.posix.join(path.posix.dirname(rel), spec));
                const ok = have.has(target) || have.has(`${target}.js`) || have.has(`${target}.jsx`) || have.has(`${target}.css`);
                if (!ok) throw new Error(`${rel} imports ${spec}, which was not vendored`);
            } else if (![...allowed].some(a => spec === a || spec.startsWith(`${a}/`))) {
                throw new Error(`${rel} imports an unexpected package "${spec}" — add it to the allow-list and to integrate.mjs deliberately`);
            }
        }
    }
    console.log(`  checked ${files.length} files: imports resolve, only allow-listed packages`);
}
if (check && stale) { console.error(`\n${stale} stale — run: npm run sync:circuitui`); process.exit(1); }
console.log(check ? '\nvendored panel up to date.' : '\nsynced. Next: npm run integrate');

// Record the upstream commit this sync captured, so vendor-freshness CI
// compares against the PIN, not a moving HEAD (bump = re-run this sync).
if (!check && srcDir) {
    try {
        const { execSync } = await import('node:child_process');
        const pinSha = execSync(`git -C ${JSON.stringify(srcDir)} rev-parse HEAD`).toString().trim();
        const pinsFile = path.join(here, '..', 'vendor-pins.json');
        const pins = await readFile(pinsFile, 'utf8').then(JSON.parse).catch(() => ({}));
        pins['bw-circuit-ui'] = pinSha;
        await writeFile(pinsFile, JSON.stringify(pins, null, 1));
        console.log(`  pinned bw-circuit-ui@${pinSha.slice(0, 8)}`);
    } catch (e) { console.warn(`  (pin not recorded: ${e.message})`); }
}
