import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdir, mkdtemp, readFile, rm, symlink, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {writeGuiBuildManifest} from '../scripts/write-gui-build-manifest.mjs';
import JSZip from 'jszip';
import {GUI_MANIFEST, admitGuiArtifactMetadata, inspectGuiArchive, inspectGuiTar, extractAdmittedGui, acquireGuiArchive, fetchGuiArtifactMetadata} from '../scripts/lib/official-gui-artifact.mjs';
import {admitOfficialGui} from '../scripts/admit-official-gui-artifact.mjs';

const sha = char => char.repeat(40), hash = bytes => createHash('sha256').update(bytes).digest('hex');
const repository = 'CrispStrobe/brickwright-lite', api = `https://api.github.com/repos/${repository}/actions`;
const expected = {repository, runId: 12, attempt: 2, runHeadSha: sha('a'), reviewedHeadSha: sha('a'), checkoutSha: sha('b'),
    treeSha: sha('c'), producerSha: sha('d'), arraysValuesSha: sha('e'), jobId: 34, artifactId: 56};
const metadata = () => ({run: {id:12,run_attempt:2,head_sha:sha('a'),repository:{id:1,full_name:repository},head_repository:{id:1,full_name:repository},
    html_url:`https://github.com/${repository}/actions/runs/12`,path:'.github/workflows/build.yml',event:'pull_request',pull_requests:[{head:{sha:sha('a')}}]},
    job:{id:34,run_id:12,run_attempt:2,head_sha:sha('a'),name:'build',html_url:`https://github.com/${repository}/actions/runs/12/job/34`,status:'completed',conclusion:'success',run_url:`${api}/runs/12`,
        started_at:'2026-10-13T00:00:00Z',completed_at:'2026-10-13T01:00:00Z',steps:['Build the editor','Write GUI build source manifest','Upload GUI Pages artifact'].map(name=>({name,status:'completed',conclusion:'success'}))},
    artifact:{id:56,name:'github-pages',expired:false,url:`${api}/artifacts/56`,archive_download_url:`${api}/artifacts/56/zip`,size_in_bytes:1,
        created_at:'2026-10-13T00:59:00Z',workflow_run:{id:12,head_sha:sha('a'),repository_id:1,head_repository_id:1}},artifacts:[{id:56,name:'github-pages'}]});
const target=Buffer.from(JSON.stringify({versions:{target:'4.2.1',pxt:'13.2.1',commits:'https://github.com/microsoft/pxt-arcade/commits/2d7d59b5226e8a1a1e05e8042dd9f5248ed68fea'}})),worker=Buffer.from('owned worker fixture, not executable SDK');
const manifest=()=>({schema:1,repository,runId:12,attempt:2,job:'build',githubSha:sha('b'),sourceSha:sha('b'),reviewedHeadSha:sha('a'),treeSha:sha('c'),producerSha:sha('d'),arraysValuesSha:sha('e'),
    sdk:{version:'4.2.1',pxtVersion:'13.2.1',targetCommit:'2d7d59b5226e8a1a1e05e8042dd9f5248ed68fea',targetSha256:hash(target),workerSha256:hash(worker)}});
function tar(entries) {
    const output=[];
    for(const {name,body=Buffer.alloc(0),type='0'} of entries){
        const header=Buffer.alloc(512);header.write(name,0,100);header.write('0000644\0',100);header.write('0000000\0',108);header.write('0000000\0',116);
        header.write(body.length.toString(8).padStart(11,'0')+'\0',124);header.write('00000000000\0',136);header.fill(32,148,156);header[156]=type.charCodeAt(0);
        const sum=header.reduce((a,b)=>a+b,0);header.write(sum.toString(8).padStart(6,'0')+'\0 ',148);
        output.push(header,body,Buffer.alloc((512-body.length%512)%512));
    }
    return Buffer.concat([...output,Buffer.alloc(1024)]);
}
const entries=(m=manifest())=>[{name:GUI_MANIFEST,body:Buffer.from(JSON.stringify(m))},{name:'static/makecode/arcade/target.json',body:target},{name:'static/makecode/arcade/pxtworker.js',body:worker},{name:'gui.js',body:Buffer.from('owned JS bytes')}];
async function archive(records=entries()) {const zip=new JSZip();zip.file('artifact.tar',tar(records));return zip.generateAsync({type:'nodebuffer'});}
async function prepared(records=entries()){const bytes=await archive(records),meta=metadata();meta.artifact.size_in_bytes=bytes.length;meta.artifact.digest=`sha256:${hash(bytes)}`;return {bytes,meta,admission:admitGuiArtifactMetadata(meta,expected)};}

