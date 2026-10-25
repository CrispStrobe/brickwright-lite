#!/usr/bin/env node
// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// Command line of the Robot Lab part deriver: writes parts.json and the coverage report.
// The deriver itself is overlay/scratch-gui/src/lib/bw-sim/part-meta/derive.js (the app
// also runs it, for parts added from the LDraw catalogue); see there for how a part is derived.
//
//   node scripts/derive-part-meta.mjs --lib <LDraw library> --generate <list> [--report-md <file>]
//   node scripts/derive-part-meta.mjs --compare [--lib <LDraw library>]
//   node scripts/derive-part-meta.mjs <part.dat>...

import {readFileSync, writeFileSync, existsSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {flattenPart} from '../overlay/scratch-gui/src/lib/bw-sim/ldraw/ldraw-geometry.js';
import {derivePart, selfCheck, compareAll, coverageMarkdown} from '../overlay/scratch-gui/src/lib/bw-sim/part-meta/derive.js';

export * from '../overlay/scratch-gui/src/lib/bw-sim/part-meta/derive.js';

// ---- CLI ----------------------------------------------------------------------

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const PARTS_FILE = path.join(ROOT, 'overlay/scratch-gui/src/lib/bw-sim/part-meta/parts.json');

export const libReader = lib => p => {
    const f = path.join(lib, p.toLowerCase());
    return existsSync(f) ? readFileSync(f, 'latin1') : undefined;
};


/** Derive every listed part not yet in parts.json; admit those that pass selfCheck. */
export const generate = async (list, read) => {
    const {validatePartMeta} = await import('../overlay/scratch-gui/src/lib/bw-sim/contracts.js');
    const {BUILTIN_KINDS} = await import('../overlay/scratch-gui/src/lib/bw-sim/kinds/index.js');
    const {MIN_ENGAGE_LDU} = await import('../overlay/scratch-gui/src/lib/bw-sim/kinds/pin-axle.js');
    const json = JSON.parse(readFileSync(PARTS_FILE, 'utf8'));
    json.parts = json.parts.filter(p => !p.derived);
    const hand = new Set(json.parts.map(p => p.part));
    const names = new Set(json.parts.map(p => p.nameDe));
    const added = []; const rejected = []; const measured = [];
    for (const part of list) {
        if (hand.has(part)) { measured.push(part); continue; }
        const r = derivePart(part, read);
        const why = [...r.problems];
        if (r.meta) why.push(...selfCheck(r.meta, flattenPart(part, read), {validate: validatePartMeta, kinds: BUILTIN_KINDS.connectors, minEngage: MIN_ENGAGE_LDU}));
        if (why.length) { rejected.push({part, name: r.desc || part, why}); continue; }
        const m = r.meta;
        if (names.has(m.nameDe)) m.nameDe = `${m.nameDe} (${part.replace(/\.dat$/, '')})`;
        names.add(m.nameDe);
        added.push(m);
        process.stderr.write(`+ ${part} ${m.name}\n`);
    }
    json.parts.push(...added);
    const note = ' Entries marked "derived": true are not measured by hand: scripts/derive-part-meta.mjs derives them from their LDraw files (connection primitives, measured anti-stud cells; mass = mesh volume x ABS 1.05 g/cm3; nameDeGenerated: a generated German name), and admits one only when it passes the geometry contract.';
    if (!json.$comment.includes(note)) json.$comment += note;
    return {json, added, rejected, measured};
};

const main = async () => {
    const args = process.argv.slice(2);
    const opt = n => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
    const lib = opt('--lib') || path.join(ROOT, 'overlay/scratch-gui/static/ldraw');
    const read = libReader(lib);
    if (args.includes('--compare')) {
        const meta = JSON.parse(readFileSync(PARTS_FILE, 'utf8'));
        process.stdout.write(`${JSON.stringify(compareAll(meta.parts, read), null, 1)}\n`);
        return;
    }
    if (opt('--generate')) {
        const list = readFileSync(opt('--generate'), 'utf8').split('\n').filter(l => !l.startsWith('#'))
            .join(' ').split(/\s+/).filter(Boolean).map(n => `${n.replace(/\.dat$/i, '')}.dat`);
        const {json, added, rejected, measured} = await generate([...new Set(list)], read);
        const {partsFileText} = await import('./migrate-parts-v2.mjs');
        writeFileSync(PARTS_FILE, partsFileText(json));
        const report = {added: added.map(m => ({part: m.part, name: m.name, nameDe: m.nameDe, category: m.category, massGrams: m.massGrams,
            connectors: Object.entries(m.connectors.reduce((a, c) => ({...a, [c.type]: (a[c.type] || 0) + 1}), {})).map(([k, v]) => `${v} ${k}`).join(', '),
            colliders: m.colliders.length})), rejected, measured, compare: compareAll(json.parts, read)};
        if (opt('--report')) writeFileSync(opt('--report'), `${JSON.stringify(report, null, 1)}\n`);
        if (opt('--report-md')) {
            const {gzipSync} = await import('node:zlib');
            const text = partsFileText(json);
            const min = JSON.stringify(json);
            writeFileSync(opt('--report-md'), coverageMarkdown({...report, partsBytes: {pretty: text.length, min: min.length, gz: gzipSync(min).length}}));
        }
        process.stderr.write(`derived ${added.length}, rejected ${rejected.length}, already measured ${measured.length}\n`);
        return;
    }
    const parts = args.filter((a, i) => /\.dat$/i.test(a) && args[i - 1] !== '--lib');
    for (const p of parts) process.stdout.write(`${JSON.stringify(derivePart(p, read), null, 1)}\n`);
};

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
