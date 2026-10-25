#!/usr/bin/env node
/** P21: fail closed unless the hosted candidate moves at least 76,800 emitted bytes. */
import {createHash} from 'node:crypto';
import {mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import path from 'node:path';

import {attributePseudocodeImporter, P21_EMITTED_FLOOR_BYTES} from './lib/p21-pseudocode-attribution.mjs';

const args = process.argv.slice(2);
const supplied = option => {
    const index = args.indexOf(option);
    return index >= 0 ? args[index + 1] : undefined;
};
let statsPath;
let buildDirectory;
let run = Number(supplied('--run'));
let headSha = supplied('--head');
let baseSha = supplied('--base');
let receiptPath = supplied('--write-receipt') ? path.resolve(supplied('--write-receipt')) : undefined;
let stage = 'arguments';
let attributionForFailure = null;

const rejection = error => ({
    schema: 'brickwright/p21-pseudocode-attribution/v1',
    evidence: {run, headSha, baseSha, webpackHash: attributionForFailure?.webpackHash || null},
    emittedFloorBytes: P21_EMITTED_FLOOR_BYTES,
    accepted: false,
    shortfallBytes: null,
    attribution: attributionForFailure,
    failure: {stage, message: String(error?.message || error)}
});
const writeReceipt = value => {
    if (!receiptPath) return;
    mkdirSync(path.dirname(receiptPath), {recursive: true});
    writeFileSync(receiptPath, `${JSON.stringify(value, null, 2)}\n`);
};

try {
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
    if (!receiptPath) throw new Error('--write-receipt is required');
    if (!statsPath || !buildDirectory) throw new Error('stats and --build-dir are required');
    if (!Number.isSafeInteger(run) || run <= 0) throw new Error('--run must be a positive integer');
    if (!/^[0-9a-f]{40}$/.test(headSha || '')) throw new Error('--head must be a full commit SHA');
    if (!/^[0-9a-f]{40}$/.test(baseSha || '')) throw new Error('--base must be a full commit SHA');

    stage = 'read-stats';
    const rawStats = readFileSync(statsPath, 'utf8');
    stage = 'parse-stats';
    const stats = JSON.parse(rawStats);
    stage = 'attribute';
    const attribution = attributePseudocodeImporter(stats);
    attributionForFailure = attribution;
    stage = 'verify-assets';
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
        attribution: {...attribution, assets},
        failure: null
    };
    stage = 'write-receipt';
    writeReceipt(receipt);
    console.log(JSON.stringify(receipt, null, 2));
    if (!accepted) process.exitCode = 2;
} catch (error) {
    const receipt = rejection(error);
    try {
        writeReceipt(receipt);
    } catch (writeError) {
        console.error(`could not write P21 rejection receipt: ${String(writeError?.message || writeError)}`);
    }
    console.error(JSON.stringify(receipt, null, 2));
    process.exitCode = 1;
}
