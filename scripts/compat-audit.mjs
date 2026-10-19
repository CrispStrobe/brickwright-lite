#!/usr/bin/env node
/** Inspect MakeCode sources/exports and Scratch .sb3 projects.
 *
 * This is deliberately an audit, not a claim of semantic equivalence. A source
 * that parses can still behave differently; the report keeps those gates apart.
 * Ported from the parked Codex WIP (task F1 of docs/OPEN-TASKS-2026-09-29.md);
 * the corpus it is run over lives outside this repository (docs/COMPATIBILITY-AUDIT.md).
 * TurboWarp is clean-room only: the .sb3 mode is a Scratch-format check, with no
 * TurboWarp-specific cases and no TurboWarp-sourced inputs.
 * Usage: node scripts/compat-audit.mjs [--target microbit|arcade] [--out report.json]
 *        [--corpus-commit SHA] [--compile] [--prepare-extensions] [--fetch-extensions] [--execute] [--context-catalogue FILE] [--context-root ID=directory] [--limit N] file-or-directory [...]
 */
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import JSZip from 'jszip';
import {importArtefact} from '../overlay/scratch-gui/src/lib/bw-makecode/index.js';
import {auditConversionSubject, conversionObservationGraph, conversionException} from './lib/conversion-audit-core.mjs';
import {compactConversionObservationGraph} from './lib/conversion-audit-core.mjs';
import {openConversionCatalogue} from './lib/conversion-context-inputs.mjs';


// Report identity contains hashes and declared public identities, never host paths.
function snapshotIdentity () {
    const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
    const git = args => {
        const result = spawnSync('git', args, {cwd: root, encoding: 'utf8'});
        return result.status === 0 ? result.stdout.trim() : null;
    };
    const sha256 = value => createHash('sha256').update(value).digest('hex');
    const diff = git(['diff', '--binary', 'HEAD']);
    const status = git(['status', '--porcelain', '--untracked-files=normal']);
    const readJSON = name => {
        try { return JSON.parse(fs.readFileSync(path.join(root, name), 'utf8')); }
        catch { return null; }
    };
    return {source: {commit: git(['rev-parse', 'HEAD']), dirty: status === null ? null : !!status,
        trackedDiffSha256: diff === null ? null : sha256(diff),
        statusSha256: status === null ? null : sha256(status),
        untrackedInputs: 'contents not covered by trackedDiffSha256 or statusSha256'},
    vendorPins: readJSON('vendor-pins.json'),
    makecodeVersions: readJSON('packages/scratch-gui/static/makecode/VERSIONS.json'),
    node: process.version};
}

// Capture before collecting or processing corpus inputs. Never replace this with
// the final HEAD: a long audit may span unrelated commits in its checkout.
// Initialized after optional compiler acquisition below; selected compiler
// module-load failures precede provenance/input work, as in the original CLI.
let invocationAt;
let invocationIdentity;

function auditProvenance (files, corpusCommit) {
    const sha256 = value => createHash('sha256').update(value).digest('hex');
    let unreadableFiles = 0;
    const inputHashes = files.map(file => {
        try { return sha256(fs.readFileSync(file)); }
        catch { unreadableFiles++; return 'unreadable'; }
    }).sort();
    return {...invocationIdentity, invocationAt,
        corpus: {declaredCommit: corpusCommit || null, commitVerified: false,
            fileCount: files.length, unreadableFiles, contentMultisetSha256: sha256(JSON.stringify(inputHashes))}};
}

function finishProvenance (provenance) {
    const endIdentity = snapshotIdentity();
    return {...provenance, completedAt: new Date().toISOString(),
        endIdentity,
        changeDetection: {
            sourceChanged: JSON.stringify(provenance.source) !== JSON.stringify(endIdentity.source),
            vendorPinsChanged: JSON.stringify(provenance.vendorPins) !== JSON.stringify(endIdentity.vendorPins),
            makecodeVersionsChanged: JSON.stringify(provenance.makecodeVersions) !== JSON.stringify(endIdentity.makecodeVersions),
            boundary: 'Endpoint comparison only; transient edits and untracked file contents are not verified.'
        }};
}

