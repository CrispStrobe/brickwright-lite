import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {
    N2F_RNG_SEED,
    analyzeProgram,
    assertRefusalBucketCoverage,
    discoverCRefusalBuckets,
    discoverRuntimeRefusalBuckets,
    enumerateRuntimeRefusals,
    finalizeRefusalInventory,
    measureN2f,
    n2fRandomInt16
} from '../scripts/measure-i8086-random-literal-reach.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const examples = join(root, 'overlay/scratch-gui/examples');
const emitterFile = join(root, 'overlay/scratch-gui/src/lib/sb3-creator.js');
const literalPrintBlocks = [
    'arduino-04-ascii-table:h(%a.I?g~**:9Pj+1?KE',
    'arduino-05-switch-case:0Q8p=FNNXb*[5]V+!AlU',
    'arduino-05-switch-case:6Or`*08d)3Z)bVOMU]iE',
    'arduino-05-switch-case:M.*rX[]Ft7mljRbaeIoN',
    'arduino-05-switch-case:We)x0J@e5ZqrhH2xuCX!',
    'arduino-06-knock:cfgCh.PtUrp%_r*|.)U#',
    'arduino-08-char-analysis::GlWhzUIQHTFp4y*RJOf',
    'arduino-08-string-append:rXb7DbgsT103VcFn#:wM',
    'arduino-08-string-case:p{2xxl-p4]cvH|=bm!iX',
    'arduino-08-string-chars:F[:)2{{jtv.8-W49/8%[',
    'arduino-08-string-compare::gH|=hz|NMTmT:!QC-,#',
    'arduino-08-string-constructors:{sd5]]sDRswLW%T#%F*]',
    'arduino-08-string-indexof:rDTp1!7#uN!kT]MF,DnU',
    'arduino-08-string-length:}(25D@RK+|5N1J4th3.]',
    'arduino-08-string-length-trim:,t)~/jH`pVI2ELie72Mh',
    'arduino-08-string-replace:u?=1EcopD`PG2C9a/Hdm',
    'arduino-08-string-startswith:J!-C-e!]l+Y@WuK1c/`4',
    'arduino-08-string-substring:{6k#vvA4K4rX0Fx?5LC3',
    'arduino-08-string-toint:a?:81t-HaCZp0=1Yy!@1',
    'arduino-sk-p11-crystal-ball:=f,X#0]A;C0Q@drdYsri',
    'arduino-sk-p11-crystal-ball:E7dWoJ0FZ(YYNQlep@2?',
    'arduino-sk-p11-crystal-ball:GqDngHvPqpIaXn.y960_',
    'arduino-sk-p11-crystal-ball:QShFHBm*O8O%}u2ob8zW',
    'arduino-sk-p11-crystal-ball:g|o^pvM2ifZXiOA=736R',
    'arduino-sk-p11-crystal-ball:l%b.,h,Wup`Z.eQZMxe8',
    'arduino-sk-p11-crystal-ball:xyw[e_p[]R#xTCFmz9Ox',
    'arduino-sk-p11-crystal-ball:|7l:fbD=GKrs~lY9V)s,'
];
const integerRandomEdges = [{
    program: 'arduino-sk-p11-crystal-ball',
    randomBlockId: 'vkBNDwMf7d6Z16c3aQUc',
    consumerBlockId: 'g)MC,FVO^_s8s3]^E[uv',
    inputName: 'VALUE'
}];

