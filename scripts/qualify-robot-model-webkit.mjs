// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {readFile,writeFile,mkdir,appendFile,readdir,statfs,stat} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {execFileSync,spawn} from 'node:child_process';
import {resolve,dirname,join,posix} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import os from 'node:os';

export const FROZEN = Object.freeze({
    "repository": "CrispStrobe/brickwright-lite",
    "runId": 40057391894,
    "attempt": 1,
    "runHeadSha": "ccf990c4c763b8cfda6fba8695f20d2117968103",
    "reviewedHeadSha": "ccf990c4c763b8cfda6fba8695f20d2117968103",
    "checkoutSha": "a80ee12fe93701a33f541b036302530eee4446a3",
    "treeSha": "aa87581cbc30f597fd57ba4d32e0287f9ebf5d3b",
    "jobId": 120765423208,
    "artifactId": 12546742529,
    "archiveBytes": 117557239,
    "archiveDigest": "sha256:7efba384ccad5317ddbf7f5e2a38a9614ee6c9198fc3fbe817dfe8e42f68829b",
    "producerLogSha256": "6a48ce900f327e16d8b68520c9f0172caa6e21b1e8b1b0a187efad2508a6db28",
    "producerSha": "1cbaeed325f5a890e43b78a4211acae8f801f2d2",
    "arraysValuesSha": "4db2813d366af8a110fc79599afb55d1cd42d8df",
    "candidateHeadSha": "a80ee12fe93701a33f541b036302530eee4446a3",
    "candidateParents": [
        "0cacffcda93108524f784a8d0fa0d729e267f68c",
        "ccf990c4c763b8cfda6fba8695f20d2117968103"
    ],
    "reviewedDelta": []
});
const sha = b=>createHash('sha256').update(b).digest('hex');
const git = (root,...args)=>execFileSync('git',['-c','gc.auto=0','-c','maintenance.auto=false',...args],{cwd:root,encoding:'utf8'}).trim();
export const RUNTIME_IMAGE = 'mcr.microsoft.com/playwright@sha256:c091b21d9fae78c76e85cd4356431e9b018402f172a214fc7d7a5e9a7e29d8ac';
export const QUALIFICATION_CONDITION = 'combined-main-preprovisioned-ubuntu24-amd64-playwright-1.62.1';
export function webkitDependencyLibraryPath(directory,tail='') {
    const bundled=posix.join(directory,'minibrowser-wpe/lib')+':'+posix.join(directory,'minibrowser-wpe/sys/lib');
    return tail ? bundled+':'+tail : bundled;
}
export function admitPreprovisionedRuntime(packet) {
    assert.equal(packet.image,RUNTIME_IMAGE,'Exact CI-only immutable amd64 runtime');
    assert.equal(packet.platform,'linux');assert.equal(packet.arch,'x64');assert.equal(packet.distro,'ubuntu');assert.equal(packet.ubuntu,'24.04');
    assert.equal(packet.node,'v22.23.4');assert.equal(packet.playwright,'1.62.1');
    assert.deepEqual(packet.webkit,{revision:'2336',browserVersion:'26.5'});
    assert.equal(packet.executable,'/ms-playwright/webkit-2336/pw_run.sh');
    assert.equal(packet.dependencyLibraryPath,webkitDependencyLibraryPath('/ms-playwright/webkit-2336',packet.inheritedDependencyLibraryPath||''),
        'Dependency probe must include the bundled launcher library paths and inherited tail');
    for(const file of ['pw_run.sh','minibrowser-wpe/bin/MiniBrowser','minibrowser-wpe/bin/WPEWebProcess'])
        assert.equal(packet.files[file],true,'Complete cached headless WebKit runtime');
    assert.deepEqual(packet.missingDependencies,[],'Native runtime dependencies must resolve before input acquisition');
    assert.equal(packet.processObserverAvailable,true,'Exact process observer command must work before input acquisition');
    assert.deepEqual(packet.processObserverCommand,['ps','-eo','pid,ppid,pcpu,rss,comm']);
    return packet;
}
async function preflightRuntime() {
    assert.equal(process.argv.length,5,'Use --preflight-runtime candidate-directory new-receipt');
    const root=resolve(process.argv[3]),output=resolve(process.argv[4]);
    const require=createRequire(join(root,'package.json')),playwright=require('playwright');
    const registry=JSON.parse(await readFile(join(dirname(require.resolve('playwright-core/package.json')),'browsers.json'))).browsers.filter(b=>b.name==='webkit');
    assert.equal(registry.length,1);const executable=playwright.webkit.executablePath(),directory=dirname(executable),files={};
    for(const file of ['pw_run.sh','minibrowser-wpe/bin/MiniBrowser','minibrowser-wpe/bin/WPEWebProcess'])
        files[file]=(await stat(join(directory,file))).isFile();
    const inheritedDependencyLibraryPath=process.env.LD_LIBRARY_PATH||'';
    const dependencyLibraryPath=webkitDependencyLibraryPath(directory,inheritedDependencyLibraryPath);
    const dependencies=execFileSync('ldd',[join(directory,'minibrowser-wpe/bin/WPEWebProcess')],{
        encoding:'utf8',timeout:10000,maxBuffer:65536,env:{...process.env,LD_LIBRARY_PATH:dependencyLibraryPath}
    });
    const processObserverCommand=['-eo','pid,ppid,pcpu,rss,comm'];
    const processObserverOutput=execFileSync('ps',processObserverCommand,{encoding:'utf8',timeout:1000,maxBuffer:65536});
    const release=await readFile('/etc/os-release','utf8');
    const packet={image:process.env.BW_MODEL_WEBKIT_RUNTIME_IMAGE,platform:process.platform,arch:process.arch,
        distro:release.match(/^ID=([^\r\n]+)$/m)?.[1].replaceAll('"',''),
        ubuntu:release.match(/^VERSION_ID="([^"]+)"$/m)?.[1],node:process.version,playwright:require('playwright/package.json').version,
        webkit:{revision:registry[0].revision,browserVersion:registry[0].browserVersion},executable,files,
        inheritedDependencyLibraryPath,dependencyLibraryPath,
        missingDependencies:dependencies.split('\n').filter(line=>/=>\s*not found/.test(line)),dependencies,
        processObserverAvailable:processObserverOutput.trim().length>0,processObserverCommand:['ps',...processObserverCommand],processObserverOutput,
        consumerHead:git(resolve(dirname(fileURLToPath(import.meta.url)),'..'),'rev-parse','HEAD'),candidateHead:git(root,'rev-parse','HEAD')};
    admitPreprovisionedRuntime(packet);assert.equal(packet.candidateHead,FROZEN.candidateHeadSha);
    await writeFile(output,JSON.stringify(packet,null,2)+'\n',{flag:'wx'});
}
export function admitFrozenArtifactInputs(expected) {
    assert.equal(expected.repository,'CrispStrobe/brickwright-lite');assert.equal(expected.attempt,1);
    for(const key of ['runId','jobId','artifactId','archiveBytes'])
        assert.ok(Number.isSafeInteger(expected[key])&&expected[key]>0,'Frozen input remains unadmitted: '+key);
    assert.ok(expected.archiveBytes<=256*1024*1024,'Frozen archive resource bound');
    for(const key of ['runHeadSha','reviewedHeadSha','candidateHeadSha','checkoutSha','treeSha','producerSha','arraysValuesSha'])
        assert.match(expected[key]||'',/^[0-9a-f]{40}$/,'Frozen source remains unadmitted: '+key);
    assert.match(expected.archiveDigest||'',/^sha256:[0-9a-f]{64}$/);
    assert.match(expected.producerLogSha256||'',/^[0-9a-f]{64}$/);
    assert.equal(expected.candidateHeadSha,expected.checkoutSha,'Candidate is the literal producer checkout');
    assert.deepEqual(expected.candidateParents?.slice(1),[expected.reviewedHeadSha],'Reviewed PR is the second merge parent');
    assert.equal(expected.candidateParents?.length,2,'Two-parent synthetic merge');
    for(const parent of expected.candidateParents)assert.match(parent,/^[0-9a-f]{40}$/);
    assert.ok(Array.isArray(expected.reviewedDelta),'Explicit frozen prose delta; empty means identical complete trees');
    for(const entry of expected.reviewedDelta)assert.match(entry,/^:(?:100644 100644 [0-9a-f]{40} [0-9a-f]{40} M|000000 100644 0{40} [0-9a-f]{40} A)\tlanes\/[a-z0-9-]+\.md$/,'Only ordinary lane Markdown additions or edits');
    return expected;
}
export function admitCandidateCheckout({head,tree,parents,changes},expected=FROZEN) {
    admitFrozenArtifactInputs(expected);
    assert.equal(head,expected.candidateHeadSha,'Exact literal producer checkout');
    assert.equal(tree,expected.treeSha,'Complete candidate/producer tree equality');
    assert.deepEqual(parents,expected.candidateParents,'Actual producer merge ancestry');
    assert.deepEqual(changes,expected.reviewedDelta,'Exact reviewed prose delta, including modes and blobs');
    return expected;
}
export function admitComparisonSource({head,tree,parents,changes,metadata},expected=FROZEN) {
    admitFrozenArtifactInputs(expected);
    admitCandidateCheckout({head,tree,parents,changes},expected);
    assert.equal(metadata.job.id,expected.jobId,'Exact retained producer');
    assert.equal(metadata.artifact.id,expected.artifactId,'Exact existing artifact');
    assert.equal(metadata.artifact.size_in_bytes,expected.archiveBytes,'Frozen original archive length');
    assert.equal(metadata.artifact.digest,expected.archiveDigest,'Frozen original archive digest');
    return {...expected};
}
export function boundedComparisonFetch(fetchImpl=fetch,{onArchiveBytes=()=>{},archiveBytes=FROZEN.archiveBytes}={}) {
    let calls=0;
    return async (url,options={})=>{
        assert.ok(++calls<=20,'Bounded metadata/archive request count');
        const u=new URL(url),api=u.hostname==='api.github.com';
        assert.equal(u.protocol,'https:');assert.equal(u.username+u.password,'');assert.equal(u.port,'');
        assert.ok(api||/(?:\.blob\.core\.windows\.net|\.actions\.githubusercontent\.com|\.githubusercontent\.com)$/.test(u.hostname),'Admitted GitHub artifact host');
        if(!api)assert.ok(Number.isSafeInteger(archiveBytes)&&archiveBytes>0&&archiveBytes<=256*1024*1024,'Frozen archive bound required before request');
        const response=await fetchImpl(url,{...options,signal:AbortSignal.timeout(90000)});
        if(response.status===302){await response.body?.cancel();return {status:response.status,headers:response.headers};}
        const limit=api?4*1024*1024:archiveBytes;
        const length=response.headers.get('content-length');
        try{if(length!==null){assert.match(length,/^[0-9]+$/);assert.ok(Number(length)<=limit,'Declared response bound before buffering');}}
        catch(error){await response.body?.cancel();throw error;}
        let cached;
        const bytes=async()=>{
            if(cached)return cached;
            assert.ok(response.body,'Response stream required');const reader=response.body.getReader(),chunks=[];let total=0;
            try{for(;;){const {done,value}=await reader.read();if(done)break;total+=value.byteLength;
                assert.ok(total<=limit,'Actual response bound before buffering');chunks.push(Buffer.from(value));}}
            catch(error){await reader.cancel().catch(()=>{});throw error;}
            cached=Buffer.concat(chunks,total);if(!api)onArchiveBytes(cached);return cached;
        };
        return {status:response.status,headers:response.headers,json:async()=>JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(await bytes())),arrayBuffer:bytes};
    };
}
export async function observeSafely(collect,reportError) {
    try{await collect();}
    catch(error){try{await reportError(String(error).slice(0,1024));}catch{process.stderr.write('WEBKIT_OBSERVER_ERROR_RECORD_UNAVAILABLE\n');}}
}
export function comparisonOutcome(journeyExit,observerErrors) {
    return observerErrors.length?{journeyExit,status:'UNQUALIFIED_OBSERVER_ERROR',observerErrors}: {journeyExit,status:journeyExit===0?'PASS':'FAIL',observerErrors:[]};
}

