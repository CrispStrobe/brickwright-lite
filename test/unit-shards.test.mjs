import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import {listTests,assignShards,TIMINGS,FILE_OVERHEAD_SECONDS} from '../scripts/list-tests.mjs';
import {createHash} from 'node:crypto';
const root=path.resolve(import.meta.dirname,'..');
const workflow=readFileSync(path.join(root,'.github/workflows/build.yml'),'utf8');
const pkg=JSON.parse(readFileSync(path.join(root,'package.json'),'utf8'));
const jobs=new Map([...workflow.matchAll(/^  ([a-z][\w-]*):\n([\s\S]*?)(?=^  [a-z][\w-]*:\n|(?![\s\S]))/gm)].map(m=>[m[1],m[2]]));

test('required shards partition the complete fast set once, keeping corpus and local full suites intact',()=>{
    const full=listTests('fast'), shards=[1,2,3,4,5,6].map(index=>listTests('fast',`${index}/6`));
    assert.ok(shards.every(files=>files.length>0));
    const combined=shards.flat();
    assert.equal(new Set(combined).size,combined.length);
    assert.deepEqual(combined.sort(),full);
    // Balanced by measured time: no leg's predicted load exceeds another's by more
    // than the single heaviest file (the greedy longest-first bound).
    const load=files=>files.reduce((sum,file)=>sum+(Object.hasOwn(TIMINGS,file)?TIMINGS[file]+FILE_OVERHEAD_SECONDS:0),0);
    const loads=shards.map(load),heaviest=Math.max(...full.map(file=>TIMINGS[file]??0))+FILE_OVERHEAD_SECONDS;
    assert.ok(Math.max(...loads)-Math.min(...loads)<=heaviest,`shard loads ${loads.map(Math.round)} must balance within ${heaviest}s`);
    assert.deepEqual(shards,[1,2,3,4,5,6].map(index=>listTests('fast',`${index}/6`)),'assignment must be deterministic');
    assert.deepEqual([...full,...listTests('corpus')].sort(),listTests('all'));
    for(const index of [1,2,3,4,5,6]) {
        const cli=spawnSync(process.execPath,['scripts/list-tests.mjs','fast','--shard',`${index}/6`],{cwd:root,encoding:'utf8'});
        assert.equal(cli.status,0,cli.stderr);assert.deepEqual(cli.stdout.trim().split('\n'),shards[index-1]);
    }
    assert.match(pkg.scripts['test:fast'],/\$\(node scripts\/list-tests.mjs fast\)/);
    const runner=pkg.scripts['test:fast:shard'];
    assert.match(runner,/files=\$\(node scripts\/list-tests.mjs fast --shard "\$BW_TEST_SHARD"\) && /);
    assert.equal(runner.slice(runner.indexOf('BW_GUI_SCOPE_LOG=')),pkg.scripts['test:fast'].slice(pkg.scripts['test:fast'].indexOf('BW_GUI_SCOPE_LOG=')).replace('$(node scripts/list-tests.mjs fast)','$files'));
});

