import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {observeGuiProducerCompletion,admitGuiArtifactMetadata} from '../scripts/lib/official-gui-artifact.mjs';
import {admitOfficialGui} from '../scripts/admit-official-gui-artifact.mjs';

const sha=c=>c.repeat(40),repository='CrispStrobe/brickwright-lite';
const api=`https://api.github.com/repos/${repository}/actions`,html=`https://github.com/${repository}/actions/runs/12`;
const expected={repository,runId:12,attempt:1,runHeadSha:sha('a'),checkoutSha:sha('b'),reviewedHeadSha:sha('c'),jobId:34,artifactId:56};
const metadata=()=>({
    run:{id:12,run_attempt:1,head_sha:sha('a'),repository:{id:1,full_name:repository},head_repository:{id:1,full_name:repository},
        html_url:html,path:'.github/workflows/build.yml',event:'pull_request',pull_requests:[{head:{sha:sha('c')}}]},
    job:{id:34,run_id:12,run_attempt:1,head_sha:sha('a'),name:'build',status:'completed',conclusion:'success',
        html_url:`${html}/job/34`,run_url:`${api}/runs/12`,started_at:'2026-10-22T00:00:00Z',completed_at:'2026-10-22T00:01:00Z',
        steps:['Build the editor','Write GUI build source manifest','Upload GUI Pages artifact'].map(name=>({name,status:'completed',conclusion:'success'}))},
    artifact:{id:56,name:'github-pages',expired:false,url:`${api}/artifacts/56`,archive_download_url:`${api}/artifacts/56/zip`,
        workflow_run:{id:12,head_sha:sha('a'),repository_id:1,head_repository_id:1},size_in_bytes:24,created_at:'2026-10-22T00:00:30Z'},
    artifacts:[{id:56,name:'github-pages'}]
});
const pending=()=>{const m=metadata();Object.assign(m.job,{status:'in_progress',conclusion:null,completed_at:null});return m;};
const clock=()=>{let time=0;return {now:()=>time,pause:async ms=>{time+=ms;},elapsed:()=>time};};

test('dependent consumer observes the same pending producer then applies unchanged admission',async()=>{
    const c=clock(),records=[pending(),metadata()];let reads=0;
    const result=await observeGuiProducerCompletion({...c,readMetadata:async()=>{reads++;return records.shift();}});
    assert.equal(reads,2);assert.equal(c.elapsed(),1000);
    assert.equal(admitGuiArtifactMetadata(result,expected).jobId,34);
    assert.throws(()=>admitGuiArtifactMetadata(pending(),expected),/Producer completed/);
});

test('a pending observation cannot change producer, run, attempt, head or original artifact',async()=>{
    for(const change of [m=>m.run.id++,m=>m.run.run_attempt++,m=>m.run.head_sha=sha('d'),m=>m.job.id++,
        m=>m.job.run_id++,m=>m.job.run_attempt++,m=>m.job.head_sha=sha('d'),m=>m.artifact.id++]){
        const c=clock(),changed=metadata();change(changed);let reads=0;
        await assert.rejects(observeGuiProducerCompletion({...c,readMetadata:async()=>++reads===1?pending():changed}),/must remain unchanged/);
        assert.equal(reads,2);
    }
});

test('completed failure, unknown status and transport failure are never retried into admission',async()=>{
    const bad=metadata();bad.job.conclusion='failure';let reads=0;
    const observed=await observeGuiProducerCompletion({readMetadata:async()=>{reads++;return bad;}});
    assert.equal(reads,1);assert.throws(()=>admitGuiArtifactMetadata(observed,expected),/Producer successful/);
    const unknown=pending();unknown.job.status='waiting';
    await assert.rejects(observeGuiProducerCompletion({readMetadata:async()=>unknown}),/Known producer status/);
    const c=clock();reads=0;
    await assert.rejects(observeGuiProducerCompletion({...c,readMetadata:async()=>{
        if(++reads===1)return pending();throw Error('metadata transport refused');
    }}),/metadata transport refused/);assert.equal(reads,2);
});

test('observation has a closed sixty-second cap and never reads after its deadline',async()=>{
    const c=clock();let reads=0;
    await assert.rejects(observeGuiProducerCompletion({...c,maxWaitMs:2500,readMetadata:async()=>{reads++;return pending();}}),/observation bound/);
    assert.equal(c.elapsed(),2500);assert.equal(reads,3);
    await assert.rejects(observeGuiProducerCompletion({maxWaitMs:60001,readMetadata:async()=>{throw Error('must not read');}}),/Bounded producer observation/);
});

test('actual admission retains both observations and requests no archive until the producer completes',async()=>{
    const dir=await mkdtemp(path.join(tmpdir(),'bw-producer-observation-'));let jobs=0,archives=0;
    const complete=metadata();
    const fetchImpl=async url=>{
        if(url.endsWith('/runs/12'))return {status:200,json:async()=>complete.run};
        if(url.includes('/attempts/1/jobs'))return {status:200,json:async()=>({total_count:1,jobs:[++jobs===1?pending().job:complete.job]})};
        if(url.includes('/runs/12/artifacts'))return {status:200,json:async()=>({total_count:1,artifacts:[complete.artifact]})};
        archives++;assert.equal(jobs,2);throw Error('original archive request sentinel');
    };
    const output=path.join(dir,'admission');
    try{
        await assert.rejects(admitOfficialGui({expected,directory:output,fetchImpl}),/original archive request sentinel/);
        assert.equal(archives,1);
        for(const [i,status]of [[1,'in_progress'],[2,'completed']]){
            const raw=JSON.parse(await readFile(path.join(output,'producer-observations',`${i}.json`),'utf8'));
            assert.equal(raw.metadata.job.status,status);assert.equal(raw.metadata.job.id,34);
        }
        assert.equal(JSON.parse(await readFile(path.join(output,'metadata.json'),'utf8')).metadata.job.status,'completed');
        assert.equal(JSON.parse(await readFile(path.join(output,'admission.json'),'utf8')).jobId,34);
        await assert.rejects(readFile(path.join(output,'receipt.json')),{code:'ENOENT'});
    }finally{await rm(dir,{recursive:true,force:true});}
});
