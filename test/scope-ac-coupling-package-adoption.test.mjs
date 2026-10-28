// Authored constant-source fixture: the independent RC high-pass response is
// y(t)=V*exp(-t/tau), measured from the first retained sample. This tests the
// installed CLI/package boundary, not a physical scope or circuit-loading model.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, writeFileSync, mkdtempSync, rmSync, existsSync, cpSync, symlinkSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const cli = path.join(root, 'node_modules/bw-circuit-ui/bin/bwc.mjs');
const tau = 5e-6;
const env = {...process.env};
for (const key of ['BW_BOARD', 'NODE_PATH', 'NODE_OPTIONS']) delete env[key];
const run = (file, args, entry = cli) => spawnSync(process.execPath, ['--max-old-space-size=384', entry, 'measure', file,
    '--scope', 'V1.pos,V1.neg', '--scope', 'V2.pos,V2.neg',
    '--duration', '20us', '--rate', '1MHz', '--json', ...args],
{cwd: root, env, encoding: 'utf8', timeout: 60000, maxBuffer: 4 << 20});
const sections = csv => csv.trimEnd().split('\n\n');
function fixture(t) {
    const dir = mkdtempSync(path.join(tmpdir(), 'lite-ac-coupling-'));
    t.after(() => rmSync(dir, {recursive: true, force: true}));
    const input = path.join(dir, 'authored.cir');
    writeFileSync(input, 'Authored nonloading scope coupling control\nV1 a 0 2\nR1 a 0 1k\nV2 b 0 1\nR2 b 0 1k\n.end\n');
    return {dir, input};
}
function capture(input, dir, name, flags = [], entry = cli) {
    const csv = path.join(dir, name + '.csv');
    const result = run(input, [...flags, '--csv', csv], entry);
    assert.equal(result.status, 0, result.stderr);
    return {report: JSON.parse(result.stdout), text: readFileSync(csv, 'utf8')};
}
function coupledRows(text) {
    const lines = sections(text)[0].split('\n');
    assert.match(lines[0], /coupling=\{/);
    assert.equal(lines[1], 'elapsed_seconds,input_volts,volts');
    return lines.slice(2).map(line => line.split(',').map(Number));
}

function assertDecay(rows) {
    for (const [time, inputVolts, volts] of rows) {
        assert.equal(inputVolts, 2, 'the actual raw source voltage is preserved');
        assert.ok(Math.abs(volts - 2 * Math.exp(-time / tau)) < 1e-12, `decay at ${time}: ${volts}`);
    }
}
function assertRefused(result, csv, reason) {
    assert.equal(result.status, 2, `refusal exit: ${result.stderr}`);
    assert.match(result.stderr, reason);
    assert.equal(existsSync(csv), false, 'refusal cannot leave a partial capture');
}

test('installed AC coupling keeps raw defaults and the unselected channel while matching the independent decay', t => {
    const {dir, input} = fixture(t);
    const raw = capture(input, dir, 'raw');
    const repeated = capture(input, dir, 'raw-repeat');
    assert.equal(raw.text, repeated.text, 'default CSV bytes remain deterministic');
    assert.equal(Object.hasOwn(raw.report, 'scopeCoupling'), false);
    assert.equal(Object.hasOwn(raw.report.scope[0], 'coupling'), false);
    const ac = capture(input, dir, 'ac', ['--ac-couple', 'V1.pos,V1.neg', '--ac-rc', String(tau), '--ac-initial', 'uncharged']);
    const descriptor = ac.report.scope[0].coupling.descriptor;
    assert.equal(descriptor.kind, 'first-order-rc-highpass');
    assert.equal(descriptor.physicalHardwareModel, false);
    assert.equal(descriptor.tauSeconds, tau);
    assert.equal(descriptor.initial, 'uncharged');
    assert.deepEqual(ac.report.scope[0].summary, raw.report.scope[0].summary, 'summary remains the raw measurement');
    assert.equal(Object.hasOwn(ac.report.scope[1], 'coupling'), false);
    assert.deepEqual(ac.report.scope[1].summary, raw.report.scope[1].summary, 'unselected channel raw summary');
    assert.equal(sections(ac.text)[1], sections(raw.text)[1], 'unselected channel CSV bytes');
    const rows = coupledRows(ac.text);
    const rawRows = sections(raw.text)[0].split('\n').slice(2).map(line => line.split(',').map(Number));
    assert.equal(rows.length, rawRows.length, 'the coupled view cannot truncate the raw capture');
    for (const [i, [time, inputVolts]] of rows.entries()) {
        assert.equal(time, rawRows[i][0], 'the actual raw time grid is preserved');
        assert.equal(inputVolts, rawRows[i][1], 'the actual raw waveform is preserved');
    }
    assert.ok(rows.length >= 10, 'enough actual points to distinguish decay from passthrough');
    assert.equal(rows[0][0], 0, 'coupling initialization is at the first retained sample');
    assertDecay(rows);
    assert.ok(rows.some(([, , volts]) => Math.abs(volts - 2) > 1), 'dropping the transform is observable');
    assert.ok(rows.some(([time, , volts]) => Math.abs(volts - 2 * Math.exp(-time / (1.1 * tau))) > 0.01), 'wrong tau is observable');
});

test('installed explicit corner matches tau and settled initialization removes constant DC', t => {
    const {dir, input} = fixture(t);
    const corner = capture(input, dir, 'corner', ['--ac-couple', 'V1.pos,V1.neg', '--ac-corner-hz', String(1 / (2 * Math.PI * tau))]);
    for (const [time, raw, volts] of coupledRows(corner.text)) {
        assert.equal(raw, 2);
        assert.ok(Math.abs(volts - 2 * Math.exp(-time / tau)) < 1e-12);
    }
    const settled = capture(input, dir, 'settled', ['--ac-couple', 'V1.pos,V1.neg', '--ac-rc', String(tau), '--ac-initial', 'settled']);
    for (const [, raw, volts] of coupledRows(settled.text)) {
        assert.equal(raw, 2);
        assert.ok(Math.abs(volts) < 1e-15, 'settled capacitor removes DC from the first sample');
    }
});

test('installed invalid coupling options refuse by name before producing CSV', t => {
    const {dir, input} = fixture(t);
    const cases = [
        [['--ac-couple', 'V1.pos,V1.neg'], /--ac-corner-hz or --ac-rc/],
        [['--ac-couple', 'V1.pos,V1.neg', '--ac-rc', String(tau), '--ac-corner-hz', '10'], /exactly one/],
        [['--ac-couple', 'V1.pos,V1.neg', '--ac-rc', '0'], /--ac-rc/],
        [['--ac-couple', 'V1.pos,V1.neg', '--ac-rc', String(tau), '--ac-initial', 'unknown'], /--ac-initial/],
        [['--ac-couple', 'R9.a', '--ac-rc', String(tau)], /--ac-couple.*R9/],
        [['--ac-rc', String(tau)], /--ac-couple/],
        [['--ac-couple', 'V1.pos,V1.neg', '--ac-rc', String(tau), '--watch'], /--watch/]
    ];
    for (const [i, [flags, reason]] of cases.entries()) {
        const csv = path.join(dir, `refused-${i}.csv`);
        const result = run(input, [...flags, '--csv', csv]);
        assertRefused(result, csv, reason);
    }
});


test('actual installed-source mutants are killed by the same decay and refusal assertions', t => {
    const {dir, input} = fixture(t);
    const actual = path.join(root, 'node_modules/bw-circuit-ui');
    const copied = path.join(dir, 'mutant-ui');
    // Only the private fixture is writable. Dependencies resolve read-only to
    // the actual install; no real node_modules file or shared store is edited.
    cpSync(actual, copied, {recursive: true,
        filter: file => !path.relative(actual, file).split(path.sep).includes('node_modules')});
    symlinkSync(path.join(root, 'node_modules'), path.join(dir, 'node_modules'), 'dir');
    const entry = path.join(copied, 'bin/bwc.mjs');
    const flags = ['--ac-couple', 'V1.pos,V1.neg', '--ac-rc', String(tau)];
    assertDecay(coupledRows(capture(input, dir, 'copied-control', flags, entry).text));
    const mutants = [
        {name: 'dropped-transform', file: 'src/model/scope-coupling.js',
            from: 'modeled[2 * index] = modeled[2 * index + 1] = y;',
            to: 'modeled[2 * index] = modeled[2 * index + 1] = x;'},
        {name: 'wrong-time-constant', file: 'src/model/scope-coupling.js',
            from: 'const { tauSeconds: tau, initial } = model.descriptor;',
            to: 'const { tauSeconds: declaredTau, initial } = model.descriptor; const tau = declaredTau * 1.1;'},
        {name: 'bypassed-exclusive-refusal', file: 'bin/bwc.mjs',
            from: "if (hasCorner&&hasRc) die('AC coupling takes exactly one of --ac-corner-hz or --ac-rc');",
            to: "if (false) die('AC coupling takes exactly one of --ac-corner-hz or --ac-rc');",
            refusal: true}
    ];
    for (const mutant of mutants) {
        const target = path.join(copied, mutant.file);
        const original = readFileSync(target, 'utf8');
        assert.equal(original.split(mutant.from).length, 2, `${mutant.name}: one exact source anchor`);
        try {
            writeFileSync(target, original.replace(mutant.from, mutant.to));
            const syntax = spawnSync(process.execPath, ['--check', target], {encoding: 'utf8', env});
            assert.equal(syntax.status, 0, `${mutant.name}: must remain buildable: ${syntax.stderr}`);
            if (mutant.refusal) {
                const csv = path.join(dir, mutant.name + '.csv');
                const result = run(input, [...flags, '--ac-corner-hz', '10', '--csv', csv], entry);
                assert.equal(result.status, 0, 'the mutant must execute, not fail on setup');
                assert.throws(() => assertRefused(result, csv, /exactly one/), /refusal exit/);
            } else {
                const result = capture(input, dir, mutant.name, flags, entry);
                assert.throws(() => assertDecay(coupledRows(result.text)), /decay at/,
                    `${mutant.name}: numerical disagreement, not a parse/setup failure`);
            }
        } finally { writeFileSync(target, original); }
        assert.equal(readFileSync(target, 'utf8'), original, `${mutant.name}: fixture restored`);
    }
});