test('N2f blocker neutralisation proves device 47 -> 48 and mixed generation 78 -> 79',
    {timeout: 120000}, async () => {
        const report = await measureN2f({examples});
        assert.equal(report.schema, 'n2f-i8086-random-literal-reach-v1');
        const refusalBuckets = ['_cI16Refused', '_cListRefused', '_cLoweringRefused',
            '_cPrintRefused', '_cWaitRefused'];
        assert.deepEqual(report.refusalBuckets, {
            source: refusalBuckets,
            runtime: refusalBuckets,
            union: refusalBuckets,
            enumerated: refusalBuckets
        });
        assert.deepEqual(report.variants.baseline.counts, {
            programs: 281, retargetRefused: 131, parsed: 150, parseFailed: 0,
            refused: 72, generatedHost: 31, generatedDevice: 47, generatedTotal: 78
        });
        assert.equal(report.variants.literalOnly.counts.generatedTotal, 78);
        assert.deepEqual(report.delta.literalOnly, [], 'literal output alone gained a program');
        assert.equal(report.variants.randomOnly.counts.generatedTotal, 78);
        assert.deepEqual(report.delta.randomOnly, [], 'random alone gained a program');
        assert.equal(report.variants.randomAndLiteral.counts.generatedTotal, 79);
        assert.equal(report.variants.randomAndLiteral.counts.generatedDevice, 48);
        assert.deepEqual(report.delta.randomAndLiteral, ['arduino-sk-p11-crystal-ball']);
        assert.deepEqual(report.transforms.randomAndLiteral.integerRandomEdges, integerRandomEdges,
            'the parsed random candidate edge changed');
        assert.deepEqual(report.transforms.randomAndLiteral.literalPrintBlocks, literalPrintBlocks,
            'the parsed literal blocker set changed');
        assert.deepEqual(report.transforms.baseline,
            {literalPrintBlocks: [], integerRandomEdges: []});
        assert.deepEqual(report.transforms.literalOnly.literalPrintBlocks,
            report.transforms.randomAndLiteral.literalPrintBlocks,
            'the parsed literal blocker set changed across the lattice');
        assert.deepEqual(report.transforms.randomOnly.integerRandomEdges,
            report.transforms.randomAndLiteral.integerRandomEdges,
            'the parsed random blocker edge changed across the lattice');
        for (const name of ['arduino-05-switch-case', 'arduino-06-knock']) {
            const row = report.literalFallthrough[name];
            assert.equal(row.outcome, 'refused');
            assert.ok(row.activeUses.includes('adc'), `${name} did not fall through to the 8255-only wall`);
            assert.equal(Object.values(row.refusals).every(reasons => reasons.length === 0), true,
                `${name} retained an earlier structured refusal after literal neutralisation`);
            assert.match(row.header, /This program also uses: adc\./,
                `${name} did not terminate at the ADC feature wall`);
        }
        const crystal = report.literalFallthrough['arduino-sk-p11-crystal-ball'];
        assert.equal(crystal.outcome, 'refused');
        assert.ok(crystal.refusals._cLoweringRefused.some(reason => reason.includes('pick random 1 to 8')),
            'literal neutralisation did not expose crystal-ball random lowering');
        assert.equal(report.compile.status, 'deferred-to-hosted-ci');
    });

test('the refusal census derives every bucket from production source and an omitted bucket is red',
    async () => {
        const source = await readFile(emitterFile, 'utf8');
        const discovered = discoverCRefusalBuckets(source);
        assert.ok(discovered.length >= 5, 'the source-derived refusal inventory unexpectedly shrank');
        for (const required of ['_cI16Refused', '_cPrintRefused', '_cLoweringRefused',
            '_cListRefused', '_cWaitRefused']) {
            assert.ok(discovered.includes(required), `${required} was not discovered from the emitter`);
        }
        assertRefusalBucketCoverage(discovered, discovered);
        const mutatedSource = source.replace('this._cListRefused = [];',
            'this._cListRefused = []; this["_cFutureRefused"] = [];');
        assert.notEqual(mutatedSource, source, 'future-bucket mutation anchor moved');
        const future = discoverCRefusalBuckets(mutatedSource);
        assert.ok(future.includes('_cFutureRefused'));
        assert.throws(() => assertRefusalBucketCoverage(future, discovered),
            /_cFutureRefused/, 'a future refusal bucket omitted by the census did not fail the guard');
        const futureRuntime = Object.fromEntries(future.map(name => [name, []]));
        const futureReport = enumerateRuntimeRefusals(futureRuntime, discovered);
        assert.ok(futureReport.names.includes('_cFutureRefused'),
            'a future runtime refusal bucket did not enter the report');
        assert.deepEqual(finalizeRefusalInventory(future, future, futureReport.names), {
            source: future,
            runtime: future,
            union: future,
            enumerated: future
        });
        assert.throws(() => finalizeRefusalInventory(future, future, discovered),
            /_cFutureRefused/, 'the live report finalizer accepted an omitted future bucket');
        assert.throws(() => enumerateRuntimeRefusals({_cFutureRefused: 'not an array'}, discovered),
            /_cFutureRefused must be undefined or an array/,
            'a malformed future bucket was silently treated as empty');

        const {default: SB3Creator} = await import(new URL(
            '../overlay/scratch-gui/src/lib/sb3-creator.js', import.meta.url));
        const minimal = [
            'DEVICE i8086',
            'PIN led = P1.0 OUTPUT',
            'WHEN flag clicked:',
            '  print "Yes"'
        ].join('\n');
        const result = analyzeProgram(SB3Creator, minimal, discovered);
        assert.equal(result.outcome, 'refused');
        assert.deepEqual(discoverRuntimeRefusalBuckets(Object.assign({},
            Object.fromEntries(discovered.map(name => [name, []])))), discovered);
        assert.deepEqual(result.refusals._cPrintRefused,
            ['text-mode print is outside the numeric-only i8086 C print boundary']);
    });