test('greedy timing assignment is longest-first to the lightest leg; untimed files fall back to name hashing',()=>{
    const timings={'test/a.test.mjs':10,'test/b.test.mjs':6,'test/c.test.mjs':5,'test/d.test.mjs':1};
    const files=[...Object.keys(timings),'test/new-one.test.mjs','test/new-two.test.mjs'];
    const got=assignShards(files,2,timings);
    assert.equal(got.get('test/a.test.mjs'),0);assert.equal(got.get('test/b.test.mjs'),1);
    assert.equal(got.get('test/c.test.mjs'),1);assert.equal(got.get('test/d.test.mjs'),0);
    for(const file of ['test/new-one.test.mjs','test/new-two.test.mjs'])
        assert.equal(got.get(file),createHash('sha256').update(path.basename(file)).digest().readUInt32BE(0)%2);
    assert.deepEqual([...assignShards([...files].reverse(),2,timings)].sort(),[...got].sort(),'input order must not matter');
    assert.equal(got.size,files.length);
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
    assert.match(unit,/timeout-minutes: 30/);
    assert.match(unit,/fail-fast: false/);assert.match(unit,/shard: \[1, 2, 3, 4, 5, 6\]/);
    const arraysAdmission='      - name: Admit the pinned Arrays source for native unit inputs\n'+
        '        id: arrays_number_value_source\n'+
        "        if: ${{ !cancelled() && steps.overlays.outcome == 'success' }}\n"+
        '        run: node scripts/admit-arrays-number-value-test-source.mjs';
    const fullUnitPrep=unit.slice(unit.indexOf('    runs-on:'),unit.indexOf('      - name: Run unit tests\n')).trimEnd();
    assert.equal(fullUnitPrep.split(arraysAdmission).length,2,'exactly one complete unit-only Arrays admission follows production preparation');
    assert.ok(fullUnitPrep.endsWith(arraysAdmission),'no unreviewed step may follow the unit-only source admission');
    assert.doesNotMatch(build,/Admit the pinned Arrays source for native unit inputs/);
    const unitPrep=fullUnitPrep.slice(0,-arraysAdmission.length).trimEnd();
    const buildPrep=build.slice(build.indexOf('    runs-on:'),build.indexOf('      # A green suite says')).trimEnd();
    assert.equal(unitPrep,buildPrep,'unit preparation must not omit or drift from the integrated build prerequisites');
    assert.ok(unitPrep.includes('steps.stc_flasher_pin.outputs.sha'));
    assert.match(unit,/BW_TEST_SHARD: \$\{\{ matrix.shard \}\}\/6/);
    assert.match(unit,/steps\.arrays_number_value_source\.outcome == 'success'/);
    assert.match(unit,/BW_ARRAY_NUMBER_VALUE_SOURCE: \$\{\{ github\.workspace \}\}\/test-results\/arrays-number-value-input\/arrays\.js/);
    assert.match(unit,/npm run test:fast:shard 2>&1 \| tee \/tmp\/unit.tap/);
    assert.match(unit,/check-test-run.mjs --set fast --shard "\$BW_TEST_SHARD" --tap/);
    assert.match(unit,/check-gui-scope.mjs --log test-results\/fast.gui-scope.tsv/);
    assert.match(unit,/name: unit-shard-\$\{\{ matrix.shard \}\}/);
    assert.doesNotMatch(unit,/^    continue-on-error:|upload-pages-artifact/m);
    assert.doesNotMatch(unit.slice(unit.indexOf('      - name: Run unit tests\n')),/continue-on-error:/);
    const collector=readFileSync(path.join(root,'scripts/gen-ci-skips.mjs'),'utf8');
    for(const name of ['unit (1/2)','unit (2/2)','unit (1/4)','unit (2/4)','unit (3/4)','unit (4/4)','unit (1/6)','unit (2/6)','unit (3/6)','unit (4/6)','unit (5/6)','unit (6/6)'])assert.ok(collector.includes(name),name);
    assert.doesNotMatch(build,/- name: Run unit tests\n/);
    assert.match(deploy,/needs: \[build, unit, corpus, browser, fpga-surface, arcade-numeric-authoring, guard\]/);
    assert.doesNotMatch(deploy,/always\(\)/);
});