// Public summaries redact paths, URLs and credential-shaped strings. Full diagnostics remain in JSON.
function publicText (value) {
    return String(value).replace(/(?:https?:\/\/|data:)[^\s|]+/g, '[URL omitted]')
        .replace(/(?:[A-Za-z]:[\\/]|\/(?:home|mnt|tmp|Users|var|root|opt)\/)[^\s|]+/g, '[path omitted]')
        .replace(/(?:gh[pousr]_|github_pat_)[A-Za-z0-9_]+/g, '[credential omitted]');
}

function rankGaps (rows, elements) {
    const families = new Map();
    for (const [index, row] of rows.entries()) {
        for (const element of elements(row)) {
            const key = String(element);
            if (!families.has(key)) families.set(key, {family: key, projects: new Set(), occurrences: 0});
            const item = families.get(key);
            item.projects.add(index);
            item.occurrences++;
        }
    }
    return [...families.values()].map(item => ({family: item.family,
        affectedProjects: item.projects.size, occurrences: item.occurrences}))
        .sort((a, b) => b.affectedProjects - a.affectedProjects ||
            b.occurrences - a.occurrences || a.family.localeCompare(b.family));
}

const supported = new Set(['.ts', '.hex', '.uf2', '.elf', '.sb3', '.mkcd', '.pxt']);
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
let corpusCommit = null;
let markdown = null;
let doCompile = false;
let fetchExtensions = false;
let prepareExtensions = false;
let execute = false;
let limit = Infinity;
let contextCatalogue = null;
const contextRoots = Object.create(null);
const inputs = [];
for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--context-catalogue') contextCatalogue = args[++i];
    else if (a === '--context-root') {
        const value = args[++i]; const at = value?.indexOf('=') ?? -1;
        if (at <= 0 || !value.slice(at + 1) || Object.hasOwn(contextRoots, value.slice(0, at))) throw new Error('--context-root requires a unique ID=directory');
        contextRoots[value.slice(0, at)] = value.slice(at + 1);
    }
    else if (a === '--target') target = args[++i];
    else if (a === '--corpus-commit') corpusCommit = args[++i];
    else if (a === '--out') out = args[++i];
    else if (a === '--markdown') markdown = args[++i];
    else if (a === '--limit') limit = Number(args[++i]);
    else if (a === '--compile') doCompile = true;
    else if (a === '--fetch-extensions') fetchExtensions = true;
    else if (a === '--prepare-extensions') prepareExtensions = true;
    else if (a === '--execute') execute = true;
    else if (a.startsWith('-')) throw new Error(`unknown option ${a}`);
    else inputs.push(a);
}
const compiler = doCompile || prepareExtensions || execute ? await import('./lib/pxt-node.mjs') : null;
const {compile, hasRuntime} = compiler || {};
invocationAt = new Date().toISOString();
invocationIdentity = snapshotIdentity();
if ((!inputs.length && !contextCatalogue) || !['microbit', 'arcade', 'calliopemini', 'ev3', 'adafruit'].includes(target) ||
    !Number.isFinite(limit) && limit !== Infinity || limit < 0) {
    console.error('usage: node scripts/compat-audit.mjs [--target microbit|arcade] [--out report.json] [--markdown report.md] [--corpus-commit SHA] [--compile] [--prepare-extensions] [--fetch-extensions] [--execute] [--context-catalogue FILE] [--context-root ID=directory] [--limit N] file-or-directory [...]');
    process.exit(2);
}

function collect (name) {
    const stat = fs.statSync(name);
    if (stat.isDirectory()) return fs.readdirSync(name).sort().flatMap(f => collect(path.join(name, f)));
    return supported.has(path.extname(name).toLowerCase()) ||
        (inputs.includes(name) && path.extname(name).toLowerCase() === '.png') ? [name] : [];
}

if (fetchExtensions && !doCompile && !prepareExtensions) throw new Error('--fetch-extensions requires --compile or --prepare-extensions');

if (corpusCommit !== null && !/^[a-f0-9]{40}$/i.test(corpusCommit)) throw new Error('--corpus-commit requires a full immutable commit SHA');
const files = [...new Set(inputs.flatMap(collect))].slice(0, limit);
const contexts = contextCatalogue ? openConversionCatalogue(contextCatalogue, {roots: contextRoots}) : null;
const selectedContexts = contexts ? contexts.subjects.slice(0, Math.max(0, limit - files.length)) : [];
if (contexts && args.includes('--target') && selectedContexts.some(subject => subject.target !== target)) throw new Error('--target differs from context target');
const provenance = auditProvenance(contextCatalogue ? [...files, contextCatalogue] : files, corpusCommit);
if (contexts) provenance.contextCatalogue = {sha256: contexts.catalogueSHA256, selectedSubjects: selectedContexts,
    scope: 'Exact local catalogue inputs; retained original compiler outcomes are data. Fresh compiler/runtime work occurs only under explicit flags.'};
