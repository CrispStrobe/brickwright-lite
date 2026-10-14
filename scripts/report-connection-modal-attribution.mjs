#!/usr/bin/env node
/** P18: preserve the failed named-asset measurement without retaining its candidate. */
import {readFileSync, writeFileSync} from 'node:fs';
import path from 'node:path';

import {
    attributeNamedWebpackChunk,
    attributeNamedWebpackChunkGroup,
    summarizeWebpackOwnership
} from './lib/webpack-ownership.mjs';

const args = process.argv.slice(2);
let statsArgument;
let run;
let headSha;
let writeReceipt;
let checkReceipt;
for (let index = 0; index < args.length; index++) {
    const argument = args[index];
    if (['--run', '--head', '--write-receipt', '--check-receipt'].includes(argument)) {
        const value = args[++index];
        if (!value) throw new Error(`${argument} needs a value`);
        if (argument === '--run') run = Number(value);
        else if (argument === '--head') headSha = value;
        else if (argument === '--write-receipt') writeReceipt = path.resolve(value);
        else checkReceipt = path.resolve(value);
    } else if (argument.startsWith('--')) {
        throw new Error(`unknown option ${argument}`);
    } else if (statsArgument) {
        throw new Error(`unexpected argument ${argument}`);
    } else {
        statsArgument = argument;
    }
}
if (!statsArgument) throw new Error('webpack stats path is required');
if (!Number.isSafeInteger(run) || run <= 0) throw new Error('--run must be a positive integer');
if (!/^[0-9a-f]{40}$/.test(headSha || '')) throw new Error('--head must be a full commit SHA');

const stats = JSON.parse(readFileSync(path.resolve(statsArgument)));
const webpackHash = stats.hash || (stats.children || []).find(child => child.hash)?.hash;
if (typeof webpackHash !== 'string' || !webpackHash) throw new Error('webpack hash is missing');
const named = attributeNamedWebpackChunk(stats, 'connection-modal');
const group = attributeNamedWebpackChunkGroup(stats, 'connection-modal');
if (named.initial) throw new Error('connection-modal is initial, not a demand-loaded candidate');
if (!Number.isFinite(named.asset.bytes) || named.asset.bytes <= 0) {
    throw new Error(`connection-modal asset has invalid size ${String(named.asset.bytes)}`);
}
const initialBytes = summarizeWebpackOwnership(stats).initial.bytes;
const baseline = {run: 34056846253, initialBytes: 4351060};
const emittedFloorBytes = 75 * 1024;
const receipt = {
    schema: 'brickwright/p18-connection-modal-attribution/v1',
    evidence: {run, headSha, webpackHash},
    baseline,
    candidate: {
        initialBytes,
        initialReductionBytes: baseline.initialBytes - initialBytes,
        namedChunk: named,
        namedChunkGroup: group
    },
    emittedFloorBytes,
    shortfallBytes: emittedFloorBytes - named.asset.bytes,
    namedAssetClearsFloor: named.asset.bytes >= emittedFloorBytes,
    chunkGroupClearsFloor: group.emittedBytes >= emittedFloorBytes,
    retryAcceptancePassed: false,
    accepted: false
};
if (writeReceipt) writeFileSync(writeReceipt, `${JSON.stringify(receipt, null, 2)}\n`);
if (checkReceipt) {
    const expected = JSON.parse(readFileSync(checkReceipt));
    if (JSON.stringify(expected) !== JSON.stringify(receipt)) {
        throw new Error(`P18 receipt differs from ${checkReceipt}`);
    }
}
console.log(JSON.stringify(receipt, null, 2));
process.exitCode = 2;