test('official producer and embedded manifest bind checkout, pins, SDK and every original body length',async()=>{
    const {bytes,admission}=await prepared([...entries(),{name:'__proto__',body:Buffer.from('owned special filename')}]);const result=await inspectGuiArchive(bytes,admission,expected);
    assert.equal(result.receipt.assets.__proto__,hash(Buffer.from('owned special filename')));assert.equal(Object.getPrototypeOf(result.receipt.assets),null);
    assert.equal(result.receipt.sourceSha,expected.checkoutSha);assert.equal(result.receipt.build.attempt,2);
    assert.equal(result.receipt.assets['static/makecode/arcade/pxtworker.js'],hash(worker));assert.equal(result.receipt.assetBytes['gui.js'],14);
    const dir=await mkdtemp(path.join(tmpdir(),'gui-extract-'));try{
        await assert.rejects(extractAdmittedGui({members:new Map([['../escape',Buffer.from('bad')]])},path.join(dir,'unsafe')),/traversal/);
        const site=path.join(dir,'site');await extractAdmittedGui(result,site);assert.deepEqual(await readFile(path.join(site,'gui.js')),Buffer.from('owned JS bytes'));
        await assert.rejects(extractAdmittedGui(result,site),/EEXIST/);
        const alias=path.join(dir,'alias');await symlink(site,alias);await assert.rejects(extractAdmittedGui(result,alias),/EEXIST/);
    }finally{await rm(dir,{recursive:true,force:true});}
});
test('metadata admission refuses wrong run/head/job/attempt/source/step/artifact and duplicate producers',()=>{
    const changes=[m=>m.run.id++,m=>m.run.run_attempt++,m=>m.run.head_sha=sha('f'),m=>m.run.repository.full_name='other/repo',m=>m.run.head_repository.id=2,
        m=>m.run.path='other.yml',m=>m.run.pull_requests[0].head.sha=sha('f'),m=>m.job.id++,m=>m.job.run_attempt++,m=>m.job.head_sha=sha('f'),
        m=>m.job.name='browser (light)',m=>m.job.status='in_progress',m=>m.job.conclusion='failure',m=>m.job.steps[1].conclusion='skipped',m=>m.job.steps.push(m.job.steps[0]),
        m=>m.artifact.id++,m=>m.artifact.name='other',m=>m.artifact.expired=true,m=>m.artifact.workflow_run.id++,m=>m.artifact.workflow_run.head_sha=sha('f'),
        m=>m.artifact.created_at='2026-10-12T00:00:00Z',m=>m.artifacts.push({id:57,name:'github-pages'}),m=>m.artifact.digest='bad'];
    for(const change of changes){const m=metadata();change(m);assert.throws(()=>admitGuiArtifactMetadata(m,expected));}
});
test('manifest and exact SDK bytes refuse actual checkout, pin, version, source and corruption mismatches',async()=>{
    for(const change of [m=>m.sourceSha=sha('f'),m=>m.githubSha=sha('f'),m=>m.runId++,m=>m.attempt++,m=>m.treeSha=sha('f'),m=>m.producerSha=sha('f'),m=>m.arraysValuesSha=sha('f'),m=>m.sdk.workerSha256='0'.repeat(64),m=>m.sdk.targetSha256='0'.repeat(64),m=>m.sdk.version='4.0.0']){
        const m=manifest();change(m);const {bytes,admission}=await prepared(entries(m));await assert.rejects(inspectGuiArchive(bytes,admission,expected));
    }
    const {bytes,admission}=await prepared();const corrupt=Buffer.from(bytes);corrupt[0]^=1;await assert.rejects(inspectGuiArchive(corrupt,admission,expected));
});
test('TAR traversal, duplicate, symlink, hardlink, special and malformed payloads cannot reach disk',()=>{
    for(const records of [[{name:'../escape'}],[{name:'/escape'}],[{name:'C:/escape'}],[{name:'foo\\bar'}],[{name:'a'},{name:'a'}],
        ...['1','2','3','4','6','x','g'].map(type=>[{name:'link',type}])])assert.throws(()=>inspectGuiTar(tar(records)));
    const corrupt=tar([{name:'a'}]);corrupt[0]^=1;assert.throws(()=>inspectGuiTar(corrupt),/checksum/);
    assert.throws(()=>inspectGuiTar(tar([{name:'a'}]).subarray(0,512)),/termination/);
    const long='long/'+('a'.repeat(110));assert.ok(inspectGuiTar(tar([{name:'././@LongLink',type:'L',body:Buffer.from(long+'\0')},{name:'short'}])).has(long));
});
test('ZIP traversal, duplicate normalized names and symlinks are refused before JSZip normalization',async()=>{
    const {admission}=await prepared();
    for(const [name,options] of [['../artifact.tar',{}],['artifact.tar',{unixPermissions:0o120777}],['extra.tar',{}]]){
        const zip=new JSZip();zip.file(name,tar(entries()),options);const bytes=await zip.generateAsync({type:'nodebuffer',platform:'UNIX'});
        await assert.rejects(inspectGuiArchive(bytes,{...admission,archiveBytes:bytes.length,archiveDigest:null},expected));
    }
    const zip=new JSZip();zip.file('artifact.tar',tar(entries()));zip.file('./artifact.tar',tar(entries()),{createFolders:false});const bytes=await zip.generateAsync({type:'nodebuffer'});
    await assert.rejects(inspectGuiArchive(bytes,{...admission,archiveBytes:bytes.length,archiveDigest:null},expected),/Duplicate ZIP/);
});
test('one admitted acquisition reuses original bytes and never forwards the token to CDN',async()=>{
    const {bytes,admission}=await prepared(),dir=await mkdtemp(path.join(tmpdir(),'gui-acquire-'));const archivePath=path.join(dir,'original.zip');let calls=0;
    const fetchImpl=async(url,options)=>{calls++;if(calls===1){assert.equal(url,admission.archiveUrl);assert.equal(options.headers.authorization,'Bearer private-fixture-token');return {status:302,headers:new Headers({location:'https://fixture.invalid/archive.zip'})};}
        assert.equal(options.headers,undefined);return {status:200,arrayBuffer:async()=>bytes};};
    try{assert.deepEqual(await acquireGuiArchive({admission,archivePath,fetchImpl,token:'private-fixture-token'}),bytes);
        assert.deepEqual(await acquireGuiArchive({admission,archivePath,fetchImpl,token:'private-fixture-token'}),bytes);assert.equal(calls,2);
        await writeFile(archivePath,Buffer.alloc(bytes.length));await assert.rejects(acquireGuiArchive({admission,archivePath,fetchImpl}),/Reused original archive bytes/);assert.equal(calls,2);
    }finally{await rm(dir,{recursive:true,force:true});}
});
test('complete API metadata is admitted before the only archive request; an invalid attempt never acquires',async()=>{
    const {bytes,meta}=await prepared();const dir=await mkdtemp(path.join(tmpdir(),'gui-api-'));let archiveCalls=0;
    const fetchImpl=async(url,options)=>{
        if(url.endsWith('/runs/12'))return {status:200,json:async()=>meta.run};
        if(url.includes('/attempts/2/jobs'))return {status:200,json:async()=>({total_count:1,jobs:[meta.job]})};
        if(url.includes('/runs/12/artifacts'))return {status:200,json:async()=>({total_count:1,artifacts:[meta.artifact]})};
        archiveCalls++;if(url===meta.artifact.archive_download_url)return {status:302,headers:new Headers({location:'https://fixture.invalid/bytes'})};
        return {status:200,arrayBuffer:async()=>bytes};
    };
    try{
        meta.job.run_attempt=1;await assert.rejects(admitOfficialGui({expected,directory:path.join(dir,'bad'),fetchImpl}),/attempt/);assert.equal(archiveCalls,0);
        assert.equal(JSON.parse(await readFile(path.join(dir,'bad','metadata.json'))).metadata.job.run_attempt,1);
        assert.match(JSON.parse(await readFile(path.join(dir,'bad','failure.json'))).message,/attempt/);
        meta.job.run_attempt=2;const result=await admitOfficialGui({expected,directory:path.join(dir,'good'),fetchImpl});assert.equal(archiveCalls,2);
        assert.equal(JSON.parse(await readFile(result.receiptPath)).build.artifactId,56);
        const reuse=await admitOfficialGui({expected,directory:path.join(dir,'reuse'),archivePath:result.archivePath,fetchImpl});
        assert.equal(archiveCalls,2,'new output can reuse sole admitted original without reacquisition');
        assert.equal(JSON.parse(await readFile(reuse.receiptPath)).build.artifactId,56);
        const original=await fetchGuiArtifactMetadata({...expected,fetchImpl});assert.equal(original.job.id,34);
        const duplicate=async(url,options)=>url.includes('/attempts/2/jobs')?{status:200,json:async()=>({total_count:2,jobs:[meta.job,{...meta.job,id:35}]})}:fetchImpl(url,options);
        await assert.rejects(fetchGuiArtifactMetadata({...expected,fetchImpl:duplicate}),/Unique official build producer/);assert.equal(archiveCalls,2);
    }finally{await rm(dir,{recursive:true,force:true});}
});