async function installReadonlyObserver() {
    const root=process.env.BW_MODEL_WEBKIT_CANDIDATE,out=process.env.BW_MODEL_WEBKIT_OUTPUT;
    assert.ok(root&&out,'Recorded observer output and candidate required');
    const {webkit}=createRequire(join(root,'package.json'))('playwright'),launch=webkit.launch;
    const record=value=>appendFile(join(out,'readonly-browser-observations.jsonl'),JSON.stringify({wallUTC:new Date().toISOString(),...value})+'\n');
    const reportError=async message=>{
        process.stderr.write('WEBKIT_OBSERVER_ERROR '+message+'\n');
        await appendFile(join(out,'observer-errors.jsonl'),JSON.stringify({wallUTC:new Date().toISOString(),message})+'\n');
    };
    webkit.launch=async function(...args){
        await observeSafely(async()=>assert.deepEqual(args,[{headless:true}],'Existing WebKit launch profile remains exact'),reportError);
        const browser=await launch.apply(this,args);
        await observeSafely(()=>record({event:'actual-launch',version:browser.version(),arguments:args}),reportError);
        let busy=false;
        const timer=setInterval(async()=>{
            if(busy)return;busy=true;
            try{await observeSafely(async()=>{for(const context of browser.contexts())for(const page of context.pages()){
                const data=await page.evaluate(()=>{
                    const p=window.__bwSimLab?._pane,s=p?.session,r=window.__bwMechanics,rr=window.__bwIntakeReopened;
                    const variables={};for(const t of p?.props.vm.runtime.targets||[])for(const v of Object.values(t.variables||{}))if(['stage','cycle','completed','done','failed','fault'].includes(v.name))variables[v.name]=v.value;
                    const canvas=p?.view?.canvas;
                    return {model:p?.state.modelFile,status:p?.state.status,programLoading:p?.state.programLoading,simMs:s?.time,clockInstalled:p?.clock.installed,
                        threads:(p?.props.vm.runtime.threads||[]).map(t=>t.status),variables,renderer:{implementation:'THREE.WebGLRenderer from frozen source',gpuDriver:'Unavailable through the existing read-only view API; no context requested'},
                        viewport:{width:innerWidth,height:innerHeight},canvas:canvas?{width:canvas.width,height:canvas.height}:null,renderStats:p?.view?.renderStats?.(),
                        mechanics:r?{frames:r.track.length,lastTime:r.track.at(-1)?.t,finishedAt:r.finishedAt}:null,
                        reopened:rr?{frames:rr.track.length,lastTime:rr.track.at(-1)?.t,finishedAt:rr.finishedAt}:null};
                }).catch(error=>({readError:String(error).slice(0,512)}));
                const processes=execFileSync('ps',['-eo','pid,ppid,pcpu,rss,comm'],{encoding:'utf8',timeout:1000,maxBuffer:65536}).split('\n').filter(line=>/WebKit|WPEWeb|MiniBrowser/.test(line));
                await record({event:'readonly-state',...data,load:os.loadavg(),browserProcesses:processes});
            }},reportError);}finally{busy=false;}
        },5000);timer.unref();browser.once('disconnected',()=>clearInterval(timer));return browser;
    };
}
async function main() {
    assert.equal(process.argv.length,4,'Use candidate-directory and new output-directory');
    admitFrozenArtifactInputs(FROZEN);
    assert.equal(Number(process.versions.node.split('.')[0]),22,'Supported Node 22');
    const root=resolve(process.argv[2]),out=resolve(process.argv[3]),harness=resolve(dirname(fileURLToPath(import.meta.url)),'..');
    assert.equal(process.env.GITHUB_REPOSITORY,FROZEN.repository,'Owned repository only');
    assert.equal(process.env.GITHUB_EVENT_NAME,'pull_request','One automatic source PR qualification');
    assert.equal(git(harness,'rev-parse','HEAD'),process.env.BW_MODEL_WEBKIT_CONSUMER_HEAD,'Exact consumer head');
    assert.equal(git(root,'diff','--name-only'),'','Tracked candidate inputs unchanged');
    assert.equal(git(root,'diff','--cached','--name-only'),'','Candidate index unchanged');
    const head=git(root,'rev-parse','HEAD'),tree=git(root,'rev-parse','HEAD^{tree}');
    const parents=git(root,'show','-s','--format=%P','HEAD').split(' ');
    const delta=git(root,'diff','--raw','--no-abbrev','--no-renames',FROZEN.reviewedHeadSha,'HEAD');
    const changes=delta ? delta.split('\n') : [];
    admitCandidateCheckout({head,tree,parents,changes});
    const preflight=JSON.parse(await readFile(resolve(process.env.BW_MODEL_WEBKIT_RUNTIME_PREFLIGHT),'utf8'));
    admitPreprovisionedRuntime(preflight);assert.equal(preflight.consumerHead,git(harness,'rev-parse','HEAD'));
    assert.equal(preflight.candidateHead,head);assert.equal(process.env.BW_MODEL_WEBKIT_RUNTIME_IMAGE,RUNTIME_IMAGE);
    assert.ok(!existsSync(out),'Fresh output preserves old evidence');await mkdir(out,{recursive:false});
    const save=(name,value)=>writeFile(join(out,name),JSON.stringify(value,null,2)+'\n',{flag:'wx'});
    const require=createRequire(join(root,'package.json')),playwright=require('playwright');
    const browserRoot=dirname(playwright.webkit.executablePath()),runtimeFiles={};
    // Bind both Linux variants; the untouched launcher chooses the supported one.
    for(const relative of ['pw_run.sh','protocol.json','minibrowser-wpe/bin/MiniBrowser','minibrowser-wpe/bin/WPEWebProcess','minibrowser-gtk/bin/MiniBrowser','minibrowser-gtk/bin/WebKitWebProcess']){
        const file=join(browserRoot,relative);if(existsSync(file))runtimeFiles[relative]=sha(await readFile(file));
    }
    for(const variant of ['minibrowser-wpe','minibrowser-gtk']){
        const directory=join(browserRoot,variant,'lib');if(!existsSync(directory))continue;
        for(const entry of await readdir(directory,{withFileTypes:true}))if(entry.isFile()&&/^lib(?:WPEWebKit|webkit2gtk|JavaScriptCore|javascriptcoregtk).*\.so\./.test(entry.name))runtimeFiles[variant+'/lib/'+entry.name]=sha(await readFile(join(directory,entry.name)));
    }
    const packageLock=JSON.parse(await readFile(join(root,'package-lock.json'),'utf8'));
    assert.equal(require('playwright/package.json').version,packageLock.packages['node_modules/playwright'].version,'Exact locked Playwright package');
    const registryBytes=await readFile(join(dirname(require.resolve('playwright-core/package.json')),'browsers.json'));
    const webkitRegistry=JSON.parse(registryBytes.toString()).browsers.filter(b=>b.name==='webkit');
    assert.equal(webkitRegistry.length,1,'One pinned WebKit registry entry');
    const disk=await statfs(out),cgroups={};
    for(const name of ['cpu.max','memory.max']){
        const file='/sys/fs/cgroup/'+name;if(existsSync(file))cgroups[name]=(await readFile(file,'utf8')).trim();
    }
    await save('environment.json',{consumerHead:git(harness,'rev-parse','HEAD'),consumerTree:git(harness,'rev-parse','HEAD^{tree}'),candidateHead:head,candidateTree:tree,
        imageOS:process.env.ImageOS,imageVersion:process.env.ImageVersion,node:process.version,nodeExecutableSha256:sha(await readFile(process.execPath)),
        playwright:require('playwright/package.json').version,webkitRegistry,browserRegistrySha256:sha(registryBytes),runtimeFiles,
        runtimeImage:RUNTIME_IMAGE,qualificationCondition:QUALIFICATION_CONDITION,
        platform:os.platform(),release:os.release(),cpus:os.cpus().map(c=>({model:c.model,speed:c.speed})),totalMemory:os.totalmem(),freeMemory:os.freemem(),load:os.loadavg(),
        cgroups,diskAvailableBytes:disk.bavail*disk.bsize,qualificationScope:'Supported-environment qualification of the official source-bound candidate build; no source or compiled-byte equality to the retained earlier local build is asserted, with no environment-causation, cold-cache, performance, hardware or physical-accuracy claim',frozen:FROZEN});
    const helper=await import(pathToFileURL(join(root,'scripts/lib/official-gui-artifact.mjs')));
    let originalBytes;
    const fetchImpl=boundedComparisonFetch(fetch,{onArchiveBytes:bytes=>{originalBytes=bytes;}}),metadata=await helper.fetchGuiArtifactMetadata({...FROZEN,token:process.env.GITHUB_TOKEN,fetchImpl});
    await save('original-metadata.json',metadata);
    const expected=admitComparisonSource({head,tree,parents,changes,metadata}),admission=helper.admitGuiArtifactMetadata(metadata,expected);
    await save('admission.json',admission);
    const archivePath=join(out,'official-frontend.zip');
    await save('original-acquisition-reservation.json',{owner:process.env.GITHUB_RUN_ID,admission,archivePath:'official-frontend.zip',
        qualificationCondition:QUALIFICATION_CONDITION,runtimeImage:RUNTIME_IMAGE,
        priorInputCondition:{consumerHead:'dc250d461b7f161c7696504a054d1cc49ccac003',runId:40007060335,inputArtifactId:12523413892,
            candidateHead:'bfb775501f20b96b793e759bee21766d10d93b96',inputConsumed:true,obsoleteForCombinedApplication:true},
        preinputRefusals:[{consumerHead:'368bd55aea021ac2922578200819b85938631dba',runId:40018078929,inputConsumed:false,
            reason:'Dependency probe omitted bundled sys/lib; corrected to the launcher library search contract'}],
        scope:'Fresh combined-source frontend for actual qualification; prior BFB inputs do not qualify this application. Each condition audit remains once-only.'});
    let bytes;
    try{bytes=await helper.acquireGuiArchive({admission,archivePath,token:process.env.GITHUB_TOKEN,fetchImpl});}
    catch(error){
        if(originalBytes&&!existsSync(archivePath))await writeFile(join(out,'rejected-original-frontend.zip'),originalBytes,{flag:'wx'});
        await save('original-acquisition-failure.json',{message:String(error),retainedCompleteResponse:Boolean(originalBytes)});throw error;
    }
    const inspected=await helper.inspectGuiArchive(bytes,admission,expected),site=join(out,'site');
    await helper.extractAdmittedGui(inspected,site);await save('frontend-receipt.json',inspected.receipt);
    await save('original-build-stamp.json',JSON.parse(inspected.members.get('brickwright-build.json').toString('utf8')));
    await save('compiled-build-scope.json',{sourceTreeEqualToReviewedCandidate:true,localCompiledByteEquality:'Not established; compare full retained inventories independently',
        officialProducerBuild:{NODE_ENV:'production',BW_ENABLE_FPGA:'1',NODE_OPTIONS:'--max-old-space-size=2560',synthesisEndpointConfigured:true},
        localOriginalBuild:{head:'d0efff3ea00688f2d2255bcaf6ed21b86d188991',command:'npm run build:gui',CI:'1',BW_ENABLE_FPGA:'unset'},
        retainedProducerLogSha256:FROZEN.producerLogSha256,
        interpretation:'A pass qualifies this immutable official build and environment; it cannot alone prove the cause of the original local failure.'});
    const sourcePaths=['scripts/verify-sim-lab-browser.mjs','scripts/lib/sim-lab-mechanics-gate.mjs','scripts/lib/sim-lab-new-models-gate.mjs','scripts/lib/sim-lab-intake-roundtrip.mjs'];
    await save('actual-source-controls.json',Object.fromEntries(await Promise.all(sourcePaths.map(async p=>[p,sha(await readFile(join(root,p)))]))));
    const env={...process.env,BW_BUILD:site,BW_SIMLAB_BROWSER:'webkit',SIM_DEBUG:'1',BW_MODEL_WEBKIT_OBSERVE:'1',BW_MODEL_WEBKIT_CANDIDATE:root,BW_MODEL_WEBKIT_OUTPUT:out};
    for(const key of ['BW_GUI_SCOPE_LOG','BW_INTEGRATED_ROOT','GITHUB_TOKEN','GH_TOKEN','ACTIONS_RUNTIME_TOKEN','ACTIONS_ID_TOKEN_REQUEST_TOKEN'])delete env[key];
    const command=[process.execPath,'--import',fileURLToPath(import.meta.url),'scripts/verify-sim-lab-browser.mjs','--part=examples','--examples=sine-shuttle,quartermaster'];
    await save('actual-command.json',{node:process.version,preload:'scripts/qualify-robot-model-webkit.mjs',script:'scripts/verify-sim-lab-browser.mjs',args:command.slice(4),unchangedOracles:true,newBuild:false});
    assert.ok(!existsSync(join(root,'artifacts/sim-lab')),'Fresh browser outputs cannot inherit earlier evidence');
    const child=spawn(command[0],command.slice(1),{cwd:root,env,stdio:'inherit'});
    const code=await new Promise((done,reject)=>{child.once('error',reject);child.once('exit',c=>done(c??1));});
    assert.equal(git(root,'rev-parse','HEAD'),head);assert.equal(git(root,'diff','--name-only'),'');
    const errorFile=join(out,'observer-errors.jsonl'),observerErrors=existsSync(errorFile)?(await readFile(errorFile,'utf8')).trim().split('\n').filter(Boolean).map(line=>JSON.parse(line)):[];
    const outcome=comparisonOutcome(code,observerErrors);
    await save('comparison-result.json',{...outcome,candidateHead:head,candidateTree:tree,producerCheckout:FROZEN.checkoutSha,frontendArchiveSha256:sha(bytes),
        originalFailuresPreserved:true,scope:'Unchanged WebKit journey for the official build in this recorded environment; no local compiled-byte-equivalence, environment-causation, full-run, cold-cache or performance admission override'});
    process.exitCode=outcome.status==='PASS'?0:1;
}
if(process.env.BW_MODEL_WEBKIT_OBSERVE==='1')await installReadonlyObserver();
else if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
    if(process.argv[2]==='--preflight-runtime')await preflightRuntime();
    else await main();
}
