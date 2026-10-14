#!/usr/bin/env node
/**
 * Capture what the Arcade importer is ASKED to translate while its own tests
 * run, as the input corpus of test/dialect-arcade-import-lines.test.mjs
 * (task E9 of docs/OPEN-TASKS-2026-09-29.md).
 *
 * WHY INPUTS. E0 froze the importer's OUTPUT (the parked WIP's, 2026-10-05),
 * so the gate kept measuring a translator that no longer existed: E1 and E9
 * changed what is written, the frozen text did not move. Inputs are
 * translated again by the test with the importer of the tree it runs in, so
 * a change to the importer is measured where it lands.
 *
 * HOW. Each test/makecode-arcade-*.test.mjs and makecode-export-arcade*.test.mjs
 * file runs in its own node process with a module hook (below) that wraps
 * arcadeToPseudocode and appends {test, files, opts} to a JSON-lines file.
 * Distinct inputs are kept, in test-file order, first occurrence first.
 * The Arcade runtime (npm run sync:makecode) should be synced, or the files
 * that skip without it translate nothing.
 *
 *   node scripts/capture-arcade-import-corpus.mjs            # rewrite the fixture
 *   node scripts/capture-arcade-import-corpus.mjs --out x.json
 */
import {spawnSync} from 'node:child_process';
import {readdirSync, readFileSync, writeFileSync, mkdtempSync, rmSync, existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

const HOOK = `
import {register} from 'node:module';
register('data:text/javascript,' + encodeURIComponent(${JSON.stringify(`
export async function load (url, context, next) {
    const result = await next(url, context);
    if (!url.endsWith('/bw-makecode/arcade-translate.js')) return result;
    let source = String(result.source);
    const head = 'export function arcadeToPseudocode (files, opts = {}) {';
    if (!source.includes(head)) throw new Error('capture hook: arcadeToPseudocode not found');
    source = source.replace(head, 'function __captureInner (files, opts = {}) {') +
        '\\nimport {appendFileSync as __captureAppend} from "node:fs";' +
        '\\nexport function arcadeToPseudocode (files, opts = {}) {' +
        '\\n    __captureAppend(process.env.ARCADE_IMPORT_CAPTURE, JSON.stringify({test: process.env.ARCADE_IMPORT_TEST, files, opts}) + "\\\\n");' +
        '\\n    return __captureInner(files, opts);\\n}\\n';
    return {...result, source, shortCircuit: true};
}`)}));
`;

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outArg = process.argv.indexOf('--out');
const OUT = outArg > 0 ? path.resolve(process.argv[outArg + 1]) :
    path.join(ROOT, 'test/fixtures/makecode/arcade-import-inputs.json');

const files = readdirSync(path.join(ROOT, 'test'))
    .filter(f => /^makecode-(arcade-.*|export-arcade.*)\.test\.mjs$/.test(f)).sort();
const work = mkdtempSync(path.join(tmpdir(), 'arcade-capture-'));
const hook = path.join(work, 'hook.mjs');
writeFileSync(hook, HOOK);
const log = path.join(work, 'inputs.jsonl');
writeFileSync(log, '');
const failed = [];
try {
    for (const f of files) {
        const r = spawnSync(process.execPath, ['--import', pathToFileURL(hook).href, '--test', '--test-concurrency=1', path.join('test', f)],
            {cwd: ROOT, env: {...process.env, ARCADE_IMPORT_CAPTURE: log, ARCADE_IMPORT_TEST: f}, encoding: 'utf8', maxBuffer: 1 << 28});
        const skipped = /^# skipped (\d+)/m.exec(r.stdout || '')?.[1];
        process.stdout.write(`${f}: exit ${r.status}${skipped && skipped !== '0' ? `, ${skipped} skipped` : ''}\n`);
        if (r.status !== 0) failed.push(f);
    }
    const seen = new Set();
    const inputs = [];
    for (const line of readFileSync(log, 'utf8').split('\n')) {
        if (!line) continue;
        const row = JSON.parse(line);
        const key = JSON.stringify([row.files, row.opts]);
        if (seen.has(key)) continue;
        seen.add(key);
        inputs.push(row);
    }
    // A project's files are often translated more than once (under other
    // names, by other files): each distinct file set is stored once.
    const sources = [];
    const sourceIndex = new Map();
    for (const input of inputs) {
        const key = JSON.stringify(input.files);
        if (!sourceIndex.has(key)) {
            sourceIndex.set(key, sources.length);
            sources.push(input.files);
        }
        input.files = sourceIndex.get(key);
    }
    const head = {
        _comment: 'Every distinct input the Arcade importer (arcadeToPseudocode) was given while the listed test files ran: ' +
            '{test, files: index into sources, opts}. Written by scripts/capture-arcade-import-corpus.mjs; read by ' +
            'test/dialect-arcade-import-lines.test.mjs, which translates each input again with the importer of its own tree.',
        testFiles: files,
        testFilesTranslating: new Set(inputs.map(i => i.test)).size
    };
    // One input or source per line, so a recapture diffs by line.
    const body = JSON.stringify(head).slice(0, -1) +
        `,\n"inputs": [\n${inputs.map(i => JSON.stringify(i)).join(',\n')}\n],` +
        `\n"sources": [\n${sources.map(f => JSON.stringify(f)).join(',\n')}\n]}\n`;
    JSON.parse(body);
    writeFileSync(OUT, body);
    process.stdout.write(`${inputs.length} distinct inputs from ${head.testFilesTranslating} of ${files.length} files → ${path.relative(ROOT, OUT)}\n`);
    if (failed.length) {
        process.stderr.write(`red while capturing (the corpus is still written): ${failed.join(', ')}\n`);
        process.exitCode = 1;
    }
} finally {
    if (existsSync(work)) rmSync(work, {recursive: true, force: true});
}
