#!/usr/bin/env node
// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// Our model files read by another program: LeoCAD (GPL, github.com/leozide/leocad) opens
// every .ldr/.mpd the Robot Lab writes, headless, and its parts list must equal ours.
//
//   node scripts/check-model-files-leocad.mjs --leocad <leocad binary> --library <LDraw library dir>
//        [--keep <dir>] [files…]
//
// Without files: every shipped model (static/sim-lab/models/) and the OMR fixtures
// (test/fixtures/model-files/). Each is opened with the Robot Lab's reader, saved with
// "Save as…" as .ldr and as .mpd, and each saved file is given to
//   QT_QPA_PLATFORM=offscreen leocad -l <library> --export-csv out.csv <file>
// LeoCAD's CSV (Project::ExportCSV, LeoCAD 23.03 and later: `"Part Name","Color",Quantity,
// Part ID,Color Code`, one row per part and colour, sub-models flattened) is compared with
// our parts list counted the same way. Any difference fails (exit 1); no LeoCAD, or a LeoCAD
// without --export-csv, is exit 2 with a message saying so.
//
// The CSV export does not create a render context, so Qt's offscreen platform is enough;
// image (-i) and HTML exports would need an OpenGL context (xvfb).

import {spawnSync} from 'node:child_process';
import {mkdtempSync, readFileSync, readdirSync, writeFileSync, rmSync, existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {openModelFile, saveModelFile} from '../overlay/scratch-gui/src/lib/bw-sim/model/model-file.js';
import {parseModel} from '../overlay/scratch-gui/src/lib/bw-sim/model/ldraw-model.js';
import {catalogFrom} from '../overlay/scratch-gui/src/lib/bw-sim/sim-session.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

const args = process.argv.slice(2);
const option = name => {
    const i = args.indexOf(name);
    if (i < 0) return null;
    const value = args[i + 1];
    args.splice(i, 2);
    return value;
};
const leocad = option('--leocad') || process.env.LEOCAD || 'leocad';
const library = option('--library') || process.env.LEOCAD_LIB;
const keep = option('--keep');

const fail = (code, message) => {
    process.stderr.write(`${message}\n`);
    process.exit(code);
};

if (!library || !existsSync(library)) fail(2, 'check-model-files-leocad: --library <LDraw library folder> (or LEOCAD_LIB) is needed');
const help = spawnSync(leocad, ['--help'], {encoding: 'utf8', env: {...process.env, QT_QPA_PLATFORM: 'offscreen'}, timeout: 60000});
if (help.error) fail(2, `check-model-files-leocad: cannot run LeoCAD (${leocad}): ${help.error.message}`);
if (!/--export-csv/.test(`${help.stdout}${help.stderr}`)) {
    fail(2, `check-model-files-leocad: ${leocad} has no --export-csv (LeoCAD 23.03 or later is needed; Ubuntu's apt package is 21.06)`);
}

const CATALOG = catalogFrom(JSON.parse(readFileSync(path.join(ROOT, 'overlay/scratch-gui/src/lib/bw-sim/part-meta/parts.json'), 'utf8')));
const MODELS = path.join(ROOT, 'overlay/scratch-gui/static/sim-lab/models');
const FIXTURES = path.join(ROOT, 'test/fixtures/model-files');
const files = args.length ? args : [
    ...readdirSync(MODELS).filter(f => f.endsWith('.ldr')).sort().map(f => path.join(MODELS, f)),
    ...readdirSync(FIXTURES).filter(f => /\.(ldr|mpd)$/.test(f)).sort().map(f => path.join(FIXTURES, f))
];

/** A part name as both sides spell it: lower case, forward slashes, no `.dat`. */
const partKey = name => String(name).trim().toLowerCase().replace(/\\/g, '/').replace(/\.dat$/, '');

/** Our parts list: "part colour" → count. */
const ourList = model => {
    const out = new Map();
    for (const p of model.parts) {
        const key = `${partKey(p.part)} ${p.color ?? 16}`;
        out.set(key, (out.get(key) || 0) + 1);
    }
    return out;
};

/** LeoCAD's CSV as the same map. */
const leocadList = csv => {
    const out = new Map();
    const rows = csv.split(/\r?\n/).slice(1).filter(Boolean);
    for (const row of rows) {
        const m = /^"(.*)","(.*)",(\d+),(.+),(-?\d+)$/.exec(row);
        if (!m) throw new Error(`unreadable CSV row: ${row}`);
        const key = `${partKey(m[4])} ${Number(m[5])}`;
        out.set(key, (out.get(key) || 0) + Number(m[3]));
    }
    return out;
};

const work = mkdtempSync(path.join(keep || tmpdir(), 'bw-leocad-'));
let failures = 0;
try {
    for (const file of files) {
        const name = path.basename(file);
        const opened = await openModelFile(name, new Uint8Array(readFileSync(file)));
        const {model} = parseModel(opened.text, {catalog: CATALOG});
        const want = ourList(model);
        for (const format of ['ldr', 'mpd']) {
            const saved = await saveModelFile(model, format, {name: renameBase(name)});
            const target = path.join(work, saved.filename);
            writeFileSync(target, saved.data);
            const csv = path.join(work, `${saved.filename}.csv`);
            const run = spawnSync(leocad, ['-l', library, '--export-csv', csv, target], {
                encoding: 'utf8', timeout: 120000, env: {...process.env, QT_QPA_PLATFORM: 'offscreen'}
            });
            if (run.error || !existsSync(csv)) {
                failures++;
                process.stdout.write(`FAIL ${name} as .${format}: LeoCAD wrote no parts list (${run.error ? run.error.message : `exit ${run.status}: ${run.stderr.trim().slice(0, 300)}`})\n`);
                continue;
            }
            const got = leocadList(readFileSync(csv, 'utf8'));
            const keys = new Set([...want.keys(), ...got.keys()]);
            const diffs = [...keys].filter(k => (want.get(k) || 0) !== (got.get(k) || 0))
                .map(k => `${k}: ours ${want.get(k) || 0}, LeoCAD ${got.get(k) || 0}`);
            if (diffs.length) {
                failures++;
                process.stdout.write(`FAIL ${name} as .${format}: ${diffs.length} differences\n  ${diffs.slice(0, 20).join('\n  ')}\n`);
            } else {
                process.stdout.write(`ok   ${name} as .${format}: ${model.parts.length} parts, ${want.size} part/colour rows agree\n`);
            }
        }
    }
} finally {
    if (!keep) rmSync(work, {recursive: true, force: true});
}

function renameBase (name) {
    return name.replace(/\.[^.]+$/, '.ldr');
}

process.exit(failures ? 1 : 0);
