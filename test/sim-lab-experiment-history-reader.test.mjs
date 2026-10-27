// SPDX-License-Identifier: BSD-3-Clause
// Synthetic container/consumer controls, never a simulator or guest qualification.
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync, writeFileSync, rmSync, realpathSync, accessSync, constants} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import JSZip from 'jszip';
const python = process.env.BW_MEASUREMENT_PYTHON_EXECUTABLE || '/usr/bin/python3';
assert.ok(isAbsolute(python)); const PYTHON = realpathSync(python); accessSync(PYTHON, constants.X_OK);
const script = fileURLToPath(new URL('../scripts/read-sim-lab-measurement-artifact.py', import.meta.url));
const head = 'a'.repeat(40), tree = 'b'.repeat(40), source = {checkout: head, tree};
const hash = value => createHash('sha256').update(value).digest('hex');
const ldraw = '0 Saved title\r\n0 Name: fixture.ldr\r\n0 Author: Someone\r\n0 !BW ID part\r\n1 16 0 0 0 1 0 0 0 1 0 0 0 1 3001.dat\r\n';
const canonical = ldraw.replace('0 Saved title', '0 measurement-model').replace('0 Name: fixture.ldr', '0 Name: measurement-model.ldr').replace('0 Author: Someone', '0 Author: Brickwright');
const mass = {id: 'm', kind: 'mass', label: 'Mass', targets: ['part'], visible: true};
const definition = {id: 'm', kind: 'mass', label: 'Mass', targets: ['part'], joint: '', rope: '', binding: ''};
const pack = async record => {
    const z = new JSZip(); z.file('project.json', '{"targets":[]}');
    z.file('brickwright/state.json', JSON.stringify({format: 'brickwright-state', version: 2, state: {simLab: record}}));
    return z.generateAsync({type: 'nodebuffer'});
};
const quote = value => `"${String(value).replace(/"/g, '""')}"`;
const fixture = async (edit = () => {}) => {
    const modelHash = hash(canonical), packet = {schema: 'bw.sim-lab.experiments.v1', modelSha256: modelHash, selection: ['m'],
        runs: [3, null].map((value, i) => ({id: `run-${i + 1}`, origin: 'csv', modelSha256: modelHash, definitions: [definition], samples: [[0, null, [[value, 'configured-mass', value === null ? 'unavailable' : '']]]]}))};
    const quantities = ['motorTorque', 'limitTorque', 'motorPower'].map(kind => ({id: kind, kind, label: kind, joint: 'j0', binding: `sha256:${'c'.repeat(64)}`, visible: true}));
    const record = {ldraw, name: 'fixture.ldr', measurements: [mass, ...quantities], experiments: packet};
    const effort = {sample: {t: 0.005, stepSeconds: 0.005, motorTorqueNm: -0.2, passiveTorqueNm: 0, limitTorqueNm: 0.1, angularVelocityRadS: 2, motorPowerW: -0.4}, coreTime: 0.005,
        rows: [{kind: 'motorTorque', value: -0.2, unit: 'N·m', source: 'jolt-motor-impulse', available: true},
            {kind: 'limitTorque', value: 0.1, unit: 'N·m', source: 'jolt-limit-impulse', available: true},
            {kind: 'motorPower', value: -0.4, unit: 'W', source: 'jolt-motor-power', available: true}]};
    const inspector = {massAdjusted: true, configuredMassKg: 0.003, solverMassKg: 0.02, centerOfMassWorld: [0, 0.1, 0],
        inertiaKgM2: [[0.01, 0, 0], [0, 0.02, 0], [0, 0, 0.03]]};
    edit({packet, record, effort, inspector});
    const csv = ['run_id,model_sha256,measurement_id,label,kind,definition_json,unit,source,elapsed_ms,available,value,reason',
        ...[3, null].map((v, i) => [`run-${i + 1}`, packet.modelSha256, 'm', 'Mass', 'mass', JSON.stringify(definition), 'g', 'configured-mass', 0, v !== null, v ?? '', v === null ? 'unavailable' : ''].map(quote).join(','))].join('\r\n') + '\r\n';
    const csvReceipt = {file: 'sim-lab-measurement-runs.csv', bytes: Buffer.byteLength(csv), sha256: hash(csv), rows: 2};
    const oldRecord = {ldraw, name: 'fixture.ldr', measurements: [mass]}, oldBytes = await pack(oldRecord), historyBytes = await pack(record);
    const project = (name, bytes, defs, modelText = ldraw) => ({before: defs, after: defs, saved: defs, modelBeforeSha256: hash(modelText), modelAfterSha256: hash(modelText), sb3: {file: name, bytes: bytes.length, sha256: hash(bytes)}});
    const oldReport = {source, project: project('sim-lab-measurement-edit.sb3', oldBytes, oldRecord.measurements)};
    const report = {source, project: project('sim-lab-experiment-history.sb3', historyBytes, record.measurements, record.ldraw),
        history: {before: packet, after: packet, saved: packet, remounted: packet, csv: csvReceipt}, effort, inspector,
        isolation: {differentModelEmpty: true, paneRemountRestored: true}};
    const recording = {source, recording: {compatible: true, runCount: 2, modelSha256: packet.modelSha256, definitions: [definition], sampleSets: [1, 1], csv: csvReceipt}};
    return {'sim-lab-measurement-edit.sb3': oldBytes, 'sim-lab-measurement-edit.json': JSON.stringify(oldReport),
        'sim-lab-measurement-runs.csv': csv, 'sim-lab-measurement-experiments.json': JSON.stringify(recording),
        'sim-lab-experiment-history.sb3': historyBytes, 'sim-lab-experiment-history.json': JSON.stringify(report)};
};
const run = async (files, check) => {
    const dir = mkdtempSync(join(tmpdir(), 'bw-history-consumer-'));
    try {
        for (const [name, bytes] of Object.entries(files)) writeFileSync(join(dir, name), bytes);
        const result = spawnSync(PYTHON, ['-B', script, dir, '--checkout', head, '--tree', tree, '--require-history'], {encoding: 'utf8', timeout: 10000});
        check(result);
    } finally { rmSync(dir, {recursive: true, force: true}); }
};
test('standalone history consumer accepts six originals and preserved unavailable CSV gaps', async () => {
    await run(await fixture(), result => {
        assert.equal(result.status, 0, result.stderr); const report = JSON.parse(result.stdout);
        assert.equal(report.history.result, 'PASS'); assert.equal(report.history.joinedCsvRows, 2); assert.equal(report.history.canonicalModelSha256, hash(canonical));
    });
});
test('coherent producer reports cannot replace the independently joined CSV values or gaps', async () => {
    for (const change of [({packet}) => { packet.runs[0].samples[0][2][0][0] = 99; }, ({packet}) => { packet.runs[1].samples[0][2][0][0] = 0; }]) {
        await run(await fixture(change), result => { assert.notEqual(result.status, 0); assert.match(result.stderr, /history captured numeric value|history unavailable gap/); });
    }
});
test('a forged model digest shared by reports and CSV still fails independent saved-header normalization', async () => {
    await run(await fixture(({packet}) => { packet.modelSha256 = 'd'.repeat(64); packet.runs.forEach(r => { r.modelSha256 = packet.modelSha256; }); }),
        result => { assert.notEqual(result.status, 0); assert.match(result.stderr, /canonical authored-model join/); });
});
test('mixed-step effort, false power and unbound plot hints are refused', async () => {
    for (const change of [({effort}) => { effort.sample.t = 0; }, ({effort}) => { effort.sample.motorPowerW = 0.4; }, ({packet}) => { packet.selection = ['missing']; }]) {
        await run(await fixture(change), result => { assert.notEqual(result.status, 0); });
    }
});
test('new qualification cannot quietly fall back to an old four-file artifact', async () => {
    const files = await fixture(); delete files['sim-lab-experiment-history.json'];
    await run(files, result => { assert.notEqual(result.status, 0); });
});


