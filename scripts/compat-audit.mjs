#!/usr/bin/env node
/** Inspect MakeCode sources/exports and Scratch or TurboWarp .sb3 projects.
 *
 * This is deliberately an audit, not a claim of semantic equivalence. A source
 * that parses can still behave differently; the report keeps those gates apart.
 * Usage: node scripts/compat-audit.mjs [--target microbit|arcade] [--out report.json]
 *        [--compile] [--execute] [--limit N] file-or-directory [...]
 */
import fs from 'node:fs';
import path from 'node:path';
import JSZip from 'jszip';
import {importArtefact, importProjectFiles} from '../overlay/scratch-gui/src/lib/bw-makecode/index.js';
import {compile, hasRuntime} from './lib/pxt-node.mjs';

const supported = new Set(['.ts', '.hex', '.uf2', '.elf', '.sb3']);
const scratchBuiltins = new Set(['ev3', 'microbit', 'text2speech', 'videoSensing', 'wedo2',
    'music', 'pen', 'makeymakey']);
const corePrefix = /^(motion|looks|sound|event|control|sensing|operator|data|procedures|argument)_/;
const coreMetadata = new Set(['procedures_prototype', 'argument_reporter_string_number',
    'argument_reporter_boolean', 'looks_costume', 'looks_backdrops',
    'sensing_touchingobjectmenu', 'sensing_keyoptions', 'control_start_as_clone',
    'event_whenflagclicked', 'event_whenbroadcastreceived', 'event_whenbackdropswitchesto',
    'event_whenkeypressed', 'event_whengreaterthan', 'event_whenthisspriteclicked',
    'event_whenstageclicked']);
let exactCoreOpcodes = null;
const args = process.argv.slice(2);
let target = 'microbit';
let out = null;
let markdown = null;
let doCompile = false;
let execute = false;
let limit = Infinity;
const inputs = [];
for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--target') target = args[++i];
    else if (a === '--out') out = args[++i];
    else if (a === '--markdown') markdown = args[++i];
    else if (a === '--limit') limit = Number(args[++i]);
    else if (a === '--compile') doCompile = true;
    else if (a === '--execute') execute = true;
    else if (a.startsWith('-')) throw new Error(`unknown option ${a}`);
    else inputs.push(a);
}
if (!inputs.length || !['microbit', 'arcade', 'calliopemini', 'ev3', 'adafruit'].includes(target) ||
    !Number.isFinite(limit) && limit !== Infinity || limit < 0) {
    console.error('usage: node scripts/compat-audit.mjs [--target microbit|arcade] [--out report.json] [--markdown report.md] [--compile] [--execute] [--limit N] file-or-directory [...]');
    process.exit(2);
}

function collect (name) {
    const stat = fs.statSync(name);
    if (stat.isDirectory()) return fs.readdirSync(name).sort().flatMap(f => collect(path.join(name, f)));
    return supported.has(path.extname(name).toLowerCase()) ||
        (inputs.includes(name) && path.extname(name).toLowerCase() === '.png') ? [name] : [];
}

const files = [...new Set(inputs.flatMap(collect))].slice(0, limit);
const rows = [];
const tally = {};
const normalize = e => String(e?.message || e).slice(0, 350);

