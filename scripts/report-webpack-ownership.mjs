#!/usr/bin/env node
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {dirname, resolve} from 'node:path';
import {assertDosChunkBoundary, summarizeWebpackOwnership} from './lib/webpack-ownership.mjs';

const inputPath = resolve(process.argv[2] || 'artifacts/i8086-performance/webpack-stats.json');
const outputPath = resolve(process.argv[3] || 'artifacts/i8086-performance/webpack-ownership.json');
const stats = JSON.parse(await readFile(inputPath, 'utf8'));
const report = summarizeWebpackOwnership(stats);
const failures = assertDosChunkBoundary(report);
await mkdir(dirname(outputPath), {recursive: true});
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);

console.log(`Initial JavaScript: ${(report.initial.bytes / 1048576).toFixed(2)} MiB`);
for (const asset of report.initial.assets) {
    console.log(`  ${(asset.bytes / 1048576).toFixed(2)} MiB  ${asset.name}`);
}
console.log('Largest initial owners:');
for (const owner of report.initial.owners.slice(0, 15)) {
    console.log(`  ${(owner.bytes / 1048576).toFixed(2)} MiB  ${owner.owner}`);
}
console.log(`DOS chunk: ${(report.dosChunk.bytes / 1024).toFixed(1)} KiB  ` +
    `${report.dosChunk.files.join(', ') || 'missing'}`);
for (const failure of failures) console.error(`FAIL: ${failure}`);
if (failures.length) process.exitCode = 1;