test('candidate deterministic integer RNG is inclusive, repeatable and normalises reversed bounds', () => {
    const draw = (seed, from, to, count) => {
        const values = [];
        let state = seed;
        for (let index = 0; index < count; index++) {
            const result = n2fRandomInt16(state, from, to);
            values.push(result.value);
            state = result.state;
        }
        return {values, state};
    };
    const forward = draw(N2F_RNG_SEED, 1, 8, 32);
    assert.deepEqual(forward, {
        values: [3, 4, 1, 2, 7, 8, 5, 6, 3, 4, 1, 2, 7, 8, 5, 6,
            3, 4, 1, 2, 7, 8, 5, 6, 3, 4, 1, 2, 7, 8, 5, 6],
        state: 7325
    });
    assert.deepEqual(draw(N2F_RNG_SEED, 1, 8, 32), forward, 'same seed changed trace');
    assert.deepEqual(draw(N2F_RNG_SEED, 8, 1, 32), forward, 'reversed bounds changed trace');
    assert.equal(forward.values.every(value => value >= 1 && value <= 8), true);
    assert.deepEqual([...new Set(forward.values)].sort((a, b) => a - b), [1, 2, 3, 4, 5, 6, 7, 8]);

    const equal = n2fRandomInt16(N2F_RNG_SEED, -32768, -32768);
    assert.deepEqual(equal, {value: -32768, state: 13658, draws: 1});
    assert.deepEqual(n2fRandomInt16(N2F_RNG_SEED, 32767, 32767),
        {value: 32767, state: 13658, draws: 1});
    assert.deepEqual(n2fRandomInt16(N2F_RNG_SEED, -32768, 32767),
        {value: -19110, state: 13658, draws: 1});
    assert.deepEqual(n2fRandomInt16(N2F_RNG_SEED, 32767, -32768),
        {value: -19110, state: 13658, draws: 1});
    assert.deepEqual(n2fRandomInt16(33870, -2, 2),
        {value: 0, state: 54212, draws: 2},
        'rejection no longer consumes and advances through a second draw');
    assert.deepEqual(n2fRandomInt16(N2F_RNG_SEED, -32768, -32767),
        {value: -32768, state: 13658, draws: 1});
    assert.deepEqual(n2fRandomInt16(N2F_RNG_SEED, 32766, 32767),
        {value: 32766, state: 13658, draws: 1});
    assert.deepEqual(n2fRandomInt16(N2F_RNG_SEED, -1, 0),
        {value: -1, state: 13658, draws: 1});
    assert.deepEqual(n2fRandomInt16(N2F_RNG_SEED, 0, 1),
        {value: 0, state: 13658, draws: 1});
    assert.throws(() => n2fRandomInt16(0, -32769, 0), /signed 16 bits/);
    assert.throws(() => n2fRandomInt16(0, 0, 32768), /signed 16 bits/);
    assert.throws(() => n2fRandomInt16(0, 0.5, 1), /integer/);
});

test('hosted CI compile-backs every prospective DEVICE C body', {skip: !process.env.CI, timeout: 300000},
    async () => {
        const report = await measureN2f({examples, compile: true});
        assert.equal(report.compile.baseline.compiled.length, 47);
        assert.deepEqual(report.compile.baseline.failed, []);
        assert.equal(report.compile.literalOnly.compiled.length, 47);
        assert.deepEqual(report.compile.literalOnly.failed, []);
        assert.equal(report.compile.randomOnly.compiled.length, 47);
        assert.deepEqual(report.compile.randomOnly.failed, []);
        assert.equal(report.compile.randomAndLiteral.compiled.length, 48);
        assert.deepEqual(report.compile.randomAndLiteral.failed, []);
        assert.equal(report.compile.uniqueDeviceBodies, 48,
            'compile cache no longer matches the 47 baseline plus exactly one candidate');
    });