async function makecode (file) {
    const ext = path.extname(file).toLowerCase();
    let imported;
    let preCompile = null;
    if (ext === '.ts') {
        const source = fs.readFileSync(file, 'utf8');
        const dependencies = target === 'arcade' ? {device: '*'} :
            target === 'microbit' ? {core: '*', radio: '*', microphone: '*'} : {core: '*'};
        const projectFiles = {'main.ts': source,
            'pxt.json': JSON.stringify({name: path.basename(file, ext), dependencies, files: ['main.ts']})};
        if (doCompile && hasRuntime(target)) {
            try {
                const result = await compile(target, projectFiles);
                preCompile = {status: result.success ? 'pass' : 'fail',
                    diagnostics: (result.diagnostics || []).slice(0, 10).map(d =>
                        `${d.file}:${d.line + 1}: ${d.message}`)};
            } catch (error) { preCompile = {status: 'fail', reason: normalize(error)}; }
        }
        try { imported = importProjectFiles(projectFiles, {target, name: path.basename(file, ext)}); }
        catch (error) {
            return {file, format: 'typescript', target, stage: 'parse-failed', reason: normalize(error),
                compile: preCompile};
        }
        imported.format = 'typescript';
    } else imported = await importArtefact(new Uint8Array(fs.readFileSync(file)), {name: path.basename(file)});
    const row = {file, format: imported.format, target: imported.project?.target || target,
        sourceRecovered: !!imported.source, translated: imported.lang === 'pseudocode',
        unsupported: (imported.unsupported || []).map(String), stage: 'source'};
    if (!row.translated) {
        row.stage = 'source-only';
        row.reason = `no blocks translator for ${row.target}`;
        return row;
    }
    try {
        const {default: SB3Creator} = await import('../overlay/scratch-gui/src/lib/sb3-creator.js');
        const creator = new SB3Creator();
        creator.parse(imported.code);
        row.blockCount = creator.project.targets.reduce((n, t) => n + Object.keys(t.blocks || {}).length, 0);
        if (creator.warnings.length) {
            row.unsupported.push(...creator.warnings.map(warning => `Code to Blocks: ${warning}`));
        }
        row.stage = row.unsupported.length ? 'partial' : 'translated';
    } catch (error) {
        row.stage = 'parse-failed';
        row.reason = normalize(error);
    }
    if (doCompile && preCompile) row.compile = preCompile;
    else if (doCompile) {
        if (!hasRuntime(row.target)) row.compile = {status: 'unavailable', reason: 'run npm run sync:makecode'};
        else if (!imported.files?.['pxt.json']) row.compile = {status: 'unavailable', reason: 'no complete MakeCode project files'};
        else {
            try {
                const result = await compile(row.target, imported.files);
                row.compile = {status: result.success ? 'pass' : 'fail',
                    diagnostics: (result.diagnostics || []).slice(0, 10).map(d => `${d.file}:${d.line + 1}: ${d.message}`)};
            } catch (error) { row.compile = {status: 'fail', reason: normalize(error)}; }
        }
    }
    // A source rejected by the pinned PXT compiler cannot be counted as a
    // Brickwright translation gap in this audit. A bare .ts file may lack
    // its original extension manifest, so keep the diagnostics and use a
    // neutral stage name instead of declaring the original app invalid.
    if (row.compile?.status === 'fail' && row.compile.diagnostics?.length &&
        row.stage !== 'parse-failed') row.stage = 'pxt-compile-failed';
    if (execute && !['parse-failed', 'pxt-compile-failed'].includes(row.stage)) {
        try {
            const {runProgram, quitStrandedVMs} = await import('../test/helpers/bw-vm.mjs');
            try {
                const run = await runProgram(imported.code, {frames: 24});
                row.execution = {status: run.errors.length ? 'block-error' :
                    run.threadsStarted ? 'stepped' : 'no-green-flag-thread',
                threadsStarted: run.threadsStarted, extensionCalls: run.extensionCalls,
                variablesChanged: run.variablesChanged, errors: run.errors.slice(0, 10)};
            } finally { quitStrandedVMs(); }
        } catch (error) { row.execution = {status: 'failed', reason: normalize(error)}; }
    }
    return row;
}

async function sb3 (file) {
    const zip = await JSZip.loadAsync(fs.readFileSync(file));
    const entry = zip.file('project.json');
    if (!entry) throw new Error('missing project.json');
    const project = JSON.parse(await entry.async('string'));
    const extensions = [...new Set(project.extensions || [])];
    const extensionURLs = project.extensionURLs || {};
    const opcodes = new Set();
    const assetMissing = [];
    const unsupportedModes = [];
    let blocks = 0;
    for (const t of project.targets || []) {
        for (const b of Object.values(t.blocks || {})) {
            if (!b || typeof b !== 'object' || !b.opcode) continue;
            blocks++;
            opcodes.add(b.opcode);
            if (b.opcode === 'Encoding_menu_encode' && b.fields?.encode?.[0] !== 'Base64') {
                unsupportedModes.push(`Encoding ${b.fields.encode[0]}`);
            }
        }
        for (const a of [...(t.costumes || []), ...(t.sounds || [])]) {
            if (a.md5ext && !zip.file(a.md5ext)) assetMissing.push(a.md5ext);
        }
    }
    const {conformance, VM} = await import('../test/helpers/bw-vm.mjs');
    if (!exactCoreOpcodes) {
        const vm = new VM();
        exactCoreOpcodes = new Set(Object.keys(vm.runtime._primitives));
        vm.quit();
    }
    const check = conformance(project);
    // A missing extension opcode is not necessarily a failed load: a URL may
    // provide it. Preserve that distinction in the machine-readable report.
    const builtinOpcodes = check.missing.filter(m => scratchBuiltins.has(m.opcode.split('_')[0]));
    const missing = check.missing.filter(m => !/_menu_/.test(m.opcode) &&
        !scratchBuiltins.has(m.opcode.split('_')[0])).map(m => ({...m,
        url: extensionURLs[m.extension || m.opcode.split('_')[0]] || null}));
    for (const opcode of opcodes) {
        if (corePrefix.test(opcode) && !exactCoreOpcodes.has(opcode) && !coreMetadata.has(opcode) &&
            !/_menu$/.test(opcode) &&
            !missing.some(m => m.opcode === opcode)) missing.push({opcode, defined: false,
                implemented: false, extension: null, url: null});
    }
    const row = {file, format: 'sb3', target: 'scratch', sprites: (project.targets || []).length,
        blockCount: blocks, opcodes: [...opcodes].sort(), extensions, extensionURLs,
        missingAssets: [...new Set(assetMissing)],
        unsupportedModes: [...new Set(unsupportedModes)],
        builtinOpcodes: builtinOpcodes.map(m => m.opcode),
        missingOpcodes: missing.filter(m => !m.url),
        externalOpcodes: missing.filter(m => m.url),
        probeErrors: check.errors,
        stage: 'parsed'};
    if (row.missingAssets.length) row.stage = 'missing-assets';
    else if (row.unsupportedModes.length) row.stage = 'unsupported-mode';
    else if (row.missingOpcodes.length || row.probeErrors.length) row.stage = 'unsupported-blocks';
    else if (row.externalOpcodes.length) row.stage = 'external-extension-unverified';
    if (execute && row.stage === 'parsed') {
        let vm;
        let clearTimers;
        try {
            const harness = await import('../test/helpers/bw-vm.mjs');
            const {VM} = harness;
            clearTimers = harness.clearStrayTimers;
            vm = new VM();
            await vm.loadProject(fs.readFileSync(file));
            const errors = [];
            vm.runtime.on('BLOCKS_ERROR', e => errors.push(String(e)));
            vm.start();
            vm.greenFlag();
            const threadsStarted = vm.runtime.threads.length;
            for (let i = 0; i < 24; i++) vm.runtime._step();
            row.execution = {status: errors.length ? 'block-error' :
                threadsStarted ? 'stepped' : 'no-green-flag-thread',
            threadsStarted, errors: errors.slice(0, 10)};
        } catch (error) { row.execution = {status: 'failed', reason: normalize(error)}; }
        finally { if (vm) vm.quit(); if (clearTimers) clearTimers(); }
    }
    return row;
}

