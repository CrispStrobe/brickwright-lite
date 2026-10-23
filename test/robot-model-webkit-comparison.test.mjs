// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {FROZEN,admitComparisonSource,boundedComparisonFetch,observeSafely,comparisonOutcome} from '../scripts/qualify-robot-model-webkit.mjs';
const fixture=()=>({head:FROZEN.reviewedHeadSha,tree:FROZEN.treeSha,metadata:{job:{id:FROZEN.jobId},artifact:{id:FROZEN.artifactId,size_in_bytes:FROZEN.archiveBytes,digest:FROZEN.archiveDigest}}});
test('comparison admits only the reviewed whole tree and frozen existing artifact',()=>{
    assert.deepEqual(admitComparisonSource(fixture()),FROZEN);
    for(const cut of [x=>x.head='0'.repeat(40),x=>x.tree='1'.repeat(40),x=>x.metadata.job.id++,x=>x.metadata.artifact.id++,x=>x.metadata.artifact.size_in_bytes++,x=>x.metadata.artifact.digest='sha256:'+'f'.repeat(64)]){
        const input=fixture();cut(input);assert.throws(()=>admitComparisonSource(input));
    }
});
test('metadata streaming enforces actual bytes and cancels before concatenation',async()=>{
    let cancelled=false;
    let chunk=0;const body=new ReadableStream({pull(c){if(chunk++===0)c.enqueue(new Uint8Array(3*1024*1024));else if(chunk===2)c.enqueue(new Uint8Array(2*1024*1024));else c.close();},cancel(){cancelled=true;}},{highWaterMark:0});
    const get=boundedComparisonFetch(async()=>new Response(body));
    const response=await get('https://api.github.com/repos/CrispStrobe/brickwright-lite/actions/runs/39951811631');
    await assert.rejects(response.json(),/Actual response bound/);assert.equal(cancelled,true);
});
test('oversized declared bytes refuse without reading or buffering the stream',async()=>{
    let pulled=0,cancelled=false;
    const body=new ReadableStream({pull(){pulled++;},cancel(){cancelled=true;}},{highWaterMark:0});
    const get=boundedComparisonFetch(async()=>new Response(body,{headers:{'content-length':String(5*1024*1024)}}));
    await assert.rejects(get('https://api.github.com/repos/CrispStrobe/brickwright-lite/actions/runs/39951811631'),/Declared response bound/);
    assert.equal(pulled,0);assert.equal(cancelled,true);
});
test('safe real response is read once; requests have a deadline and finite count',async()=>{
    let requests=0;
    const get=boundedComparisonFetch(async(url,options)=>{requests++;assert.ok(options.signal instanceof AbortSignal);return new Response('{"ok":true}');});
    const response=await get('https://api.github.com/repos/CrispStrobe/brickwright-lite/actions/runs/39951811631');
    assert.deepEqual(await response.json(),{ok:true});assert.deepEqual(await response.json(),{ok:true});
    for(let i=1;i<20;i++)await get('https://api.github.com/repos/CrispStrobe/brickwright-lite/actions/runs/39951811631');
    await assert.rejects(get('https://api.github.com/repos/CrispStrobe/brickwright-lite/actions/runs/39951811631'),/request count/);assert.equal(requests,20);
});
test('unapproved artifact transport and credentials refuse before any request',async()=>{
    let requests=0;const get=boundedComparisonFetch(async()=>{requests++;throw Error('unexpected request');});
    for(const url of ['http://api.github.com/x','https://example.org/x','https://evilgithubusercontent.com/x','https://token@api.github.com/x','https://api.github.com:444/x'])await assert.rejects(get(url));
    assert.equal(requests,0);
});
test('completed original CDN response can be retained before downstream digest refusal',async()=>{
    let original;const get=boundedComparisonFetch(async()=>new Response('original bytes'),{onArchiveBytes:bytes=>{original=bytes;}});
    const response=await get('https://fixture.actions.githubusercontent.com/artifact');
    assert.equal((await response.arrayBuffer()).toString(),'original bytes');assert.equal(original.toString(),'original bytes');
});
test('observer errors remain bounded and distinct from the actual journey result',async()=>{
    const errors=[];await observeSafely(async()=>{throw Error('x'.repeat(4000));},async message=>errors.push({message}));
    assert.equal(errors.length,1);assert.equal(errors[0].message.length,1024);
    assert.deepEqual(comparisonOutcome(0,[]),{journeyExit:0,status:'PASS',observerErrors:[]});
    assert.deepEqual(comparisonOutcome(1,[]),{journeyExit:1,status:'FAIL',observerErrors:[]});
    assert.deepEqual(comparisonOutcome(0,errors),{journeyExit:0,status:'UNQUALIFIED_OBSERVER_ERROR',observerErrors:errors});
    assert.equal(comparisonOutcome(1,errors).journeyExit,1);
});

test('job-level environment uses contexts available before runner assignment',()=>{
    const text=readFileSync(new URL('../.github/workflows/robot-model-webkit-comparison.yml',import.meta.url),'utf8');
    const admit=text=>{
        const environment=text.match(/^    env:\n([\s\S]*?)^    steps:/m)?.[1];
        assert.ok(environment,'Explicit job environment');
        for(const expression of environment.matchAll(/\$\{\{\s*([A-Za-z_]\w*)\./g))
            assert.ok(['github','needs','strategy','matrix','vars','secrets','inputs'].includes(expression[1]),'Context available to jobs.<job_id>.env');
    };
    admit(text);
    assert.throws(()=>admit(text.replace('github.workspace','runner.temp')),/Context available/);
});