const rows = [];
const tally = {};
const normalize = e => String(e?.message || e).slice(0, 350);

// Missing offline package inputs are an unavailable original-compiler gate,
// not a TypeScript diagnostic. Preserve the compiler's typed dependency list.
const compileFailure = error => error?.code === 'NO_EXTENSION' ?
    {status: 'unavailable', reason: normalize(error), code: error.code, extensions: Array.from(error.extensions || [], String), refused: error.refused || [], fetchedExtensions: error.fetchedExtensions || []} :
    {status: 'fail', reason: normalize(error)};

function conversionRow (file, format, observation) {
    const row = {file, format, target: observation.target || target,
        sourceRecovered: !!observation.sourceRecovered, translated: !!observation.translated,
        unsupported: observation.unsupported || [], stage: observation.stage,
        conversion: compactConversionObservationGraph(observation)};
    if (observation.blockCount !== undefined) row.blockCount = observation.blockCount;
    if (observation.import.status === 'throw') row.reason = normalize(observation.import.exception.actual);
    else if (observation.creator.status === 'throw') row.reason = normalize(observation.creator.exception.actual);
    else if (row.stage === 'source-only') row.reason = `no blocks translator for ${row.target}`;
    return row;
}

async function makecode (file) {
    const ext = path.extname(file).toLowerCase();
    let imported;
    let observed;
    let preCompile = null;
    if (ext === '.ts') {
        const source = fs.readFileSync(file, 'utf8');
        const dependencies = target === 'arcade' ? {device: '*'} :
            target === 'microbit' ? {core: '*', radio: '*', microphone: '*'} : {core: '*'};
        const projectFiles = {'main.ts': source,
            'pxt.json': JSON.stringify({name: path.basename(file, ext), dependencies, files: ['main.ts']})};
        if (doCompile && hasRuntime(target)) {
            try {
                const result = await compile(target, projectFiles, {fetchExtensions});
                preCompile = {status: result.success ? 'pass' : 'fail', fetchedExtensions: result.fetchedExtensions || [],
                    diagnostics: (result.diagnostics || []).slice(0, 10).map(d =>
                        `${d.file}:${d.line + 1}: ${d.message}`)};
            } catch (error) { preCompile = compileFailure(error); }
        }
        observed = await auditConversionSubject({kind: 'RAW_BASELINE', id: file, target,
            name: path.basename(file, ext), files: projectFiles});
        imported = observed.import.status === 'return' ? observed.import.value : null;
        if (!imported) return {...conversionRow(file, 'typescript', observed), compile: preCompile};
    } else {
        imported = await importArtefact(new Uint8Array(fs.readFileSync(file)), {name: path.basename(file)});
        observed = await auditConversionSubject({kind: 'IMPORTED_ARTEFACT', id: file, target,
            name: path.basename(file), imported});
    }
    const row = conversionRow(file, ext === '.ts' ? 'typescript' : imported.format, observed);
    if (row.stage === 'source-only') return row;
    return applyOptionalGates(row, imported, preCompile);
}