// Twelve saved digits preserve authored geometry; canonical identity remains six digits.
const savedTwelve = ldraw.replace('1 16 0 0 0 ', '1 16 0.384615384615 0.999999999999 -0.000000000001 ');
const expectedSix = canonical.replace('1 16 0 0 0 ', '1 16 0.384615 1 0 ');
test('a twelve-digit saved original joins its independently expected six-digit canonical identity', async () => {
    await run(await fixture(({packet, record}) => {
        record.ldraw = savedTwelve;
        packet.modelSha256 = hash(expectedSix);
        packet.runs.forEach(r => { r.modelSha256 = packet.modelSha256; });
    }), result => {
        assert.equal(result.status, 0, result.stderr);
        assert.equal(JSON.parse(result.stdout).history.canonicalModelSha256, hash(expectedSix));
    });
});
test('coherent twelve-digit hash labels cannot replace the six-digit identity contract', async () => {
    const wrongTwelve = savedTwelve.replace('0 Saved title', '0 measurement-model')
        .replace('0 Name: fixture.ldr', '0 Name: measurement-model.ldr').replace('0 Author: Someone', '0 Author: Brickwright');
    assert.notEqual(hash(wrongTwelve), hash(expectedSix));
    await run(await fixture(({packet, record}) => {
        record.ldraw = savedTwelve;
        packet.modelSha256 = hash(wrongTwelve);
        packet.runs.forEach(r => { r.modelSha256 = packet.modelSha256; });
    }), result => {
        assert.notEqual(result.status, 0);
        assert.match(result.stderr, /canonical authored-model join/);
    });
});

