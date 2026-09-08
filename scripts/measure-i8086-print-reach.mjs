#!/usr/bin/env node
// N2d measurement: the exact gallery reach of an i8086 C numeric-output boundary.
//
// This deliberately measures three different facts. A source line is not proof
// that parsing made a block; a block is not proof that DEVICE C emitted output;
// and an implemented print helper is not proof that another choke does not still
// own the program. Keeping those layers separate prevents a comment-only `say`
// from being counted as working output.
//
//   node scripts/measure-i8086-print-reach.mjs --examples <dir>
//
// The walk is parse/generate only. Compilation belongs to the later candidate
// gate on GitHub CI, not this tiny development VPS.
import {readdir, readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {
    printDependsOnNumericList
} from './lib/i8086-print-reach.mjs';

const argv = process.argv.slice(2);
const dirIdx = argv.indexOf('--examples');
if (dirIdx < 0 || !argv[dirIdx + 1]) {
    console.error('usage: measure-i8086-print-reach.mjs --examples <dir>');
    process.exit(2);
}
const examples = argv[dirIdx + 1];
const L = new URL('../overlay/scratch-gui/src/lib/', import.meta.url);
const {default: SB3Creator} = await import(new URL('sb3-creator.js', L).href);

const asText = result => {
    if (typeof result === 'string') return result;
    for (const key of ['pseudocode', 'text', 'source', 'code']) {
        if (result && typeof result[key] === 'string') return result[key];
    }
    throw new Error(`retargetPseudocode returned an object with keys ${Object.keys(result || {}).join(',')}`);
};

const emptyKinds = () => ({literalText: [], numericLiteral: [], computed: [], mixed: [], none: []});
const emptyOps = () => ({say: 0, sayForSecs: 0, print: 0, total: 0});
const emptyValues = () => ({literalText: 0, numericLiteral: 0, computed: 0});
const pushBucket = (buckets, name, kinds) => {
    const unique = [...new Set(kinds)].sort();
    buckets[unique.length === 0 ? 'none' : unique.length === 1 ? unique[0] : 'mixed'].push(name);
};
const sourceValue = text => {
    const value = text.trim();
    if (/^"[^"\n]*"$/.test(value)) return 'literalText';
    if (/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(value)) return 'numericLiteral';
    return 'computed';
};
const sourceFacts = src => {
    const operations = emptyOps();
    const values = emptyValues();
    const kinds = [];
    for (const raw of src.split(/\r?\n/)) {
        const line = raw.trim();
        let value = null;
        const print = /^print\s+(.+)$/i.exec(line);
        const sayFor = /^say\s+(.+?)\s+for\s+(.+)\s+seconds?$/i.exec(line);
        const say = !sayFor && /^say\s+(.+)$/i.exec(line);
        if (print) { operations.print++; value = print[1]; }
        else if (sayFor) { operations.sayForSecs++; value = sayFor[1]; }
        else if (say) { operations.say++; value = say[1]; }
        if (value === null) continue;
        operations.total++;
        const kind = sourceValue(value);
        values[kind]++;
        kinds.push(kind);
    }
    return {operations, values, kinds};
};

const inputKind = (block, key) => {
    if (block.opcode === 'stc12_print' && block.fields &&
        block.fields.MODE && block.fields.MODE[0] === 'text') return 'literalText';
    const input = block.inputs && block.inputs[key];
    const inner = Array.isArray(input) ? input[1] : null;
    if (!Array.isArray(inner)) return 'computed';
    const type = inner[0];
    if (type === 10) return 'literalText';
    if (type >= 4 && type <= 8 && Number.isFinite(Number(inner[1]))) return 'numericLiteral';
    return 'computed';
};
const opcodeFacts = project => {
    const operations = emptyOps();
    const values = emptyValues();
    const kinds = [];
    const computedForms = [];
    for (const target of project.targets || []) {
        const blocks = target.blocks || {};
        for (const block of Object.values(blocks)) {
            let key = null;
            if (block.opcode === 'looks_say') { operations.say++; key = 'MESSAGE'; }
            else if (block.opcode === 'looks_sayforsecs') { operations.sayForSecs++; key = 'MESSAGE'; }
            else if (block.opcode === 'stc12_print') { operations.print++; key = 'VALUE'; }
            if (key === null) continue;
            operations.total++;
            const kind = inputKind(block, key);
            values[kind]++;
            kinds.push(kind);
            if (kind === 'computed') {
                const input = block.inputs && block.inputs[key];
                const inner = Array.isArray(input) ? input[1] : null;
                if (Array.isArray(inner) && (inner[0] === 12 || inner[0] === 13)) {
                    computedForms.push(inner[0] === 12 ? 'variable' : 'list');
                } else if (typeof inner === 'string') {
                    computedForms.push(blocks[inner] ? blocks[inner].opcode : 'missing-reporter');
                } else {
                    computedForms.push('unknown');
                }
            }
        }
    }
    return {operations, values, kinds, computedForms};
};

const addCounts = (into, from) => {
    for (const key of Object.keys(into)) into[key] += from[key];
};
const terminal = {
    retargetRefused: [], parseFailed: [], noOutputOpcode: [], hostC: [],
    printRefused: [], remainingChoke: [], waitRefused: [], int16Refused: [], longLeaked: [],
    emitted: [], commentOnly: []
};
const currentOutput = {notReached: [], hostC: [], refused: [], emitted: [], commentOnly: []};
const remainingChokeOverlap = {};
const chokeCombinations = {};
const computedFormRows = {};
const numericListDependencyEvidence = {};
const printRefusalEvidence = {};
const source = {operations: emptyOps(), values: emptyValues(), programBuckets: emptyKinds()};
const opcode = {operations: emptyOps(), values: emptyValues(), programBuckets: emptyKinds()};

const entries = (await readdir(examples, {withFileTypes: true}))
    .filter(entry => entry.isDirectory()).map(entry => entry.name).sort();
let programs = 0;
for (const name of entries) {
    let src;
    try { src = await readFile(join(examples, name, 'program.bw'), 'utf8'); } catch { continue; }
    programs++;
    const sf = sourceFacts(src);
    addCounts(source.operations, sf.operations);
    addCounts(source.values, sf.values);
    pushBucket(source.programBuckets, name, sf.kinds);

    let retargeted;
    try {
        const result = SB3Creator.retargetPseudocode(src, 'stc12c5a60s2');
        if (result && result.ok === false) {
            const reason = (result.reasons || ['?'])[0];
            terminal.retargetRefused.push(`${name}: ${reason}`.slice(0, 180));
            if (sf.operations.total) currentOutput.notReached.push(name);
            continue;
        }
        retargeted = asText(result).replace(/^DEVICE .*$/m, 'DEVICE i8086');
    } catch (error) {
        terminal.retargetRefused.push(`${name}: ${String(error.message || error).split('\n')[0]}`.slice(0, 180));
        if (sf.operations.total) currentOutput.notReached.push(name);
        continue;
    }

    const creator = new SB3Creator();
    let code;
    let of;
    let cWarnings = [];
    try {
        creator.parse(retargeted);
        of = opcodeFacts(creator.project);
        addCounts(opcode.operations, of.operations);
        addCounts(opcode.values, of.values);
        pushBucket(opcode.programBuckets, name, of.kinds);
        for (const form of of.computedForms) {
            if (!computedFormRows[form]) computedFormRows[form] = {
                occurrences: 0, programs: new Set(), hostOccurrences: 0,
                hostPrograms: new Set(), deviceOccurrences: 0, devicePrograms: new Set()
            };
            computedFormRows[form].occurrences++;
            computedFormRows[form].programs.add(name);
        }
        const generated = creator.generateC();
        code = typeof generated === 'string' ? generated : generated.code;
        cWarnings = (creator._cWarnings || []).map(warning => typeof warning === 'string' ? warning
            : String((warning && (warning.message || warning.text)) || JSON.stringify(warning)));
        // Parser warnings and device-C lowering warnings are intentionally
        // different channels. The latter are retained as refusal evidence.
    } catch (error) {
        terminal.parseFailed.push(`${name}: ${String(error.message || error).split('\n')[0]}`.slice(0, 180));
        if (sf.operations.total) currentOutput.notReached.push(name);
        continue;
    }

    if (of.operations.total === 0) {
        terminal.noOutputOpcode.push(name);
        if (sf.operations.total) currentOutput.notReached.push(name);
        continue;
    }
    if (/^\s*\/\*[^\n]*blocks → C \(host\)/.test(code)) {
        terminal.hostC.push(name);
        currentOutput.hostC.push(name);
        for (const form of of.computedForms) {
            computedFormRows[form].hostOccurrences++;
            computedFormRows[form].hostPrograms.add(name);
        }
        continue;
    }
    for (const form of of.computedForms) {
        computedFormRows[form].deviceOccurrences++;
        computedFormRows[form].devicePrograms.add(name);
    }

    // Keep this attribution aligned with generateC's I8086_IMPLEMENTED choke.
    // N2e makes list lowering real even when another feature (ADC in smoothing)
    // still refuses the whole program; reporting numericLists here would claim
    // both "implemented" and "unsupported" for the same exact emitter.
    const implemented = new Set(['shiftOut', 'delay', 'printNumber', 'numericLists']);
    const remaining = Object.keys(creator._cUses || {})
        .filter(key => creator._cUses[key] && !implemented.has(key)).sort();
    const combination = remaining.length ? remaining.join(' + ') : 'none';
    if (!chokeCombinations[combination]) chokeCombinations[combination] = [];
    chokeCombinations[combination].push(name);
    for (const reason of remaining) {
        if (!remainingChokeOverlap[reason]) remainingChokeOverlap[reason] = [];
        remainingChokeOverlap[reason].push(name);
    }

    const refused = /^\s*\/\* No C emitted for DEVICE/.test(code);
    if (refused) currentOutput.refused.push(name);
    else if (creator._cUses && creator._cUses.printNumber) currentOutput.emitted.push(name);
    else currentOutput.commentOnly.push(name);

    if (printDependsOnNumericList(creator.project)) {
        numericListDependencyEvidence[name] = [...cWarnings];
    }
    if ((creator._cPrintRefused || []).length) {
        const reasons = [...creator._cPrintRefused];
        terminal.printRefused.push(`${name}: ${reasons.join(', ')}`);
        printRefusalEvidence[name] = {reasons, warnings: [...cWarnings]};
        continue;
    }

    if (remaining.length) {
        terminal.remainingChoke.push(`${name}: ${remaining.join(', ')}`);
        continue;
    }
    if (creator._cWaitComputed || (creator._cWaitRefused || []).length) {
        const detail = [creator._cWaitComputed ? 'computed' : '', ...(creator._cWaitRefused || [])]
            .filter(Boolean).join(', ');
        terminal.waitRefused.push(`${name}: ${detail}`);
        continue;
    }
    if ((creator._cI16Refused || []).length) {
        terminal.int16Refused.push(`${name}: ${creator._cI16Refused.join(', ')}`);
        continue;
    }
    if (/\blong\b/.test(code.replace(/\/\*[\s\S]*?\*\//g, ''))) {
        terminal.longLeaked.push(name);
        continue;
    }
    if (creator._cUses && creator._cUses.printNumber) terminal.emitted.push(name);
    else terminal.commentOnly.push(name);
}

for (const group of [source.programBuckets, opcode.programBuckets, currentOutput]) {
    for (const names of Object.values(group)) names.sort();
}
for (const names of Object.values(remainingChokeOverlap)) names.sort();
for (const names of Object.values(chokeCombinations)) names.sort();
const countMap = object => Object.fromEntries(Object.entries(object).map(([key, value]) => [key, value.length]));
const terminalCount = Object.values(terminal).reduce((sum, names) => sum + names.length, 0);
const currentOutputCount = Object.values(currentOutput).reduce((sum, names) => sum + names.length, 0);
const sourceOutputPrograms = programs - source.programBuckets.none.length;
const report = {
    schema: 'n2d-i8086-print-reach-v4', programs,
    source: {...source, programCounts: countMap(source.programBuckets)},
    opcode: {...opcode, programCounts: countMap(opcode.programBuckets)},
    currentOutput: {...currentOutput, counts: countMap(currentOutput)},
    terminal,
    terminalCounts: countMap(terminal),
    remainingChokeOverlap,
    remainingChokeCounts: countMap(remainingChokeOverlap),
    chokeCombinations,
    chokeCombinationCounts: countMap(chokeCombinations),
    computedForms: Object.fromEntries(Object.entries(computedFormRows).sort()
        .map(([form, row]) => [form, {
            occurrences: row.occurrences,
            programs: [...row.programs].sort(),
            hostOccurrences: row.hostOccurrences,
            hostPrograms: [...row.hostPrograms].sort(),
            deviceOccurrences: row.deviceOccurrences,
            devicePrograms: [...row.devicePrograms].sort()
        }])),
    numericListDependencyEvidence,
    printRefusalEvidence,
    invariants: {
        terminalCount,
        terminalExhaustive: terminalCount === programs,
        sourceProgramCount: Object.values(source.programBuckets).flat().length,
        opcodeProgramCount: Object.values(opcode.programBuckets).flat().length,
        sourceProgramExhaustive: Object.values(source.programBuckets).flat().length === programs,
        opcodeProgramExhaustive: Object.values(opcode.programBuckets).flat().length
            + terminal.retargetRefused.length + terminal.parseFailed.length === programs,
        sourceOutputPrograms,
        sourceLiteralTextPrograms: source.programBuckets.literalText.length + source.programBuckets.mixed.length,
        sourceNumericOrComputedPrograms: source.programBuckets.numericLiteral.length
            + source.programBuckets.computed.length + source.programBuckets.mixed.length,
        currentOutputCount,
        currentOutputExhaustiveForSource: currentOutputCount === sourceOutputPrograms
    }
};
console.log(JSON.stringify(report, null, 1));
