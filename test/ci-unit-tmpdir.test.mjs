import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fixture} from './fixtures/conversion-context-catalogue.mjs';

const workflow=readFileSync(new URL('../.github/workflows/build.yml',import.meta.url),'utf8');
const unitStep=text=>{
 const job=/^  unit:\n([\s\S]*?)(?=^  [a-z][\w-]*:\n|(?![\s\S]))/m.exec(text)?.[1];
 if(!job)return null;
 const step=/^      - name: Run unit tests\n([\s\S]*?)(?=^      - (?:name:|uses:)|(?!(?:[\s\S])))/m.exec(job)?.[1];
 return step||null;
};
const inspect=text=>{
 const step=unitStep(text);if(!step)return false;
 const env=/^        env:\n([\s\S]*?)(?=^        \w|(?!(?:[\s\S])))/m.exec(step)?.[1];
 return !!env&&/^          TMPDIR: \$\{\{ runner\.temp \}\}\s*$/m.test(env)&&
  /npm run test:fast:shard/.test(step);
};

test('the actual complete unit shard step supplies the explicit runner-owned TMPDIR',()=>{
 assert.equal(inspect(workflow),true);
});

test('omitted host-default and sibling-step temporary roots cannot replace the unit test environment',()=>{
 const original=unitStep(workflow);assert.ok(original);
 const assignment='          TMPDIR: ${{ runner.temp }}';assert.ok(original.includes(assignment));
 for(const replacement of ['', '          TMPDIR: /tmp', '          TMPDIR: ${{ github.workspace }}']){
  const mutatedStep=original.replace(assignment,replacement);assert.notEqual(mutatedStep,original);
  const index=workflow.indexOf(original);assert.ok(index>=0);
  const changed=workflow.slice(0,index)+mutatedStep+workflow.slice(index+original.length);
  assert.equal(unitStep(changed),mutatedStep,'the actual selected step changed');
  assert.equal(inspect(changed),false);
 }
 const omitted=workflow.replace(assignment,'');assert.notEqual(omitted,workflow);
 const sibling=omitted.replace('      - name: Run unit tests\n','      - name: Other temporary consumer\n        env:\n'+assignment+'\n        run: echo unrelated\n      - name: Run unit tests\n');
 assert.notEqual(sibling,omitted);assert.equal(inspect(sibling),false);
});

test('conversion fixture still refuses a missing explicit temporary root before invoking its operation',async()=>{
 const previous=process.env.TMPDIR;delete process.env.TMPDIR;let invoked=false;
 try{await assert.rejects(fixture(()=>{invoked=true;}),/Fixture requires an explicit owned TMPDIR/);assert.equal(invoked,false);}
 finally{if(previous===undefined)delete process.env.TMPDIR;else process.env.TMPDIR=previous;}
});
