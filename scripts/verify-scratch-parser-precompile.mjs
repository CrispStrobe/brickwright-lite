#!/usr/bin/env node
/** Differentially compare the stock AJV path and P16's generated validators. */
import {createHash} from 'node:crypto';
import {mkdirSync, readFileSync, readdirSync, statSync, writeFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {performance} from 'node:perf_hooks';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PARSER = path.join(ROOT, 'packages', 'scratch-gui', 'node_modules', 'scratch-parser');
const parserRequire = createRequire(path.join(PARSER, 'package.json'));
const stock = parserRequire('./lib/validate-ajv.js');
const generated = parserRequire('./lib/validate.js');
const outputArg = process.argv.indexOf('--json');
const output = outputArg >= 0 ? path.resolve(process.argv[outputArg + 1]) : null;

const jsonFiles = [];
const parserFixtureFiles = [];
const walk = directory => {
    for (const name of readdirSync(directory).sort()) {
        const item = path.join(directory, name);
        if (statSync(item).isDirectory()) walk(item);
        else {
            if (/\.(?:json|sprite2json)$/.test(name)) jsonFiles.push(item);
            if (/\.(?:json|sb|sb2|sb3|sprite2|sprite2json|zip)$/.test(name)) parserFixtureFiles.push(item);
        }
    }
};
walk(path.join(PARSER, 'test', 'fixtures', 'data'));

const cases = [
    ['empty-object', {}], ['null', null], ['array', []], ['string', 'project'],
    ['prototype-shaped', JSON.parse('{"__proto__":{"polluted":true},"constructor":{"prototype":{}}}')],
    ['bounded-deep', Array.from({length: 20}).reduce(value => ({child: value}), {})],
    ['bounded-wide', Object.fromEntries(Array.from({length: 200}, (_, index) => [`k${index}`, index]))]
];
for (const filename of jsonFiles) {
    const value = JSON.parse(readFileSync(filename, 'utf8'));
    const relative = path.relative(PARSER, filename);
    cases.push([relative, value]);
    if (value && !Array.isArray(value) && typeof value === 'object') {
        for (const key of Object.keys(value).slice(0, 24)) {
            const missing = clone(value);
            delete missing[key];
            cases.push([`${relative}:without:${key}`, missing]);
            cases.push([`${relative}:null:${key}`, {...clone(value), [key]: null}]);
        }
    }
}

function clone (value) {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}
const invoke = (validator, isSprite, value) => {
    const input = clone(value);
    let calls = 0;
    let args;
    const started = performance.now();
    validator(isSprite, input, (...received) => {
        calls++;
        args = received;
    });
    return {calls, args: JSON.stringify(args), input: JSON.stringify(input), ms: performance.now() - started};
};

const mismatches = [];
const timings = {stockMs: 0, generatedMs: 0};
let comparisons = 0;
for (const [name, value] of cases) {
    for (const isSprite of [false, true]) {
        const eager = invoke(stock, isSprite, value);
        const candidate = invoke(generated, isSprite, value);
        timings.stockMs += eager.ms;
        timings.generatedMs += candidate.ms;
        comparisons++;
        if (eager.calls !== 1 || candidate.calls !== 1 || eager.args !== candidate.args ||
            eager.input !== candidate.input) {
            mismatches.push({name, isSprite, eager, candidate});
        }
    }
}

const generatedFiles = readdirSync(path.join(PARSER, 'lib'))
    .filter(name => /^validate-(?:sb[23])-(?:project|sprite)\.js$/.test(name)).sort()
    .map(name => {
        const source = readFileSync(path.join(PARSER, 'lib', name));
        return {name, bytes: source.length,
            sha256: createHash('sha256').update(source).digest('hex'),
            requires: [...source.toString().matchAll(/require\(['"]([^'"]+)['"]\)/g)]
                .map(match => match[1])};
    });
const versions = Object.fromEntries(['scratch-parser', 'ajv'].map(name =>
    [name, parserRequire(name === 'scratch-parser' ? './package.json' : `${name}/package.json`).version]));
const report = {schema: 'brickwright/p16-scratch-parser-parity/v1', comparisons,
    fixtureJsonFiles: jsonFiles.length, versions, mismatches, timings, generatedFiles,
    generatedBytes: generatedFiles.reduce((sum, item) => sum + item.bytes, 0)};

const pify = parserRequire('pify');
const unpack = pify(parserRequire('./lib/unpack'));
const parse = pify(parserRequire('./lib/parse'));
const candidateParser = parserRequire('./index.js');
const stockParser = (input, isSprite, callback) => {
    unpack(input, isSprite)
        .then(unpacked => parse(unpacked[0])
            .then(value => pify(stock)(isSprite, value))
            .then(value => [value, unpacked[1]]))
        .then(callback.bind(null, null), callback);
};
const normalizeParserArgs = args => {
    const [error, result] = args;
    return JSON.stringify({
        error: error === null || typeof error !== 'object' ? error : error,
        project: result?.[0] || null,
        zipFiles: result?.[1] ? Object.keys(result[1].files).sort() : null
    });
};
const invokeParser = (parser, input, isSprite) => new Promise(resolve => {
    let synchronous = true;
    let calls = 0;
    parser(input, isSprite, (...args) => {
        calls++;
        resolve({calls, synchronous, args: normalizeParserArgs(args)});
    });
    synchronous = false;
});

const parserMismatches = [];
let parserComparisons = 0;
for (const filename of parserFixtureFiles) {
    const bytes = readFileSync(filename);
    const isSprite = /sprite/i.test(path.basename(filename));
    const inputs = [
        ['buffer', bytes],
        ['uint8array', new Uint8Array(bytes)],
        ['arraybuffer', bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)]
    ];
    if (/\.(?:json|sprite2json)$/.test(filename)) inputs.push(['string', bytes.toString('utf8')]);
    for (const [kind, input] of inputs) {
        const eager = await invokeParser(stockParser, input, isSprite);
        const candidate = await invokeParser(candidateParser, input, isSprite);
        parserComparisons++;
        if (eager.calls !== 1 || candidate.calls !== 1 || eager.synchronous !== candidate.synchronous ||
            eager.args !== candidate.args) {
            parserMismatches.push({filename: path.relative(PARSER, filename), kind, isSprite, eager, candidate});
        }
    }
}
report.parserFixtureFiles = parserFixtureFiles.length;
report.parserComparisons = parserComparisons;
report.parserMismatches = parserMismatches;
if (output) {
    mkdirSync(path.dirname(output), {recursive: true});
    writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
}
console.log(JSON.stringify(report, null, 2));
if (mismatches.length || parserMismatches.length) {
    throw new Error(`${mismatches.length} validator and ${parserMismatches.length} parser differences`);
}