const canonicalReaders = [script, fileURLToPath(new URL('../scripts/read-sim-lab-dynamics-artifact.py', import.meta.url))];
const canonicalProbe = payload => {
    const code = `import importlib.util,json,sys
p=json.load(sys.stdin);out=[]
for index,path in enumerate(p['paths']):
 spec=importlib.util.spec_from_file_location('independent_reader_'+str(index),path);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
 values=[m.canonical_number6(token) for token in p.get('numbers',[])]
 models=[m.canonical_ldraw_text(body,'fixture.ldr') for body in p.get('models',[])]
 refused=[]
 for token in p.get('invalid',[]):
  try:m.canonical_number6(token)
  except ValueError:refused.append(True)
  else:refused.append(False)
 out.append({'numbers':values,'models':models,'refused':refused})
print(json.dumps(out))`;
    const result = spawnSync(PYTHON, ['-B', '-c', code], {input: JSON.stringify({paths: canonicalReaders, ...payload}), encoding: 'utf8', timeout: 10000});
    assert.equal(result.status, 0, result.stderr);
    return JSON.parse(result.stdout);
};
test('both standalone readers independently preserve binary rounding, negative-zero and near-integer rules', () => {
    const numbers = ['-0', '-0.000000000001', '0.999999999999', '1.0000000005', '0.384615384615', '0.0000005', '-0.0000005', '-0.5'];
    const expected = ['0', '0', '1', '1', '0.384615', '0', '0', '-0.5'];
    for (const output of canonicalProbe({numbers, invalid: ['NaN', 'Infinity', '1e21', '1_0']})) {
        assert.deepEqual(output.numbers, expected);
        assert.deepEqual(output.refused, [true, true, true, true]);
    }
});
test('only root placement/ROTOR/ROPE/DRAW numbers change; IDs, comments and embedded MPD data remain exact', () => {
    const root = ['0 FILE fixture.ldr', '0 Saved title', '0 Name: fixture.ldr', '0 Author: Someone',
        '0 comment 0.384615384615', '0 !BW ID part0.384615384615',
        '0 !BW ROTOR 0.384615384615', '0 !BW ROPE rope0.384615384615 0.384615384615 a b',
        '0 !BW DRAW surface0.384615384615 pen0.384615384615 0.384615384615 0.999999999999 -0.000000000001 1 2 3 0.0000005',
        '1 16 0.384615384615 0.999999999999 -0.000000000001 1 0 0 0 1 0 0 0 1 part0.384615384615.dat'];
    const normalizedRoot = ['0 FILE measurement-model.ldr', '0 measurement-model', '0 Name: measurement-model.ldr', '0 Author: Brickwright',
        root[4], root[5], '0 !BW ROTOR 0.384615', '0 !BW ROPE rope0.384615384615 0.384615 a b',
        '0 !BW DRAW surface0.384615384615 pen0.384615384615 0.384615 1 0 1 2 3 0',
        '1 16 0.384615 1 0 1 0 0 0 1 0 0 0 1 part0.384615384615.dat'];
    const child = ['0 FILE child.dat', '0 !BW ROTOR 0.384615384615',
        '1 16 0.384615384615 1e21 0 1 0 0 0 1 0 0 0 1 embedded.dat', '0 NOFILE'];
    for (const delimiter of [[], ['0 NOFILE']]) {
        const original = [...root, ...delimiter, ...child].join('\r\n') + '\r\n';
        const expected = [...normalizedRoot, ...delimiter, ...child].join('\r\n') + '\r\n';
        for (const output of canonicalProbe({models: [original]})) assert.deepEqual(output.models, [expected]);
    }
});
