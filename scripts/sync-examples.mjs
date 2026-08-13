#!/usr/bin/env node
// Sync the gallery examples from sb3-creator into overlay/scratch-gui/examples/.
//
// The examples gallery (index.json + per-example directories with program.bw,
// circuit.json, EXPECTED.md) is maintained in sb3-creator and vendored here.
// sb3-creator's index.json carries computed `devices` and `refusals` fields that
// the ExamplesBrowser uses to grey out incompatible examples — without them, every
// example shows as available for every device.
//
// Same contract as the other sync-*.mjs scripts:
//
//   --check      exit non-zero (without writing) if vendored files are stale.
//   --dir <path> read from a local sb3-creator checkout instead of over HTTP.
//
// Override the HTTP source with SB3CREATOR_REF (branch/tag/sha), default "main".
//
// House vendor discipline: the entire tree is read into memory first. If any
// referenced file is missing the script fails before writing anything — no partial
// vendor.

import {readFile, writeFile, mkdir, readdir, rm, stat} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const REF = process.env.SB3CREATOR_REF || 'main';
const RAW = `https://raw.githubusercontent.com/CrispStrobe/sb3-creator/${REF}`;
const here = path.dirname(fileURLToPath(import.meta.url));
const dest = path.join(here, '..', 'overlay', 'scratch-gui', 'examples');
const check = process.argv.includes('--check');
const dirIdx = process.argv.indexOf('--dir');
const srcDir = dirIdx !== -1 ? process.argv[dirIdx + 1] : null;

// ── helpers ──────────────────────────────────────────────────────────────────

async function readSource (rel) {
    if (srcDir) return readFile(path.join(srcDir, 'examples', rel));
    const res = await fetch(`${RAW}/examples/${rel}`);
    if (!res.ok) throw new Error(`fetch examples/${rel} @ ${REF}: HTTP ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
}

async function readSourceText (rel) {
    const buf = await readSource(rel);
    return buf.toString('utf8');
}

// Discover all example directories and their files from a local checkout.
async function discoverLocal () {
    const root = path.join(srcDir, 'examples');
    const entries = await readdir(root, {withFileTypes: true});
    const dirs = entries.filter(e => e.isDirectory()).map(e => e.name).sort();
    const files = new Map(); // relative path → Buffer

    // index.json
    files.set('index.json', await readFile(path.join(root, 'index.json')));

    // READMEs
    for (const name of ['README.md', 'README.de.md']) {
        try {
            files.set(name, await readFile(path.join(root, name)));
        } catch { /* optional */ }
    }

    // per-directory files
    for (const dir of dirs) {
        const dirPath = path.join(root, dir);
        const children = await readdir(dirPath);
        for (const child of children.sort()) {
            const rel = `${dir}/${child}`;
            files.set(rel, await readFile(path.join(dirPath, child)));
        }
    }
    return {dirs, files};
}

// Discover from HTTP using the index.json to enumerate directories.
async function discoverRemote () {
    const indexText = await readSourceText('index.json');
    const index = JSON.parse(indexText);
    const files = new Map();

    files.set('index.json', Buffer.from(indexText, 'utf8'));

    // Collect all referenced directories from the index
    const dirSet = new Set();
    for (const entry of index) {
        if (entry.files) {
            for (const fpath of Object.values(entry.files)) {
                dirSet.add(fpath.split('/')[0]);
            }
        }
    }
    const dirs = [...dirSet].sort();

    // Fetch known file names per directory
    const KNOWN_FILES = ['program.bw', 'circuit.json', 'EXPECTED.md'];
    for (const dir of dirs) {
        for (const name of KNOWN_FILES) {
            try {
                const buf = await readSource(`${dir}/${name}`);
                files.set(`${dir}/${name}`, buf);
            } catch { /* file doesn't exist in this dir — ok */ }
        }
    }

    // READMEs
    for (const name of ['README.md', 'README.de.md']) {
        try {
            files.set(name, Buffer.from(await readSourceText(name), 'utf8'));
        } catch { /* optional */ }
    }

    return {dirs, files};
}

// ── main ─────────────────────────────────────────────────────────────────────

const {dirs, files} = srcDir ? await discoverLocal() : await discoverRemote();

// Validate: every file path referenced in index.json must be in our tree.
const index = JSON.parse(files.get('index.json').toString('utf8'));
let missing = 0;
for (const entry of index) {
    if (!entry.files) continue;
    for (const [key, fpath] of Object.entries(entry.files)) {
        if (!files.has(fpath)) {
            console.error(`  MISSING ${entry.id}: files.${key} = ${fpath}`);
            missing++;
        }
    }
}
if (missing) {
    console.error(`\n${missing} referenced file(s) missing from source — aborting.`);
    process.exit(1);
}

console.log(`source: ${files.size} files across ${dirs.length} directories`);

// Compare against destination
let stale = 0;
let added = 0;
for (const [rel, buf] of files) {
    const destPath = path.join(dest, rel);
    let current = null;
    try { current = await readFile(destPath); } catch { /* doesn't exist */ }
    if (current && current.equals(buf)) continue;
    if (current === null) added++;
    stale++;
    if (check) {
        console.log(`  STALE ${rel}`);
    }
}

// Check for destination files that are no longer in source (excluding .gitkeep etc)
const IGNORE = new Set(['.gitkeep']);
async function listDest () {
    const result = [];
    try {
        const entries = await readdir(dest, {withFileTypes: true});
        for (const e of entries) {
            if (IGNORE.has(e.name)) continue;
            if (e.isDirectory()) {
                const children = await readdir(path.join(dest, e.name));
                for (const c of children) result.push(`${e.name}/${c}`);
            } else {
                result.push(e.name);
            }
        }
    } catch { /* dest doesn't exist yet */ }
    return result;
}

const destFiles = await listDest();
const orphans = destFiles.filter(f => !files.has(f));
if (orphans.length && check) {
    for (const f of orphans) console.log(`  ORPHAN ${f}`);
}

if (check) {
    if (stale || orphans.length) {
        console.error(`\n${stale} stale, ${orphans.length} orphan(s) — run: npm run sync:examples`);
        process.exit(1);
    }
    console.log('\nexamples up to date.');
    process.exit(0);
}

if (!stale && !orphans.length) {
    console.log('examples up to date.');
    process.exit(0);
}

// Write phase: ensure directories exist, then write all files
const dirSet = new Set();
for (const rel of files.keys()) {
    const dir = path.dirname(rel);
    if (dir !== '.') dirSet.add(dir);
}
for (const d of dirSet) {
    await mkdir(path.join(dest, d), {recursive: true});
}

for (const [rel, buf] of files) {
    await writeFile(path.join(dest, rel), buf);
}

// Remove orphans
for (const f of orphans) {
    await rm(path.join(dest, f), {force: true});
}
// Remove empty orphan directories
for (const f of orphans) {
    const dir = path.dirname(f);
    if (dir === '.') continue;
    try {
        const remaining = await readdir(path.join(dest, dir));
        if (remaining.length === 0) await rm(path.join(dest, dir), {recursive: true});
    } catch { /* already gone */ }
}

console.log(`wrote ${stale} file(s) (${added} new), removed ${orphans.length} orphan(s).`);
console.log(`\nsynced from sb3-creator@${srcDir ? 'local' : REF}. ${index.length} examples in index.`);
