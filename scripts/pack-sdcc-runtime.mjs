#!/usr/bin/env node
/** Pack SDCC headers and model-small libraries into one cacheable browser asset. */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'overlay/scratch-gui/src/lib/sdcc-wasm/dist');
const output = path.join(dist, 'runtime.json');
const roots = ['include', 'lib/small'];
const files = {};

const walk = dir => {
    for (const entry of fs.readdirSync(path.join(dist, dir), {withFileTypes: true})) {
        const rel = path.posix.join(dir, entry.name);
        if (entry.isDirectory()) walk(rel);
        else files[`/${rel}`] = fs.readFileSync(path.join(dist, rel)).toString('base64');
    }
};
for (const dir of roots) walk(dir);

for (const required of ['/lib/small/mcs51.lib', '/lib/small/libsdcc.lib', '/include/mcs51/stc12.h']) {
    if (!files[required]) throw new Error(`SDCC runtime is incomplete: missing ${required}`);
}
fs.writeFileSync(output, `${JSON.stringify({format: 1, files})}\n`);
console.log(`packed ${Object.keys(files).length} SDCC runtime files (${fs.statSync(output).size} bytes)`);