async function applyOptionalGates (row, imported, preCompile = null) {
    row.staticTranslation = {status: row.stage};
    if (prepareExtensions && row.target === 'arcade') {
        try {
            if (!imported.files?.['pxt.json']) throw new Error('Preparation requires complete original project files');
            const {auditPreparedArcade} = await import('./lib/arcade-prepared-audit.mjs');
            row.preparedTranslation = (await auditPreparedArcade(imported.files, {fetchExtensions})).report;
        } catch (error) {
            row.preparedTranslation = {stage:'preparation-failed',reason:normalize(error),
                code:error.code || null,extensions:error.extensions || [],refused:error.refused || [],
                boundary:'Preparation failure retained separately from the unchanged raw translation.'};
        }
    }
    if (doCompile && preCompile) row.compile = preCompile;
    else if (doCompile) {
        if (!hasRuntime(row.target)) row.compile = {status: 'unavailable', reason: 'run npm run sync:makecode'};
        else if (!imported.files?.['pxt.json']) row.compile = {status: 'unavailable', reason: 'no complete MakeCode project files'};
        else {
            try {
                const result = await compile(row.target, imported.files, {fetchExtensions});
                row.compile = {status: result.success ? 'pass' : 'fail', fetchedExtensions: result.fetchedExtensions || [],
                    diagnostics: (result.diagnostics || []).slice(0, 10).map(d => `${d.file}:${d.line + 1}: ${d.message}`)};
            } catch (error) { row.compile = compileFailure(error); }
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
                // The imported artwork rides along exactly as the importer GUI
                // applies it (pseudocode-importer.jsx `uploads`); without it every
                // Arcade image read fails and the run measures the harness.
                const run = await runProgram(imported.code, {frames: 24,
                    uploads: imported.costumes || [], storage: true});
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
    let blocks = 0;
    for (const t of project.targets || []) {
        for (const b of Object.values(t.blocks || {})) {
            if (!b || typeof b !== 'object' || !b.opcode) continue;
            blocks++;
            opcodes.add(b.opcode);
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
        builtinOpcodes: builtinOpcodes.map(m => m.opcode),
        missingOpcodes: missing.filter(m => !m.url),
        externalOpcodes: missing.filter(m => m.url),
        probeErrors: check.errors,
        stage: 'parsed'};
    if (row.missingAssets.length) row.stage = 'missing-assets';
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
        row.staticTranslation ||= {status: row.stage};
        row.qualification = {staticTranslation: row.staticTranslation.status,
            originalCompile: row.compile?.status || 'not-requested',
            runtimeSmoke: row.execution?.status || (execute ? 'not-run' : 'not-requested'),
            behavioralEquivalence: 'not-measured'};
        rows.push(row);
        tally[row.stage] = (tally[row.stage] || 0) + 1;
    } catch (error) {
        rows.push({file, stage: 'read-failed', reason: normalize(error),
            observationFailure: conversionObservationGraph(conversionException(error))});
        tally['read-failed'] = (tally['read-failed'] || 0) + 1;
    }
}
// Contexts share the exact public conversion/classification operation above.
// Original compiler data is retained independently, including failed originals.
for (let index = 0; index < selectedContexts.length; index++) {
    const identity = selectedContexts[index];
    try {
        const subject = contexts.loadSubject(index);
        const observed = await auditConversionSubject(subject);
        let row = conversionRow(identity.id, 'retained-context', observed);
        if (observed.import.status === 'return' && row.stage !== 'source-only') {
            row = await applyOptionalGates(row, observed.import.value);
        }
        row.context = {id: identity.id, kind: identity.kind, originalCompile: subject.originalCompile,
            provenance: subject.provenance};
        row.staticTranslation ||= {status: row.stage};
        row.qualification = {staticTranslation: row.stage, originalCompile: row.compile?.status || 'retained-original-data',
            runtimeSmoke: row.execution?.status || (execute ? 'not-run' : 'not-requested'), behavioralEquivalence: 'not-measured'};
        rows.push(row); tally[row.stage] = (tally[row.stage] || 0) + 1;
    } catch (error) {
        rows.push({file: identity.id, stage: 'read-failed', reason: normalize(error),
            observationFailure: conversionObservationGraph(conversionException(error))});
        tally['read-failed'] = (tally['read-failed'] || 0) + 1;
    }
}
if (contexts) provenance.contextCatalogue.consumedInputBytes = contexts.consumedInputBytes();
const report = {schema: 'brickwright/compat-audit/v1', outputEncoding: out?.endsWith('.json.gz') ? 'gzip-json' : 'utf8-json', generatedAt: new Date().toISOString(),
    provenance: finishProvenance(provenance),
    compilerPolicy: {extensionFetching: fetchExtensions ? 'explicitly-enabled' : 'offline',
        preparedInputs: prepareExtensions ? 'separately-audited' : 'not-requested'},
    preparedTally: rows.reduce((counts,row)=>{
        const status=row.preparedTranslation?.stage;
        if(status)counts[status]=(counts[status] || 0)+1;
        return counts;
    },{}),
    qualificationBoundary: 'Static translation, original compilation, and runtime smoke are independent; stepped is not behavioral equivalence.',
    gapRanking: rankGaps(rows, row => [
        ...(row.unsupported || []).map(x => `${row.target}: ${x}`),
        ...(row.missingOpcodes || []).map(x => `scratch: ${x.opcode}`),
        ...(['parse-failed', 'read-failed'].includes(row.stage) ? [row.stage] : [])
    ]), count: rows.length, tally, rows};
if (out) {
    const json = `${JSON.stringify(report, null, 2)}\n`;
    // Explicit output name opts into full lossless compression, never row/field omission.
    if (out.endsWith('.json.gz')) {
        const {gzipSync} = await import('node:zlib');
        fs.writeFileSync(out, gzipSync(Buffer.from(json, 'utf8')));
    } else fs.writeFileSync(out, json);
}
if (markdown) {
    const counts = values => {
        const map = new Map();
        for (const value of values) map.set(value, (map.get(value) || 0) + 1);
        return [...map].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    };
    const escape = value => publicText(value).replaceAll('|', '\\|').replaceAll('\n', ' ');
    const table = entries => entries.length ? entries.map(([value, n]) => `| ${n} | ${escape(value)} |`).join('\n') : '| 0 | none |';
    const problems = rows.flatMap(r => (r.unsupported || []).map(x => `${r.target}: ${x}`));
    const missing = rows.flatMap(r => (r.missingOpcodes || []).map(x => x.opcode));
    const unverified = rows.flatMap(r => (r.externalOpcodes || []).map(x => x.opcode));
    const external = rows.flatMap(r => Object.entries(r.extensionURLs || {})
        .filter(([id]) => (r.externalOpcodes || []).some(x => x.opcode.startsWith(`${id}_`)))
        .map(([id]) => id));
    const failed = rows.filter(r => r.reason || r.compile?.status === 'fail' ||
        ['failed', 'block-error', 'no-green-flag-thread'].includes(r.execution?.status));
    const lines = ['# Conversion compatibility audit', '',
        `Generated ${report.generatedAt}; ${rows.length} files. A parsed project has not necessarily run correctly.`, '',
        `Source commit: ${report.provenance.source.commit}; dirty: ${report.provenance.source.dirty}. Corpus declared commit: ${corpusCommit || 'not supplied'} (not independently verified).`, '',
        `Endpoint source changed during run: ${report.provenance.changeDetection.sourceChanged}; vendor pins changed: ${report.provenance.changeDetection.vendorPinsChanged}; MakeCode versions changed: ${report.provenance.changeDetection.makecodeVersionsChanged}.`, '',
        'Runtime smoke only steps 24 frames. Behavioral equivalence is not measured.', '',
        '## Gap ranking by affected projects', '', '| projects | occurrences | family |', '|---:|---:|---|',
        ...report.gapRanking.map(g => `| ${g.affectedProjects} | ${g.occurrences} | ${escape(g.family)} |`), '',
        '| count | stage |', '|---:|---|', table(counts(rows.map(r => r.stage))), '',
        '## Unsupported MakeCode elements', '', '| occurrences | element |', '|---:|---|', table(counts(problems)), '',
        '## Missing Scratch opcodes', '', '| occurrences | opcode |', '|---:|---|', table(counts(missing)), '',
        '## External extensions requiring runtime validation or an offline implementation', '',
        '| projects | extension |', '|---:|---|', table(counts(external)), '',
        '### Their unverified opcodes', '', '| projects | opcode |', '|---:|---|', table(counts(unverified)), '',
        '## Failures and execution limits', '', '| file | result |', '|---|---|',
        ...failed.map(r => `| input ${rows.indexOf(r) + 1} | ${escape(r.reason ? `${r.stage}; full diagnostic in private JSON` :
            r.compile?.status || r.execution?.status ||
            [r.execution?.status, r.execution?.errors?.[0]].filter(Boolean).join(': '))} |`),
        ...(failed.length ? [] : ['| none | none |']), ''];
    fs.writeFileSync(markdown, lines.join('\n'));
}
console.log(JSON.stringify({count: report.count, tally, preparedTally:report.preparedTally, report: out}, null, 2));
process.exitCode = rows.some(r => ['read-failed', 'parse-failed', 'missing-assets', 'unsupported-blocks'].includes(r.stage) ||
    ['preparation-failed','parse-failed'].includes(r.preparedTranslation?.stage)) ? 1 : 0;
