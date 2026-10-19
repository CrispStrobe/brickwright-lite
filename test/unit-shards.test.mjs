import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import {listTests} from '../scripts/list-tests.mjs';
const root=path.resolve(import.meta.dirname,'..');
const workflow=readFileSync(path.join(root,'.github/workflows/build.yml'),'utf8');
const pkg=JSON.parse(readFileSync(path.join(root,'package.json'),'utf8'));
const jobs=new Map([...workflow.matchAll(/^  ([a-z][\w-]*):\n([\s\S]*?)(?=^  [a-z][\w-]*:\n|(?![\s\S]))/gm)].map(m=>[m[1],m[2]]));

test('required shards partition the complete fast set once, keeping corpus and local full suites intact',()=>{
    const full=listTests('fast'),first=listTests('fast','1/2'),second=listTests('fast','2/2');
    assert.ok(first.length>0&&second.length>0);
    assert.equal(new Set([...first,...second]).size,first.length+second.length);
    assert.deepEqual([...first,...second].sort(),full);
    assert.deepEqual([...full,...listTests('corpus')].sort(),listTests('all'));
    const cli=spawnSync(process.execPath,['scripts/list-tests.mjs','fast','--shard','1/2'],{cwd:root,encoding:'utf8'});
    assert.equal(cli.status,0,cli.stderr);assert.deepEqual(cli.stdout.trim().split('\n'),first);
    assert.match(pkg.scripts['test:fast'],/\$\(node scripts\/list-tests.mjs fast\)/);
    const runner=pkg.scripts['test:fast:shard'];
    assert.match(runner,/files=\$\(node scripts\/list-tests.mjs fast --shard "\$BW_TEST_SHARD"\) && /);
    assert.equal(runner.slice(runner.indexOf('BW_GUI_SCOPE_LOG=')),pkg.scripts['test:fast'].slice(pkg.scripts['test:fast'].indexOf('BW_GUI_SCOPE_LOG=')).replace('$(node scripts/list-tests.mjs fast)','$files'));
});

test('invalid or unsupported shard requests refuse instead of falling back to an unselected suite',()=>{
    for(const value of ['', '0/2','3/2','1/0','01/2','1/65','x/2','1','1/2/3'])assert.throws(()=>listTests('fast',value),/Expected test shard/);
    assert.throws(()=>listTests('corpus','1/2'),/Only the fast set/);
    const cli=spawnSync(process.execPath,['scripts/list-tests.mjs','fast','--shard','3/2'],{cwd:root,encoding:'utf8'});
    assert.notEqual(cli.status,0);assert.equal(cli.stdout,'');
});

test('unit shards retain exact integrated build prerequisites and hard deployment/census gates',()=>{
    for(const key of ['build','unit','deploy'])assert.ok(jobs.has(key),key);
    const unit=jobs.get('unit'),build=jobs.get('build'),deploy=jobs.get('deploy');
    assert.match(unit,/fail-fast: false/);assert.match(unit,/shard: \[1, 2\]/);
    const unitPrep=unit.slice(unit.indexOf('    runs-on:'),unit.indexOf('      - name: Run unit tests\n')).trimEnd();
    const buildPrep=build.slice(build.indexOf('    runs-on:'),build.indexOf('      # A green suite says')).trimEnd();
    assert.equal(unitPrep,buildPrep,'unit preparation must not omit or drift from the integrated build prerequisites');
    assert.ok(unitPrep.includes('steps.stc_flasher_pin.outputs.sha'));
    assert.match(unit,/BW_TEST_SHARD: \$\{\{ matrix.shard \}\}\/2/);
    assert.match(unit,/npm run test:fast:shard 2>&1 \| tee \/tmp\/unit.tap/);
    assert.match(unit,/check-test-run.mjs --set fast --shard "\$BW_TEST_SHARD" --tap/);
    assert.match(unit,/check-gui-scope.mjs --log test-results\/fast.gui-scope.tsv/);
    assert.match(unit,/name: unit-shard-\$\{\{ matrix.shard \}\}/);
    assert.doesNotMatch(unit,/^    continue-on-error:|upload-pages-artifact/m);
    assert.doesNotMatch(unit.slice(unit.indexOf('      - name: Run unit tests\n')),/continue-on-error:/);
    const collector=readFileSync(path.join(root,'scripts/gen-ci-skips.mjs'),'utf8');
    for(const name of ['unit (1/2)','unit (2/2)'])assert.ok(collector.includes(name),name);
    assert.doesNotMatch(build,/- name: Run unit tests\n/);
    assert.match(deploy,/needs: \[build, unit, corpus, browser, fpga-surface, guard\]/);
    assert.doesNotMatch(deploy,/always\(\)/);
});

test('live shard census audit rejects missing, misplaced, uncounted-failure and undocumented-skip reports',()=>{
    const dir=mkdtempSync(path.join(os.tmpdir(),'bw-unit-shard-control-'));
    try {
        const selected=listTests('fast','1/2'),other=listTests('fast','2/2')[0];
        const files=Object.fromEntries(selected.map(file=>[file,{tests:1,passed:1,failed:0,stdoutBytes:0,skipped:[]}]));
        const summary=`# tests ${selected.length}\n# pass ${selected.length}\n# fail 0\n# cancelled 0\n# skipped 0\n`;
        const audit=(entries,tap)=>{
            writeFileSync(path.join(dir,'census.json'),JSON.stringify({files:entries,events:selected.length}));writeFileSync(path.join(dir,'run.tap'),tap);
            return spawnSync(process.execPath,['scripts/check-test-run.mjs','--set','fast','--shard','1/2','--tap',path.join(dir,'run.tap'),'--census',path.join(dir,'census.json'),'--max-stdout-bytes','0'],{cwd:root,encoding:'utf8'});
        };
        const good=audit(files,summary);assert.equal(good.status,0,good.stdout+good.stderr);
        const missing={...files};delete missing[selected[0]];assert.notEqual(audit(missing,summary).status,0);
        assert.notEqual(audit({...files,[other]:files[selected[0]]},summary).status,0);
        assert.notEqual(audit(files,'not ok 1 - deliberately uncounted failure\n'+summary).status,0);
        // Known-open tests: a TODO naming an existing docs/….md passes; without one, or naming a doc
        // that does not exist, the step is red (owner decision 2026-10-19).
        const todoSummary=summary.replace('# skipped 0','# skipped 0\n# todo 1');
        const todoOk=audit(files,'not ok 1 - known open # TODO tracked; see docs/ROBOT-LAB-VALIDATION.md\n'+todoSummary);
        assert.equal(todoOk.status,0,todoOk.stdout+todoOk.stderr);
        assert.notEqual(audit(files,'not ok 1 - known open # TODO no pointer\n'+todoSummary).status,0);
        assert.notEqual(audit(files,'not ok 1 - known open # TODO see docs/NO-SUCH-DOC.md\n'+todoSummary).status,0);
        const skipped={...files,[selected[0]]:{...files[selected[0]],skipped:[{name:'synthetic guard control',reason:'not an approved execution pointer'}]}};
        assert.notEqual(audit(skipped,summary.replace('# skipped 0','# skipped 1')).status,0);
    }finally{rmSync(dir,{recursive:true,force:true});}
});
