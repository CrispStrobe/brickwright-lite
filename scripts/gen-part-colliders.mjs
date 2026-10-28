#!/usr/bin/env node
// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
// Writes the mesh-derived colliders of docs/data/part-collider-derivations.json into part-meta/parts.json.
// Run once after editing the derivations; the test then holds parts.json to them.
import {readFileSync, writeFileSync, existsSync} from 'node:fs';
import {deriveBoxes} from './lib/derive-mesh-colliders.mjs';
const root = new URL('../', import.meta.url);
const lib = new URL('overlay/scratch-gui/static/ldraw/', root);
const read = p => { const u = new URL(p.toLowerCase(), lib); return existsSync(u) ? readFileSync(u, 'latin1') : undefined; };
const metaUrl = new URL('overlay/scratch-gui/src/lib/bw-sim/part-meta/parts.json', root);
const meta = JSON.parse(readFileSync(metaUrl, 'utf8'));
const {parts} = JSON.parse(readFileSync(new URL('docs/data/part-collider-derivations.json', root), 'utf8'));
for (const [part, entry] of Object.entries(parts)) {
    const p = meta.parts.find(m => m.part === part);
    const boxes = deriveBoxes(part, entry, read);
    if (entry.replaces === undefined) p.colliders = boxes;
    else {
        if (JSON.stringify(p.colliders[entry.replaces]) !== JSON.stringify(entry.replaced)) throw new Error(`${part}: box ${entry.replaces} is not the recorded one`);
        p.colliders.splice(entry.replaces, 1, ...boxes);
    }
}
writeFileSync(metaUrl, JSON.stringify(meta, null, 1) + '\n');
