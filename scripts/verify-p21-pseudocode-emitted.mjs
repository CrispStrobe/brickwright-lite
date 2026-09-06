#!/usr/bin/env node
/** P21: fail closed unless the hosted candidate moves at least 76,800 emitted bytes. */
import {createHash} from 'node:crypto';
import {readFileSync, writeFileSync} from 'node:fs';
import path from 'node:path';

import {attributePseudocodeImporter, P21_EMITTED_FLOOR_BYTES} from './lib/p21-pseudocode-attribution.mjs';

const args = process.argv.slice(2);
let statsPath;
let buildDirectory;
let run;
let headSha;
let baseSha;
let receiptPath;
for (let index = 0; index < args.length; index++) {
    const argument = args[index];
    if (['--build-dir', '--run', '--head', '--base', '--write-receipt'].includes(argument)) {
        const value = args[++index];
        if (!value) throw new Error(`${argument} needs a value`);
        if (argument === '--build-dir') buildDirectory = path.resolve(value);
        else if (argument === '--run') run = Number(value);
        else if (argument === '--head') headSha = value;
        else if (argument === '--base') baseSha = value;
        else receiptPath = path.resolve(value);
    } else if (argument.startsWith('--')) throw new Error(`unknown option ${argument}`);
    else if (statsPath) throw new Error(`unexpected argument ${argument}`);
    else statsPath = path.resolve(argument);
}
if (!statsPath || !buildDirectory || !receiptPath) throw new Error('stats, --build-dir and --write-receipt are required');
if (!Number.isSafeInteger(run) || run <= 0) throw new Error('--run must be a positive integer');
if (!/^[0-9a-f]{40}$/.test(headSha || '')) throw new Error('--head must be a full commit SHA');
if (!/^[0-9a-f]{40}$/.test(baseSha || '')) throw new Error('--base must be a full commit SHA');

const attribution = attributePseudocodeImporter(JSON.parse(readFileSync(statsPath, 'utf8')));
const buildRoot = `${buildDirectory}${path.sep}`;
const assets = attribution.assets.map(asset => {
    const filename = path.resolve(buildDirectory, asset.name);
    if (!filename.startsWith(buildRoot)) throw new Error(`asset escapes build directory: ${asset.name}`);
    const bytes = readFileSync(filename);
    if (bytes.byteLength !== asset.bytes) {
        throw new Error(`asset ${asset.name} is ${bytes.byteLength} bytes on disk, stats say ${asset.bytes}`);
    }
    return {...asset, sha256: createHash('sha256').update(bytes).digest('hex')};
});
const accepted = attribution.emittedBytes >= P21_EMITTED_FLOOR_BYTES;
const receipt = {
    schema: 'brickwright/p21-pseudocode-attribution/v1',
    evidence: {run, headSha, baseSha, webpackHash: attribution.webpackHash},
    emittedFloorBytes: P21_EMITTED_FLOOR_BYTES,
    accepted,
    shortfallBytes: Math.max(0, P21_EMITTED_FLOOR_BYTES - attribution.emittedBytes),
    attribution: {...attribution, assets}
};
writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
console.log(JSON.stringify(receipt, null, 2));
if (!accepted) process.exitCode = 2;