for (const file of files) {
    try {
        const row = path.extname(file).toLowerCase() === '.sb3' ? await sb3(file) : await makecode(file);
        rows.push(row);
        tally[row.stage] = (tally[row.stage] || 0) + 1;
    } catch (error) {
        rows.push({file, stage: 'read-failed', reason: normalize(error)});
        tally['read-failed'] = (tally['read-failed'] || 0) + 1;
    }
}
const report = {schema: 'brickwright/compat-audit/v1', generatedAt: new Date().toISOString(),
    count: rows.length, tally, rows};
if (out) fs.writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`);
if (markdown) {
    const counts = values => {
        const map = new Map();
        for (const value of values) map.set(value, (map.get(value) || 0) + 1);
        return [...map].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    };
    const escape = value => String(value).replaceAll('|', '\\|').replaceAll('\n', ' ');
    const displayURL = url => url.startsWith('data:') ?
        `embedded data URL (${url.length} characters; full URL in JSON report)` : url;
    const table = entries => entries.length ? entries.map(([value, n]) => `| ${n} | ${escape(value)} |`).join('\n') : '| 0 | none |';
    const problems = rows.flatMap(r => (r.unsupported || []).map(x => `${r.target}: ${x}`));
    const missing = rows.flatMap(r => (r.missingOpcodes || []).map(x => x.opcode));
    const modes = rows.flatMap(r => r.unsupportedModes || []);
    const unverified = rows.flatMap(r => (r.externalOpcodes || []).map(x => x.opcode));
    const external = rows.flatMap(r => Object.entries(r.extensionURLs || {})
        .filter(([id]) => (r.externalOpcodes || []).some(x => x.opcode.startsWith(`${id}_`)))
        .map(([id, url]) => `${id}: ${displayURL(url)}`));
    const failed = rows.filter(r => r.reason || r.compile?.status === 'fail' ||
        ['failed', 'block-error', 'no-green-flag-thread'].includes(r.execution?.status));
    const lines = ['# Conversion compatibility audit', '',
        `Generated ${report.generatedAt}; ${rows.length} files. A parsed project has not necessarily run correctly.`, '',
        '| count | stage |', '|---:|---|', table(counts(rows.map(r => r.stage))), '',
        '## Unsupported MakeCode elements', '', '| occurrences | element |', '|---:|---|', table(counts(problems)), '',
        '## Missing Scratch/TurboWarp opcodes', '', '| occurrences | opcode |', '|---:|---|', table(counts(missing)), '',
        '## Unsupported block modes', '', '| occurrences | mode |', '|---:|---|', table(counts(modes)), '',
        '## External extensions requiring runtime validation or an offline implementation', '',
        '| projects | extension and URL |', '|---:|---|', table(counts(external)), '',
        '### Their unverified opcodes', '', '| projects | opcode |', '|---:|---|', table(counts(unverified)), '',
        '## Failures and execution limits', '', '| file | result |', '|---|---|',
        ...failed.map(r => `| ${escape(r.file)} | ${escape(r.reason ||
            r.compile?.diagnostics?.[0] || r.compile?.reason || r.execution?.reason || r.execution?.status)} |`),
        ...(failed.length ? [] : ['| none | none |']), ''];
    fs.writeFileSync(markdown, lines.join('\n'));
}
console.log(JSON.stringify({count: report.count, tally, report: out}, null, 2));
process.exitCode = rows.some(r => ['read-failed', 'parse-failed', 'missing-assets', 'unsupported-blocks', 'unsupported-mode'].includes(r.stage)) ? 1 : 0;