test('producer manifest observes actual bound Git checkout and built SDK, refusing wrong context and dirty source',async()=>{
    const git=process.env.BW_GUI_GIT_EXECUTABLE || '/usr/bin/git';
    const dir=await mkdtemp(path.join(tmpdir(),'gui-manifest-'));
    try {
        const root=path.join(dir,'root'),site=path.join(dir,'site');await mkdir(root);await mkdir(path.join(site,'static/makecode/arcade'),{recursive:true});
        const execute=args=>execFileSync(git,args,{cwd:root,encoding:'utf8'}).trim();
        execute(['init','-q']);execute(['config','user.name','Owned fixture']);execute(['config','user.email','fixture@example.invalid']);
        await writeFile(path.join(root,'vendor-pins.json'),JSON.stringify({'sb3-creator':sha('d'),'arrays-values':sha('e')}));
        execute(['add','vendor-pins.json']);execute(['commit','-qm','owned fixture']);
        await writeFile(path.join(site,'static/makecode/arcade/target.json'),target);await writeFile(path.join(site,'static/makecode/arcade/pxtworker.js'),worker);
        const context={repository,runId:12,attempt:2,job:'build',githubSha:execute(['rev-parse','HEAD']),reviewedHeadSha:sha('a')};
        await assert.rejects(writeGuiBuildManifest({root,site,gitExecutable:git,context:{...context,githubSha:sha('f')}}),/GITHUB_SHA/);
        const emitted=await writeGuiBuildManifest({root,site,gitExecutable:git,context});
        assert.equal(emitted.sourceSha,context.githubSha);assert.equal(emitted.treeSha,execute(['rev-parse','HEAD^{tree}']));
        assert.equal(emitted.sdk.workerSha256,hash(worker));assert.equal(JSON.parse(await readFile(path.join(site,GUI_MANIFEST))).sourceSha,context.githubSha);
        await writeFile(path.join(root,'vendor-pins.json'),'changed');
        await assert.rejects(writeGuiBuildManifest({root,site,gitExecutable:git,context}),/tracked source/);
    }finally{await rm(dir,{recursive:true,force:true});}
});
