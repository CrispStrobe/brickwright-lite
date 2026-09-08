#!/usr/bin/env node
// N2f measurement: the complete, blocker-neutralised reach of deterministic
// integer random plus literal output on the i8086 C route.
//
// Default mode is deliberately parse/generate-only so it is safe on a small
// development VPS. `--compile` sends every unique emitted DEVICE C body
// through SmallerC and belongs in hosted CI.
import {readFile, readdir} from 'node:fs/promises';
import {dirname, join} from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath, pathToFileURL} from 'node:url';

const L = new URL('../overlay/scratch-gui/src/lib/', import.meta.url);
const emitterUrl = new URL('sb3-creator.js', L);

export const discoverCRefusalBuckets = source => [...new Set([
    ...[...source.matchAll(/\bthis\.(_c[A-Za-z0-9]*Refused)\b/g)].map(match => match[1]),
    ...[...source.matchAll(/\bthis\[\s*(['"])(_c[A-Za-z0-9]*Refused)\1\s*\]/g)].map(match => match[2])
])].sort();

export const discoverRuntimeRefusalBuckets = creator => Object.keys(creator)
    .filter(name => /^_c[A-Za-z0-9]*Refused$/.test(name)).sort();

export const enumerateRuntimeRefusals = (creator, sourceBuckets = []) => {
    const names = [...new Set([...sourceBuckets, ...discoverRuntimeRefusalBuckets(creator)])].sort();
    const values = {};
    for (const name of names) {
        const value = creator[name];
        if (value !== undefined && !Array.isArray(value)) {
            throw new TypeError(`${name} must be undefined or an array, got ${typeof value}`);
        }
        values[name] = value === undefined ? [] : [...value];
    }
    return {names, values};
};

export const assertRefusalBucketCoverage = (discovered, reported) => {
    const missing = discovered.filter(name => !reported.includes(name));
    if (missing.length) throw new Error(`refusal bucket(s) omitted by the census: ${missing.join(', ')}`);
};

// Candidate contract only; no emitter calls this function. The full-period
// 16-bit LCG is deterministic from reset. Rejection sampling, rather than `%`
// alone, keeps every inclusive integer in the normalised range equally likely.
// Equal bounds still consume one draw, so changing a bound from equal to a
// range cannot shift every later draw by an undocumented amount.
export const N2F_RNG_SEED = 0x4d3d;
export const n2fRandomInt16 = (state, from, to) => {
    for (const [label, value] of [['state', state], ['from', from], ['to', to]]) {
        if (!Number.isInteger(value)) throw new RangeError(`${label} must be an integer`);
    }
    if (state < 0 || state > 0xffff) throw new RangeError('state must fit unsigned 16 bits');
    if (from < -32768 || from > 32767 || to < -32768 || to > 32767) {
        throw new RangeError('bounds must fit signed 16 bits');
    }
    const low = Math.min(from, to);
    const high = Math.max(from, to);
    const advance = value => (Math.imul(value, 25173) + 13849) & 0xffff;
    if (low === high) return {value: low, state: advance(state), draws: 1};
    const span = high - low + 1;
    const limit = 0x10000 - (0x10000 % span);
    let next = state;
    let draws = 0;
    do {
        next = advance(next);
        draws++;
    } while (next >= limit);
    return {value: low + (next % span), state: next, draws};
};

const asText = result => {
    if (typeof result === 'string') return result;
    for (const key of ['pseudocode', 'text', 'source', 'code']) {
        if (result && typeof result[key] === 'string') return result[key];
    }
    throw new Error(`retargetPseudocode returned keys ${Object.keys(result || {}).join(',')}`);
};

export const neutraliseParsedBlockers = (project, {literal = false, random = false} = {}) => {
    const changed = {literalPrintBlockIds: [], integerRandomEdges: []};
    for (const target of project.targets || []) {
        for (const [id, block] of Object.entries(target.blocks || {})) {
            if (literal && block.opcode === 'stc12_print') {
                const inner = block.inputs && block.inputs.VALUE && block.inputs.VALUE[1];
                if (Array.isArray(inner) && inner[0] === 10 &&
                    (String(inner[1]).trim() === '' || !Number.isFinite(Number(inner[1])))) {
                    block.inputs.VALUE = [1, [4, 0]];
                    block.fields.MODE = ['number', null];
                    changed.literalPrintBlockIds.push(id);
                }
            }
        }
        if (random) {
            const randomInputs = new Map(Object.entries(target.blocks || {})
                .filter(([, block]) => block.opcode === 'operator_random')
                .map(([id, block]) => [id, structuredClone(block.inputs && block.inputs.FROM)]));
            for (const [consumerBlockId, block] of Object.entries(target.blocks || {})) {
                for (const [inputName, input] of Object.entries(block.inputs || {})) {
                    const reporterId = Array.isArray(input) && typeof input[1] === 'string' ? input[1] : null;
                    if (!randomInputs.has(reporterId)) continue;
                    block.inputs[inputName] = structuredClone(randomInputs.get(reporterId));
                    changed.integerRandomEdges.push({
                        randomBlockId: reporterId,
                        consumerBlockId,
                        inputName
                    });
                }
            }
        }
    }
    changed.literalPrintBlockIds.sort();
    changed.integerRandomEdges.sort((a, b) =>
        `${a.randomBlockId}:${a.consumerBlockId}:${a.inputName}`
            .localeCompare(`${b.randomBlockId}:${b.consumerBlockId}:${b.inputName}`));
    return changed;
};

const noC = code => /^\s*\/\* No C emitted for DEVICE/m.test(code);
const hostC = code => /^\s*\/\*[^\n]*blocks → C \(host\)/m.test(code);

const stableSeed = text => {
    let value = 2166136261;
    for (const char of text) value = Math.imul(value ^ char.charCodeAt(0), 16777619);
    return value >>> 0;
};

const parseWithStableIds = (creator, source, seedText) => {
    let state = stableSeed(seedText);
    const previous = Math.random;
    Math.random = () => {
        state = (state + 0x6d2b79f5) >>> 0;
        let value = state;
        value = Math.imul(value ^ (value >>> 15), value | 1);
        value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
        return ((value ^ (value >>> 14)) >>> 0) / 0x100000000;
    };
    try { creator.parse(source); } finally { Math.random = previous; }
};

export const analyzeProgram = (SB3Creator, source, refusalBuckets, neutralisation = {}, seedText = source) => {
    let retargeted;
    try {
        const result = SB3Creator.retargetPseudocode(source, 'stc12c5a60s2');
        if (result && result.ok === false) {
            return {outcome: 'retargetRefused', reasons: result.reasons || []};
        }
        retargeted = asText(result).replace(/^DEVICE .*$/m, 'DEVICE i8086');
    } catch (error) {
        return {outcome: 'retargetRefused', reasons: [String(error.message || error)]};
    }
    const creator = new SB3Creator();
    let code;
    let neutralised;
    try {
        parseWithStableIds(creator, retargeted, seedText);
        neutralised = neutraliseParsedBlockers(creator.project, neutralisation);
        const generated = creator.generateC();
        code = typeof generated === 'string' ? generated : generated.code;
    } catch (error) {
        return {outcome: 'parseFailed', reasons: [String(error.message || error)]};
    }
    const enumerated = enumerateRuntimeRefusals(creator, refusalBuckets);
    const refusals = enumerated.values;
    const runtimeRefusalBuckets = discoverRuntimeRefusalBuckets(creator);
    const activeUses = Object.entries(creator._cUses || {})
        .filter(([, used]) => used).map(([name]) => name).sort();
    const common = {refusals, runtimeRefusalBuckets, neutralised,
        activeUses, warnings: [...(creator._cWarnings || [])]};
    if (noC(code)) return {...common, outcome: 'refused', header: code.trim()};
    if (hostC(code)) return {...common, outcome: 'hostC', code};
    return {...common, outcome: 'deviceC', code};
};

const compact = (name, result) => ({
    name,
    outcome: result.outcome,
    refusals: result.refusals,
    neutralised: result.neutralised,
    activeUses: result.activeUses,
    reasons: result.reasons,
    header: result.header
});

const summarize = rows => {
    const names = outcome => rows.filter(row => row.result.outcome === outcome).map(row => row.name);
    const generatedHost = names('hostC');
    const generatedDevice = names('deviceC');
    return {
        programs: rows.length,
        retargetRefused: names('retargetRefused'),
        parseFailed: names('parseFailed'),
        refused: rows.filter(row => row.result.outcome === 'refused')
            .map(row => compact(row.name, row.result)),
        generatedHost,
        generatedDevice,
        counts: {
            programs: rows.length,
            retargetRefused: names('retargetRefused').length,
            parsed: rows.length - names('retargetRefused').length - names('parseFailed').length,
            parseFailed: names('parseFailed').length,
            refused: names('refused').length,
            generatedHost: generatedHost.length,
            generatedDevice: generatedDevice.length,
            generatedTotal: generatedHost.length + generatedDevice.length
        }
    };
};

const compiler = async () => {
    const distUrl = new URL('smallerc-wasm/dist/', L);
    const require = createRequire(import.meta.url);
    const exports = {smlrpp: 'createSmlrpp', smlrc: 'createSmlrc'};
    const importFactory = async name => {
        const url = new URL(`${name}.js`, distUrl);
        const source = await readFile(url, 'utf8');
        const filename = fileURLToPath(url);
        const module = {exports: {}};
        Function('module', 'exports', 'require', '__filename', '__dirname',
            source.replace(new RegExp(`export default ${exports[name]};\\s*$`), ''))(
            module, module.exports, require, filename, dirname(filename));
        return module.exports;
    };
    const {HEADERS} = await import(new URL('headers.js', distUrl).href);
    const toolchain = {
        factories: await Promise.all(['smlrpp', 'smlrc'].map(importFactory)),
        headers: HEADERS,
        resolve: name => pathToFileURL(fileURLToPath(new URL(name, distUrl))).href
    };
    const {compileWithToolchain} = await import(new URL('smallerc-wasm/compiler.js', L).href);
    return code => compileWithToolchain(code, {target: 'i8086'}, toolchain);
};

export async function measureN2f ({examples, compile = false} = {}) {
    if (!examples) throw new Error('examples directory is required');
    const emitterSource = await readFile(emitterUrl, 'utf8');
    const refusalBuckets = discoverCRefusalBuckets(emitterSource);
    const {default: SB3Creator} = await import(emitterUrl.href);
    const entries = (await readdir(examples, {withFileTypes: true}))
        .filter(entry => entry.isDirectory()).map(entry => entry.name).sort();
    const programs = [];
    for (const name of entries) {
        let source;
        try { source = await readFile(join(examples, name, 'program.bw'), 'utf8'); } catch { continue; }
        programs.push({name, source});
    }
    const variants = {
        baseline: {},
        literalOnly: {literal: true},
        randomOnly: {random: true},
        randomAndLiteral: {literal: true, random: true}
    };
    const raw = {};
    const reportVariants = {};
    for (const [variant, neutralisation] of Object.entries(variants)) {
        raw[variant] = programs.map(({name, source}) => ({
            name,
            result: analyzeProgram(SB3Creator, source, refusalBuckets, neutralisation, name)
        }));
        reportVariants[variant] = summarize(raw[variant]);
    }
    const runtimeBuckets = [...new Set(Object.values(raw).flat().flatMap(row =>
        row.result.runtimeRefusalBuckets || []))].sort();
    const reportedBuckets = [...new Set(Object.values(raw).flat().flatMap(row =>
        Object.keys(row.result.refusals || {})))].sort();
    assertRefusalBucketCoverage(refusalBuckets, reportedBuckets);
    assertRefusalBucketCoverage(refusalBuckets, runtimeBuckets);
    assertRefusalBucketCoverage(runtimeBuckets, reportedBuckets);

    const baselineGenerated = new Set([
        ...reportVariants.baseline.generatedHost,
        ...reportVariants.baseline.generatedDevice
    ]);
    const literalGenerated = new Set([
        ...reportVariants.literalOnly.generatedHost,
        ...reportVariants.literalOnly.generatedDevice
    ]);
    const randomGenerated = new Set([
        ...reportVariants.randomOnly.generatedHost,
        ...reportVariants.randomOnly.generatedDevice
    ]);
    const completeGenerated = new Set([
        ...reportVariants.randomAndLiteral.generatedHost,
        ...reportVariants.randomAndLiteral.generatedDevice
    ]);
    const added = (after, before) => [...after].filter(name => !before.has(name)).sort();
    const fallthroughNames = ['arduino-05-switch-case', 'arduino-06-knock',
        'arduino-sk-p11-crystal-ball'];
    const literalRows = new Map(raw.literalOnly.map(row => [row.name, row.result]));
    const report = {
        schema: 'n2f-i8086-random-literal-reach-v1',
        emitter: 'overlay/scratch-gui/src/lib/sb3-creator.js',
        refusalBuckets: {
            source: refusalBuckets,
            runtime: runtimeBuckets,
            union: [...new Set([...refusalBuckets, ...runtimeBuckets])].sort(),
            enumerated: reportedBuckets
        },
        variants: reportVariants,
        delta: {
            literalOnly: added(literalGenerated, baselineGenerated),
            randomOnly: added(randomGenerated, baselineGenerated),
            randomAndLiteral: added(completeGenerated, baselineGenerated)
        },
        literalFallthrough: Object.fromEntries(fallthroughNames.map(name => [name,
            compact(name, literalRows.get(name))])),
        transforms: Object.fromEntries(Object.entries(raw).map(([variant, rows]) => [variant, {
            literalPrintBlocks: rows.flatMap(row =>
                (row.result.neutralised?.literalPrintBlockIds || []).map(id => `${row.name}:${id}`)),
            integerRandomEdges: rows.flatMap(row =>
                (row.result.neutralised?.integerRandomEdges || []).map(edge => ({program: row.name, ...edge})))
        }])),
        compile: compile ? {} : {
            status: 'deferred-to-hosted-ci',
            reason: 'default measurement is parse/generate-only on the small VPS'
        }
    };
    if (compile) {
        const compileC = await compiler();
        const cache = new Map();
        for (const [variant, rows] of Object.entries(raw)) {
            const compiled = [];
            const failed = [];
            for (const row of rows.filter(item => item.result.outcome === 'deviceC')) {
                const code = row.result.code;
                if (!cache.has(code)) {
                    cache.set(code, compileC(code).then(result => ({ok: Boolean(result.asm && result.asm.trim()), result}))
                        .catch(error => ({ok: false, error})));
                }
                const result = await cache.get(code);
                if (result.ok) compiled.push(row.name);
                else failed.push(`${row.name}: ${String(result.error?.message || result.result?.warnings?.[0] || 'no asm')}`);
            }
            report.compile[variant] = {compiled, failed};
        }
        report.compile.uniqueDeviceBodies = cache.size;
    }
    return report;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
    const args = process.argv.slice(2);
    const at = args.indexOf('--examples');
    if (at < 0 || !args[at + 1]) {
        console.error('usage: measure-i8086-random-literal-reach.mjs --examples <dir> [--compile]');
        process.exit(2);
    }
    console.log(JSON.stringify(await measureN2f({examples: args[at + 1], compile: args.includes('--compile')}), null, 2));
}
