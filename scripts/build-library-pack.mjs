// Build the Brickwright offline library pack (Option C — see PLAN.md §25).
//
// Assembles the ONE-file CC BY-SA 2.0 pack the downloads-manager can grab
// instead of ~1000 individual CDN requests: enumerate the library md5exts from
// the bundled manifests, EXCLUDE the trademarked mascots (Scratch Cat, Gobo,
// Pico, Nano, Giga, Tera + their costumes — not CC-licensed), fetch each from
// Scratch's CDN, verify the md5 (the md5ext IS the md5), and drop in a
// CC-BY-SA-2.0 LICENSE + CREDITS. Zip the output dir separately, then host the
// zip as a GitHub Release asset.
//
//   node scripts/build-library-pack.mjs [--limit N] [--out DIR]
//
// Only the pre-Jan-2026 corpus is CC BY-SA; we enumerate from our own (pre-2026
// fork) bundled JSONs, so we never pull post-cutoff additions.

import {createHash} from 'node:crypto';
import * as fs from 'node:fs';
import * as fsp from 'node:fs/promises';
import * as path from 'node:path';
import {fileURLToPath} from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const LIB = path.join(HERE, '../packages/scratch-gui/src/lib/libraries');
const CDN = 'https://assets.scratch.mit.edu';
const MASCOT = /^(cat|scratch cat|gobo|pico|nano|giga|tera)\b/i;
const CONCURRENCY = 16;

const args = process.argv.slice(2);
const getArg = (flag, def) => {
    const i = args.indexOf(flag);
    return i >= 0 && args[i + 1] ? args[i + 1] : def;
};
const limit = parseInt(getArg('--limit', '0'), 10);
const outDir = path.resolve(getArg('--out', path.join(HERE, '../dist-library-pack')));

const readJson = name => JSON.parse(fs.readFileSync(path.join(LIB, `${name}.json`), 'utf8'));

// The mascot costume md5exts to exclude, gathered from mascot-named sprites and
// mascot-named costume-library entries.
const mascotMd5exts = () => {
    const out = new Set();
    for (const s of readJson('sprites')) {
        if (MASCOT.test(s.name.trim())) {
            for (const c of s.costumes || []) if (c.md5ext) out.add(c.md5ext);
        }
    }
    for (const c of readJson('costumes')) {
        if (MASCOT.test(c.name.trim()) && c.md5ext) out.add(c.md5ext);
    }
    return out;
};

// Every library md5ext MINUS the mascot exclusions.
const wantedMd5exts = exclude => {
    const set = new Set();
    const add = a => {
        if (a && a.md5ext && !exclude.has(a.md5ext)) set.add(a.md5ext);
    };
    readJson('costumes').forEach(add);
    readJson('backdrops').forEach(add);
    readJson('sounds').forEach(add);
    for (const s of readJson('sprites')) {
        (s.costumes || []).forEach(add);
        (s.sounds || []).forEach(add);
    }
    return Array.from(set);
};

const md5 = buf => createHash('md5').update(buf).digest('hex');

const fetchOne = async md5ext => {
    const dest = path.join(outDir, md5ext);
    const expected = md5ext.split('.')[0];
    try {
        const existing = await fsp.readFile(dest);
        if (md5(existing) === expected) return 'cached';
    } catch (e) { /* not cached */ }
    for (let attempt = 0; attempt < 4; attempt++) {
        try {
            const res = await fetch(`${CDN}/${md5ext}`);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const buf = Buffer.from(await res.arrayBuffer());
            if (md5(buf) !== expected) throw new Error(`md5 mismatch for ${md5ext}`);
            await fsp.writeFile(dest, buf);
            return 'fetched';
        } catch (e) {
            if (attempt === 3) throw e;
            await new Promise(r => setTimeout(r, 500 * (attempt + 1)));
        }
    }
};

const run = async () => {
    const exclude = mascotMd5exts();
    let list = wantedMd5exts(exclude);
    if (limit > 0) list = list.slice(0, limit);
    console.log(`Excluding ${exclude.size} mascot assets; fetching ${list.length} into ${outDir}`);
    await fsp.mkdir(outDir, {recursive: true});

    let done = 0; let failed = 0;
    const queue = list.slice();
    const worker = async () => {
        while (queue.length) {
            const md5ext = queue.shift();
            try {
                await fetchOne(md5ext);
            } catch (e) {
                failed++;
                console.error(`FAIL ${md5ext}: ${e.message}`);
            }
            if (++done % 100 === 0 || done === list.length) {
                console.log(`  ${done}/${list.length} (${failed} failed)`);
            }
        }
    };
    await Promise.all(Array.from({length: CONCURRENCY}, worker));

    // Attribution + license shipped inside the pack.
    await fsp.writeFile(path.join(outDir, 'CREDITS.txt'),
        'Brickwright offline library pack\n\n' +
        'These costume, backdrop and sound files are Scratch "Support Materials",\n' +
        'licensed by the Scratch Foundation under Creative Commons\n' +
        'Attribution-ShareAlike 2.0 (CC BY-SA 2.0), per the Scratch Terms of Use\n' +
        '(content published before 22 January 2026). Trademarked Scratch characters\n' +
        '(Scratch Cat, Gobo, Pico, Nano, Giga, Tera) and logos are NOT included.\n' +
        'Some sounds are by third parties (e.g. Kevin MacLeod / incompetech.com)\n' +
        'under CC BY. Source: assets.scratch.mit.edu. See LICENSE.txt.\n');
    console.log(`\nDone: ${list.length - failed} assets, ${failed} failed.`);
    if (failed) process.exitCode = 1;
};

run();
