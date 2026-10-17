#!/usr/bin/env node
// SPDX-License-Identifier: BSD-3-Clause
// Migrates the Robot Lab's part metadata file (bw-sim/part-meta/parts.json)
// from PartMeta v1 to v2 (docs/ROBOT-LAB-ARCHITECTURE.md §5.4, §5.7):
//
//   motor  → internalJoints: [{id: 'motor', type: 'hinge', point, axis,
//            movingConnectors, movingColliders, massFraction, actuatedBy}]
//            + device (the devices/catalog.js id whose numbers are the motor's)
//   sensor → device ('spike-color' | 'spike-distance' | 'spike-force')
//            + probe {kind: 'ray', origin, direction}
//   hub    → hubProfile ('spike-prime')
//
// Every other field stays as it is, in its place; the file gets `version: 2`.
// The rule is contracts.js upgradePartMeta — the same function the loader
// (sim-session.js catalogFrom) applies to a v1 catalogue — so the file and an
// upgraded v1 file are the same data. Running it again changes nothing
// (test/bw-sim-parts-v2.test.mjs checks both).
//
//   node scripts/migrate-parts-v2.mjs           rewrite the file
//   node scripts/migrate-parts-v2.mjs --check   exit 1 if the file is not migrated

import {readFileSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {upgradePartMeta, PART_META_VERSION} from '../overlay/scratch-gui/src/lib/bw-sim/contracts.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const PARTS_FILE = path.join(ROOT, 'overlay/scratch-gui/src/lib/bw-sim/part-meta/parts.json');

const V1_COMMENT = 'Sim Lab part metadata v1 (docs/SIM-LAB-PLAN.md B3a).';
const V2_COMMENT = 'Sim Lab part metadata v2 (docs/SIM-LAB-PLAN.md B3a; PartMeta v2 in bw-sim/contracts.js, ' +
    'docs/ROBOT-LAB-ARCHITECTURE.md §5.4: a motor or sensor names its device, whose numbers are in bw-sim/devices/catalog.js).';

/**
 * The parsed parts.json, migrated to v2 (pure; a v2 file comes back equal).
 * @param {{version: number, parts: object[]}} json
 */
export const migratePartsFile = json => {
    const out = {};
    for (const [k, v] of Object.entries(json)) {
        if (k === '$comment' && typeof v === 'string') out[k] = v.replace(V1_COMMENT, V2_COMMENT);
        else if (k === 'version') out[k] = PART_META_VERSION;
        else if (k === 'parts') out[k] = v.map(p => upgradePartMeta(p));
        else out[k] = v;
    }
    return out;
};

/** The file's text for parsed content (the file's own layout: one-space indent, final newline). */
export const partsFileText = json => `${JSON.stringify(json, null, 1)}\n`;

const main = () => {
    const text = readFileSync(PARTS_FILE, 'utf8');
    const migrated = partsFileText(migratePartsFile(JSON.parse(text)));
    if (process.argv.includes('--check')) {
        if (migrated !== text) {
            console.error('parts.json is not PartMeta v2: run node scripts/migrate-parts-v2.mjs');
            process.exit(1);
        }
        console.log('parts.json is PartMeta v2');
        return;
    }
    if (migrated === text) console.log('parts.json is already PartMeta v2');
    else {
        writeFileSync(PARTS_FILE, migrated);
        console.log('parts.json migrated to PartMeta v2');
    }
};

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
