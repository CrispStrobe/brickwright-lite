import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, mkdtempSync, writeFileSync, rmSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const cuiPin = '6cfe5561dd173655a857e5ab0c029b11c7f92b35';
const boardPin = '31c6499a617e274505386dbbc9d3a955e8f527ac';
const cli = path.join(root, 'node_modules/bw-circuit-ui/bin/bwc.mjs');
const env = {...process.env}; delete env.BW_BOARD;
const run = (file, prefix = []) => spawnSync(process.execPath,
    [...prefix, cli, 'op', file, '--kcl', '--json'],
    {cwd: root, env, encoding: 'utf8', timeout: 30000});

test('static KCL adoption binds exact CUI pin and keeps the reviewed Board unchanged', () => {
    const pins = JSON.parse(readFileSync(path.join(root, 'vendor-pins.json')));
    assert.equal(pins['bw-circuit-ui'], cuiPin);
    assert.equal(pins['bw-board'], boardPin);
    const pkg = JSON.parse(readFileSync(path.join(root, 'package.json')));
    const lock = JSON.parse(readFileSync(path.join(root, 'package-lock.json')));
    for (const [name, sha] of [['bw-board', boardPin], ['bw-circuit-ui', cuiPin]]) {
        assert.equal(pkg.devDependencies[name], `github:CrispStrobe/${name}#${sha}`);
        assert.ok(lock.packages[`node_modules/${name}`].resolved.endsWith(`#${sha}`));
    }
    assert.equal(JSON.parse(readFileSync(path.join(root, 'node_modules/bw-circuit-ui/package.json'))).name,
        'bw-circuit-ui');
});

test('installed KCL CLI exposes complete signed observations for positive, negative and zero controls', t => {
    const dir = mkdtempSync(path.join(tmpdir(), 'lite-installed-kcl-'));
    t.after(() => rmSync(dir, {recursive: true, force: true}));
    const file = path.join(dir, 'divider.cir');
    for (const volts of [6, -6, 0]) {
        writeFileSync(file, `authored consumer divider\nV1 in 0 ${volts}\nR1 in out 1k\nR2 out 0 2k\n.op\n.end\n`);
        const child = run(file);
        assert.equal(child.status, 0, child.stderr);
        const {kcl} = JSON.parse(child.stdout);
        assert.equal(kcl.status, 'pass');
        assert.deepEqual(kcl.counts, {nets: 3, parts: 3, terminals: 6,
            checked: 6, passed: 6, failed: 0, unavailable: 0});
        const expected = volts === 0 ? 0 : -volts / 3000;
        assert.equal(kcl.observations.find(row => row.part === 'V1' && row.terminal === 'pos').currentAmps,
            expected, 'source sign is independently authored, not derived from the native current');
        assert.equal(kcl.observations.find(row => row.part === 'R1' && row.terminal === 'a').currentAmps,
            volts / 3000);
        assert.equal(kcl.observations.length, 6);
        assert.equal(kcl.claims.independentOracle, false);
        assert.equal(kcl.claims.transientConservation, false);
        assert.equal(kcl.claims.physicalDeviceCertification, false);
    }
});

test('installed KCL CLI rejects three native-current mutants without touching package bytes', t => {
    const dir = mkdtempSync(path.join(tmpdir(), 'lite-installed-kcl-mutants-'));
    t.after(() => rmSync(dir, {recursive: true, force: true}));
    const file = path.join(dir, 'divider.cir');
    writeFileSync(file, 'authored consumer mutation control\nV1 in 0 6\nR1 in out 1k\nR2 out 0 2k\n.op\n.end\n');
    const engine = import.meta.resolve('bw-board/board.js');
    for (const [name, mutation, exit, status] of [
        ['reversed-source', "for(const [t,i] of p.branchCurrents.get('V1')) p.branchCurrents.get('V1').set(t,-i);", 1, 'fail'],
        ['missing-source-terminal', "p.branchCurrents.get('V1').delete('pos');", 2, 'refused'],
        ['indeterminate-source', "p.indeterminateBranchCurrents.add('V1');", 2, 'refused'],
    ]) {
        const preload = `import {BoardImpl} from ${JSON.stringify(engine)};
            const original=BoardImpl.prototype.operatingPoint;
            BoardImpl.prototype.operatingPoint=function(...args){const p=original.apply(this,args);${mutation}return p;};`;
        const child = run(file, ['--import', `data:text/javascript,${encodeURIComponent(preload)}`]);
        assert.equal(child.status, exit, `${name}: ${child.stderr}`);
        const {kcl} = JSON.parse(child.stdout);
        assert.equal(kcl.status, status, name);
        if (status === 'fail') assert.equal(kcl.counts.failed, 2);
        else assert.equal(kcl.counts.passed, 0);
    }
    const restored = run(file);
    assert.equal(restored.status, 0, restored.stderr);
    assert.equal(JSON.parse(restored.stdout).kcl.status, 'pass');
});
