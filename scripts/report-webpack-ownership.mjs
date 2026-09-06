#!/usr/bin/env node
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {dirname, resolve} from 'node:path';
import {
    assertDosChunkBoundary,
    assertLazyConnectionModalBoundary,
    assertLazyPaintEditorBoundary,
    assertLazySoundTabBoundary,
    assertOptionalCodeMirrorGrammarBoundary,
    summarizeWebpackOwnership
} from './lib/webpack-ownership.mjs';

const inputPath = resolve(process.argv[2] || 'artifacts/i8086-performance/webpack-stats.json');
const outputPath = resolve(process.argv[3] || 'artifacts/i8086-performance/webpack-ownership.json');
const stats = JSON.parse(await readFile(inputPath, 'utf8'));
const report = summarizeWebpackOwnership(stats);
const dosFailures = assertDosChunkBoundary(report);
const grammarFailures = assertOptionalCodeMirrorGrammarBoundary(report);
const paintFailures = assertLazyPaintEditorBoundary(report);
const soundFailures = assertLazySoundTabBoundary(report);
const connectionModalFailures = assertLazyConnectionModalBoundary(report);
const failures = [...dosFailures, ...grammarFailures, ...paintFailures, ...soundFailures,
    ...connectionModalFailures];
report.dosChunk.boundaryFailures = dosFailures;
report.optionalCodeMirrorGrammars.boundaryFailures = grammarFailures;
report.lazyPaintEditor.boundaryFailures = paintFailures;
report.lazySoundTab.boundaryFailures = soundFailures;
report.lazyConnectionModal.boundaryFailures = connectionModalFailures;
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
console.log(`Optional CodeMirror grammars: ${(report.optionalCodeMirrorGrammars.sourceBytes / 1024).toFixed(1)} KiB ` +
    `source, ${(report.optionalCodeMirrorGrammars.emittedBytes / 1024).toFixed(1)} KiB emitted in ` +
    `${report.optionalCodeMirrorGrammars.files.join(', ') || 'missing assets'}`);
console.log(`Lazy paint editor: ${(report.lazyPaintEditor.sourceBytes / 1024).toFixed(1)} KiB source, ` +
    `${(report.lazyPaintEditor.emittedBytes / 1024).toFixed(1)} KiB emitted in ` +
    `${report.lazyPaintEditor.files.join(', ') || 'missing assets'}`);
console.log(`Lazy Sound tab: ${(report.lazySoundTab.sourceBytes / 1024).toFixed(1)} KiB source, ` +
    `${(report.lazySoundTab.emittedBytes / 1024).toFixed(1)} KiB emitted in ` +
    `${report.lazySoundTab.files.join(', ') || 'missing assets'}`);
console.log(`Lazy connection modal: ${(report.lazyConnectionModal.sourceBytes / 1024).toFixed(1)} KiB source, ` +
    `${(report.lazyConnectionModal.emittedBytes / 1024).toFixed(1)} KiB emitted in ` +
    `${report.lazyConnectionModal.files.join(', ') || 'missing assets'}`);
for (const failure of failures) console.error(`FAIL: ${failure}`);
// The first hosted P6 receipt names the existing graph before a split is
// chosen. Turn this into a ratchet only after that evidence is documented.
if (failures.length && process.env.I8086_ENFORCE_WEBPACK_BOUNDARY === '1') process.exitCode = 1;
