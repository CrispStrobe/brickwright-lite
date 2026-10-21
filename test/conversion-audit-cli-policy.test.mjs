import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const cli = fs.readFileSync(new URL('../scripts/compat-audit.mjs', import.meta.url), 'utf8');

test('default compat CLI imports shared actual core and reader with no eager SDK acquisition', () => {
    assert.match(cli, /import \{auditConversionSubject, conversionObservationGraph, conversionException\} from '.\/lib\/conversion-audit-core.mjs'/);
    assert.match(cli, /import \{openConversionCatalogue\} from '.\/lib\/conversion-context-inputs.mjs'/);
    assert.doesNotMatch(cli, /^import .*from ['"].*pxt-node/m);
    assert.equal((cli.match(/import\('\.\/lib\/pxt-node\.mjs'\)/g) || []).length, 1);
    assert.match(cli, /const compiler = doCompile \|\| prepareExtensions \|\| execute \? await import\('\.\/lib\/pxt-node\.mjs'\) : null/);
});
test('selected optional compiler acquisition still precedes CLI provenance and corpus collection', () => {
    const selected = cli.indexOf('const compiler = doCompile');
    assert.ok(selected >= 0 && selected < cli.indexOf('invocationIdentity = snapshotIdentity()'));
    assert.ok(selected < cli.indexOf('const files ='));
    assert.match(cli, /import \{spawnSync\} from 'node:child_process'/);
    assert.match(cli, /const result = spawnSync\('git', args, \{cwd: root, encoding: 'utf8'\}\)/);
});
test('CLI preserves raw generated map target name and actual precompile ordering before shared conversion', () => {
    assert.match(cli, /const projectFiles = \{'main.ts': source,/);
    assert.match(cli, /'pxt.json': JSON.stringify\(\{name: path.basename\(file, ext\), dependencies, files: \['main.ts'\]\}\)/);
    const begin = cli.indexOf('async function makecode');
    const compile = cli.indexOf('await compile(target, projectFiles, {fetchExtensions})', begin);
    const conversion = cli.indexOf("auditConversionSubject({kind: 'RAW_BASELINE'", begin);
    assert.ok(compile >= begin && compile < conversion);
    assert.match(cli, /if \(row.stage === 'source-only'\) return row/);
});
test('context-only CLI uses explicit catalogue roots and current shared operation without default resolver or SDK flags', () => {
    assert.match(cli, /!inputs.length && !contextCatalogue/);
    assert.match(cli, /openConversionCatalogue\(contextCatalogue, \{roots: contextRoots\}\)/);
    assert.match(cli, /contexts.loadSubject\(index\)/);
    assert.match(cli, /progress \? await observeConversion\(subject\) : await auditConversionSubject\(subject, conversionOptions\(\)\)/);
    assert.match(cli, /--target differs from context target/);
    assert.match(cli, /originalCompile: subject.originalCompile/);
    assert.match(cli, /row = await applyOptionalGates\(row, observed.import.value\)/);
});
test('actual conversion options add only selected observers and artwork without acquiring compiler capabilities', () => {
    const start = cli.indexOf('function conversionOptions () {');
    const end = cli.indexOf('\nasync function observeConversion (subject)', start);
    assert.ok(start >= 0 && end > start);
    const declaration = cli.slice(start, end);
    for (const selectedProgress of [false, true]) for (const journey of [false, true]) {
        const events = [], subject = {kind: 'RAW_BASELINE'}, creator = {project: {}}, event = {phase: 'actual'};
        const sentinel = {};
        const scope = {progress: selectedProgress ? {onObservation: (...args) => events.push(args)} : false,
            progressSubject: subject, journey, journeyCreator: sentinel};
        const options = vm.runInNewContext(`${declaration}\nconversionOptions()`, scope);
        assert.deepEqual(Object.keys(options).sort(), [
            ...(selectedProgress ? ['onObservation'] : []),
            ...(journey ? ['animationResources', 'onCreator'] : [])
        ].sort());
        if (selectedProgress) {
            options.onObservation(event);
            assert.equal(events.length, 1);
            assert.equal(events[0][0], event);
            assert.equal(events[0][1], subject);
        }
        if (journey) {
            assert.equal(options.animationResources, true);
            options.onCreator(creator);
            assert.equal(scope.journeyCreator, creator);
        } else assert.equal(scope.journeyCreator, sentinel);
    }
});
test('whole census entry remains the shared pure operation while roundtrip integration is explicitly separate', () => {
    const core = fs.readFileSync(new URL('../scripts/lib/conversion-audit-core.mjs', import.meta.url), 'utf8');
    assert.doesNotMatch(core, /process\.argv|node:child_process|pxt-node|bw-vm/);
    assert.match(cli, /import \{compactConversionObservationGraph\} from '.\/lib\/conversion-audit-core.mjs'/);
    assert.equal((cli.match(/conversion: compactConversionObservationGraph\(observation\)/g) || []).length, 1);
    assert.doesNotMatch(cli, /conversion: conversionObservationGraph\(observation\)/);
    assert.equal((cli.match(/observationFailure: conversionObservationGraph\(conversionException\(error\)\)/g) || []).length, 2);
    assert.match(cli, /observationFailure: conversionObservationGraph\(conversionException\(error\)\)/);
    assert.match(cli, /staticTranslation: row.staticTranslation.status/);
    assert.match(cli, /behavioralEquivalence: 'not-measured'/);
});
