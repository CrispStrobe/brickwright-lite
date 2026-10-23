// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {FROZEN,RUNTIME_IMAGE,webkitDependencyLibraryPath,admitPreprovisionedRuntime,admitComparisonSource,boundedComparisonFetch,observeSafely,comparisonOutcome} from '../scripts/qualify-robot-model-webkit.mjs';
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
    assert.throws(()=>admit(text.replace('PLAYWRIGHT_BROWSERS_PATH: /ms-playwright','PLAYWRIGHT_BROWSERS_PATH: ${{ runner.temp }}')),/Context available/);
});


test('workflow candidate checkout binds the same immutable reviewed source as admission',()=>{
    const text=readFileSync(new URL('../.github/workflows/robot-model-webkit-comparison.yml',import.meta.url),'utf8');
    const candidate=text.match(/- name: Checkout frozen candidate\n([\s\S]*?)      - uses:/)?.[1];
    assert.ok(candidate,'Explicit frozen candidate checkout');
    const admit=text=>assert.equal(text.match(/ref: ([0-9a-f]{40})/)?.[1],FROZEN.reviewedHeadSha);
    admit(candidate);
    assert.throws(()=>admit(candidate.replace(FROZEN.reviewedHeadSha,'0'.repeat(40))));
});

const runtimePacket=()=>({image:RUNTIME_IMAGE,platform:'linux',arch:'x64',distro:'ubuntu',ubuntu:'24.04',node:'v22.23.4',playwright:'1.62.1',
    webkit:{revision:'2336',browserVersion:'26.5'},executable:'/ms-playwright/webkit-2336/pw_run.sh',
    inheritedDependencyLibraryPath:'',dependencyLibraryPath:webkitDependencyLibraryPath('/ms-playwright/webkit-2336'),
    files:{'pw_run.sh':true,'minibrowser-wpe/bin/MiniBrowser':true,'minibrowser-wpe/bin/WPEWebProcess':true},missingDependencies:[],
    processObserverAvailable:true,processObserverCommand:['ps','-eo','pid,ppid,pcpu,rss,comm']});
test('preprovisioned admission requires the exact image, locked runtime and complete native dependency closure',()=>{
    assert.deepEqual(admitPreprovisionedRuntime(runtimePacket()),runtimePacket());
    for(const cut of [p=>p.image='mutable:latest',p=>p.platform='darwin',p=>p.arch='arm64',p=>p.distro='debian',p=>p.ubuntu='22.04',
        p=>p.node='v24.0.0',p=>p.playwright='1.64.0',p=>p.webkit.revision='other',p=>p.webkit.browserVersion='other',
        p=>p.executable='/other/pw_run.sh',p=>delete p.files['minibrowser-wpe/bin/WPEWebProcess'],p=>p.missingDependencies=['libmissing.so => not found'],
        p=>p.processObserverAvailable=false,p=>p.processObserverCommand=['ps','-ef'],
        p=>p.dependencyLibraryPath='/ms-playwright/webkit-2336/minibrowser-wpe/lib',p=>p.inheritedDependencyLibraryPath='/unrecorded-tail']){
        const packet=runtimePacket();cut(packet);assert.throws(()=>admitPreprovisionedRuntime(packet));
    }
});
test('native dependency probe includes the actual launcher lib and sys/lib plus any inherited tail',()=>{
    assert.equal(webkitDependencyLibraryPath('/cache/webkit','/existing-tail'),
        '/cache/webkit/minibrowser-wpe/lib:/cache/webkit/minibrowser-wpe/sys/lib:/existing-tail');
});
test('workflow uses the reviewed preprovisioned image with the original job budget and explicit preflight',()=>{
    const text=readFileSync(new URL('../.github/workflows/robot-model-webkit-comparison.yml',import.meta.url),'utf8');
    assert.ok(text.includes('image: '+RUNTIME_IMAGE));assert.ok(text.includes('BW_MODEL_WEBKIT_RUNTIME_IMAGE: '+RUNTIME_IMAGE));
    assert.ok(text.includes('timeout-minutes: 35'));assert.ok(text.includes('--preflight-runtime candidate test-results/runtime-preflight.json'));
    assert.ok(!text.includes('playwright install'),'No apt/browser installation in the model journey budget');
});
