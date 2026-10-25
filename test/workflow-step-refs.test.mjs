import test from 'node:test';
import assert from 'node:assert/strict';
import {stepReferenceProblems} from '../scripts/lib/workflow-step-refs.mjs';
const source=(first,second='')=>'jobs:\n  first:\n    steps:\n'+first+(second?'  second:\n    steps:\n'+second:'');
const declares='      - id: ready\n        run: true\n';
const gated="      - name: gate\n        if: steps.ready.outcome == 'success'\n        run: true\n";

test('identical prior IDs in separate jobs resolve independently',()=>{
    assert.deepEqual(stepReferenceProblems(source(declares+gated,declares+gated)),[]);
    assert.deepEqual(stepReferenceProblems(source(declares+gated,"      - id: ready\n        run: true\n")),[]);
});
test('sibling job IDs cannot authorize a gate and later local IDs remain failures',()=>{
    const foreign=stepReferenceProblems(source(declares,gated));assert.equal(foreign.length,1);assert.match(foreign[0],/second.*never declared in this job/);
    const later=stepReferenceProblems(source(gated+declares,declares+gated));assert.equal(later.length,1);assert.match(later[0],/first.*LATER/);
    const lateSibling=stepReferenceProblems(source(declares+gated,gated+declares));assert.equal(lateSibling.length,1);assert.match(lateSibling[0],/second.*LATER/);
});
test('same-step outcomes, duplicate IDs and multiline missing refs are refused',()=>{
    assert.match(stepReferenceProblems(source("      - id: ready\n        if: steps.ready.outcome == 'success'\n        run: true\n"))[0],/this step/);
    assert.match(stepReferenceProblems(source(declares+declares+gated))[0],/duplicate step id/);
    const multiline="      - name: gate\n        if: >-\n          steps.ready.outcome == 'success' &&\n          steps.missing.outcome == 'success'\n        run: true\n";
    const problems=stepReferenceProblems(source(declares+multiline));assert.equal(problems.length,1);assert.match(problems[0],/missing.*never declared/);
    assert.throws(()=>stepReferenceProblems('jobs:\n'),/no workflow jobs/);
});