test('live shard census audit rejects missing, misplaced, uncounted-failure and undocumented-skip reports',()=>{
    const dir=mkdtempSync(path.join(os.tmpdir(),'bw-unit-shard-control-'));
    try {
        const selected=listTests('fast','1/6'),other=listTests('fast','2/6')[0];
        const files=Object.fromEntries(selected.map(file=>[file,{tests:1,passed:1,failed:0,stdoutBytes:0,skipped:[],todo:[]}]));
        const summary=`# tests ${selected.length}\n# pass ${selected.length}\n# fail 0\n# cancelled 0\n# skipped 0\n`;
        const audit=(entries,tap)=>{
            writeFileSync(path.join(dir,'census.json'),JSON.stringify({files:entries,events:selected.length}));writeFileSync(path.join(dir,'run.tap'),tap);
            return spawnSync(process.execPath,['scripts/check-test-run.mjs','--set','fast','--shard','1/6','--tap',path.join(dir,'run.tap'),'--census',path.join(dir,'census.json'),'--max-stdout-bytes','0'],{cwd:root,encoding:'utf8'});
        };
        const good=audit(files,summary);assert.equal(good.status,0,good.stdout+good.stderr);
        const missing={...files};delete missing[selected[0]];assert.notEqual(audit(missing,summary).status,0);
        assert.notEqual(audit({...files,[other]:files[selected[0]]},summary).status,0);
        assert.notEqual(audit(files,'not ok 1 - deliberately uncounted failure\n'+summary).status,0);
        // Known-open tests: a TODO naming an existing docs/….md passes; without one, or naming a doc
        // that does not exist, the step is red (owner decision 2026-10-19).
        const todoSummary=summary.replace(`# pass ${selected.length}`,`# pass ${selected.length-1}`).replace('# skipped 0','# skipped 0\n# todo 1');
        const todoFiles={...files,[selected[0]]:{...files[selected[0]],passed:0,
            todo:[{name:'known open',reason:'tracked; see docs/ROBOT-LAB-VALIDATION.md',passed:false,type:'test'}]}};
        const todoOk=audit(todoFiles,'not ok 1 - known open # TODO tracked; see docs/ROBOT-LAB-VALIDATION.md\n'+todoSummary);
        assert.equal(todoOk.status,0,todoOk.stdout+todoOk.stderr);
        assert.notEqual(audit(todoFiles,'not ok 1 - known open # TODO no pointer\n'+todoSummary).status,0);
        assert.notEqual(audit(todoFiles,'not ok 1 - known open # TODO see docs/NO-SUCH-DOC.md\n'+todoSummary).status,0);
        assert.notEqual(audit(files,'not ok 1 - known open # TODO tracked; see docs/ROBOT-LAB-VALIDATION.md\n'+todoSummary).status,0,
            'a doc pointer cannot replace a missing detailed pending record');
        const ordinaryLegacy=Object.fromEntries(Object.entries(files).map(([file,bucket])=>{
            const copy={...bucket};delete copy.todo;return [file,copy];
        }));
        assert.equal(audit(ordinaryLegacy,summary).status,0,'ordinary buckets may retain the old absent-todo representation');
        const skipped={...files,[selected[0]]:{...files[selected[0]],skipped:[{name:'synthetic guard control',reason:'not an approved execution pointer'}]}};
        assert.notEqual(audit(skipped,summary.replace('# skipped 0','# skipped 1')).status,0);
    }finally{rmSync(dir,{recursive:true,force:true});}
});

test('timing reader slices the TAP by census counts and refuses a count mismatch',async()=>{
    const {shardTimings}=await import('../scripts/gen-unit-test-timings.mjs');
    const tap=['    ok 1 - inner','      ---','      duration_ms: 400','      ...','ok 1 - first','  ---','  duration_ms: 1500','  ...',
        'ok 2 - second','  ---','  duration_ms: 250','  ...','not ok 3 - third','  ---','  duration_ms: 2000','  ...'].join('\n');
    const census={files:{'/x/test/one.test.mjs':{tests:3},'/x/test/two.test.mjs':{tests:1}}};
    assert.deepEqual(shardTimings(tap,census),{'test/one.test.mjs':1.8,'test/two.test.mjs':2});
    assert.throws(()=>shardTimings(tap,{files:{'/x/test/one.test.mjs':{tests:3}}}),/census counts 3 events, TAP has 4/);
});
