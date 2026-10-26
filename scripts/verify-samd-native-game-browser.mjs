#!/usr/bin/env node
// SPDX-License-Identifier: BSD-3-Clause
import {createHash} from 'node:crypto';
import {readFileSync, writeFileSync, mkdirSync, lstatSync, readdirSync} from 'node:fs';
import {createServer} from 'node:http';
import {resolve, join, dirname, extname, sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {admitSamdProfile} from './verify-samd-native-game.mjs';
import {runSamdNativeGame} from './samd-native-game-browser.mjs';
import {execFileSync} from 'node:child_process';
const need=(ok,why)=>{if(!ok)throw new Error(why);};
const sha=raw=>createHash('sha256').update(raw).digest('hex');
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
// Independent intake: this reader never imports the frontend/native producers.
export function admitOfficialMetadata ({run,jobs,artifacts,repository,workflow,event,head,id,job,artifact}) {
    need(/^[0-9a-f]{40}$/.test(head)&&Number.isSafeInteger(id)&&id>0,'immutable source and positive run required');
    need(run.id===id&&run.repository?.full_name===repository&&run.head_sha===head&&run.path===workflow&&event.includes(run.event)&&run.run_attempt===1&&run.status==='completed'&&run.conclusion==='success','official successful first-attempt workflow/source');
    need(jobs.total_count===jobs.jobs.length&&jobs.total_count<=100&&artifacts.total_count===artifacts.artifacts.length&&artifacts.total_count<=100,'complete bounded rosters');
    const selectedJob=jobs.jobs.filter(j=>j.name===job);
    need(selectedJob.length===1&&selectedJob[0].head_sha===head&&selectedJob[0].run_id===id&&selectedJob[0].status==='completed'&&selectedJob[0].conclusion==='success','one successful same-source producing job');
    const selected=artifacts.artifacts.filter(a=>a.name===artifact&&!a.expired);
    need(selected.length===1,'one original artifact required');
    const a=selected[0];need(a.workflow_run?.id===id&&a.workflow_run?.head_sha===head&&Number.isSafeInteger(a.id)&&a.id>0&&Number.isSafeInteger(a.size_in_bytes)&&a.size_in_bytes>0&&a.size_in_bytes<=536870912&&/^sha256:[0-9a-f]{64}$/.test(a.digest),'bounded publisher-bound artifact');
    return {job:selectedJob[0],artifact:a};
}
export function checkoutFromOfficialLog (text) {
    const lines=text.split(/\r?\n/);const boundary=lines.findIndex(s=>s.includes('##[group]Run actions/setup-node@'));
    need(boundary>=0&&lines.slice(0,boundary).some(s=>s.includes('Syncing repository: CrispStrobe/brickwright-lite')),'primary frontend checkout log');
    const positions=lines.slice(0,boundary).flatMap((s,i)=>s.includes('git log -1 --format=%H')?[i]:[]);
    need(positions.length===1,'one original checkout identity');
    const match=lines[positions[0]+1]?.match(/\b([0-9a-f]{40})\s*$/);need(match,'full actual checkout identity');return match[1];
}
const extractOfficial = String.raw`
import io,json,stat,sys,tarfile,zipfile
from pathlib import Path,PurePosixPath
archive,mode,dest=sys.argv[1:];dest=Path(dest);limit=1073741824
def need(ok,why):
 if not ok: raise ValueError(why)
def canonical(name):
 p=PurePosixPath(name);need(not p.is_absolute() and '..' not in p.parts and chr(92) not in name,'archive path escape');return str(p)
def write(rows):
 names=set();total=0
 for name,data in rows:
  key=canonical(name);need(key not in names and key not in ('','.','MANIFEST'),'duplicate/empty artifact member');names.add(key);total+=len(data);need(len(data)<=limit and total<=limit,'bounded expanded artifact')
 need(len(rows)<=30000,'bounded archive roster');dest.mkdir()
 for name,data in rows:
  p=dest/canonical(name);p.parent.mkdir(parents=True,exist_ok=True);p.open('xb').write(data)
with zipfile.ZipFile(archive) as z:
 entries=z.infolist();need(len(entries)<=30000,'bounded zip roster');total=0;names=set()
 for e in entries:
  key=canonical(e.filename);need(key not in names and stat.S_IFMT(e.external_attr>>16) in (0,stat.S_IFREG,stat.S_IFDIR),'duplicate zip or symbolic link');names.add(key);total+=e.file_size;need(0<=e.file_size<=limit and total<=limit,'bounded zip expansion')
 if mode=='frontend':
  need(len(entries)==1 and entries[0].filename=='artifact.tar','one official frontend tar');raw=z.read(entries[0]);rows=[]
  with tarfile.open(fileobj=io.BytesIO(raw),mode='r:') as t:
   entries=t.getmembers();need(len(entries)<=30000,'bounded tar roster');names=set();total=0
   for e in entries:
    key=canonical(e.name);need(key not in names and (e.isdir() or e.isfile()),'duplicate tar or special member');names.add(key);total+=e.size;need(0<=e.size<=limit and total<=limit,'bounded tar expansion')
   for e in entries:
    if e.isfile():rows.append((canonical(e.name),t.extractfile(e).read()))
  write(rows)
 elif mode=='native':
  need(set(e.filename for e in entries)=={'brickwright-tauri','receipt.json'},'closed native executable union');write([(e.filename,z.read(e)) for e in entries]);(dest/'brickwright-tauri').chmod(0o755)
 elif mode=='fixture':
  prefix='test/fixtures/labwired/samd-native-game/';rows=[(e.filename[len(prefix):],z.read(e)) for e in entries if e.filename.startswith(prefix) and not e.is_dir()];need(rows,'original source-built fixture required');write(rows)
 else:raise ValueError('unknown artifact type')
`;
export function extractSamdArchive (archive,mode,destination) {
    execFileSync('python3',['-c',extractOfficial,archive,mode,destination],{stdio:'pipe'});
}
function gitBytes (commit,name) {need(/^[0-9a-f]{40}$/.test(commit),'full source object');return execFileSync('git',['show',`${commit}:${name}`],{cwd:root,maxBuffer:32*1024*1024});}
function acquireObject (commit) {
    need(/^[0-9a-f]{40}$/.test(commit),'full source object');
    try {execFileSync('git',['cat-file','-e',commit+'^{commit}'],{cwd:root,stdio:'ignore'});}catch {execFileSync('git',['fetch','--no-tags','https://github.com/CrispStrobe/brickwright-lite.git',commit],{cwd:root,stdio:'inherit'});}
}
export function verifyNativeReceipt ({receipt,consumer,checkout,frontendRun,frontendArtifact,inventory,binarySha256,producer}) {
    need(receipt.schema===1&&receipt.consumer===consumer&&receipt.ciCheckout===checkout&&receipt.run===frontendRun&&receipt.artifact.id===frontendArtifact.id&&receipt.artifact.digest===frontendArtifact.digest&&receipt.binarySha256===binarySha256,'complete consumer/frontend/native identity join');
    need(JSON.stringify(Object.entries(receipt.frontend).sort())===JSON.stringify(Object.entries(inventory).sort()),'all embedded frontend source bytes');
    acquireObject(checkout);acquireObject(producer);
    const differences=execFileSync('git',['diff','--name-only',consumer,checkout],{cwd:root,encoding:'utf8'}).trim().split('\n').filter(Boolean);
    need(differences.every(p=>/^(docs|lanes)\/.+\.md$/.test(p))&&JSON.stringify(differences)===JSON.stringify(receipt.proseDifferences),'only declared Markdown composition differences');
    const names=execFileSync('git',['ls-tree','-r','--name-only',consumer,'apps/tauri/src-tauri'],{cwd:root,encoding:'utf8'}).trim().split('\n');
    names.push('overlay/scratch-vm/src/extension-support/native-broker-protocol.js','overlay/scratch-gui/static/native-broker/native-broker-host.js');
    need(JSON.stringify(names.sort())===JSON.stringify(Object.keys(receipt.nativeSources).sort()),'complete actual native source union');
    for(const name of names)need(sha(gitBytes(consumer,name))===receipt.nativeSources[name],'native source identity '+name);
    const manifest=gitBytes(consumer,'apps/tauri/src-tauri/Cargo.toml').toString();const original='crate-type = ["staticlib", "cdylib", "rlib"]';
    need(manifest.split(original).length===2&&sha(Buffer.from(manifest.replace(original,'crate-type = ["rlib"]')))===receipt.desktopManifestSha256,'sole reviewed desktop manifest adaptation');
    need(receipt.producer.commit===producer,'actual native producer source');
    for(const [field,name] of Object.entries({helperSha256:'scripts/native-installed-qualification.py',requestSha256:'scripts/native-installed-qualification-profile.json',workflowSha256:'.github/workflows/native-installed-qualification.yml'}))need(sha(gitBytes(producer,name))===receipt.producer[field],'producer identity '+field);
    const defaults=JSON.parse(gitBytes(producer,'scripts/native-installed-qualification-profile.json'));
    need(JSON.stringify(Object.entries(receipt.compilePins).sort())===JSON.stringify(Object.entries(defaults.compile_pins).sort()),'unchanged declared native compile pins; no private resource inputs');
}
export async function admitSamdOfficialInputs ({consumer,frontendRun,nativeRun,producerRun,producerHead,out}) {
    need(/^[0-9a-f]{40}$/.test(consumer)&&/^[0-9a-f]{40}$/.test(producerHead),'immutable consumer and supplier producer source');
    need(execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim()===consumer,'exact consumer reader checkout');
    mkdirSync(out);
    const api=(repo,path)=>execFileSync('gh',['api',`repos/${repo}/${path}`],{maxBuffer:8*1024*1024});
    const intake=(label,repo,id,workflow,event,head,job,name)=>{
        const raw={run:api(repo,`actions/runs/${id}`),jobs:api(repo,`actions/runs/${id}/jobs?per_page=100`),artifacts:api(repo,`actions/runs/${id}/artifacts?per_page=100`)};
        const data=Object.fromEntries(Object.entries(raw).map(([k,v])=>[k,JSON.parse(v)]));
        const admitted=admitOfficialMetadata({...data,repository:repo,workflow,event,head,id,job,artifact:name});
        for(const [k,v] of Object.entries(raw))writeFileSync(join(out,`${label}-${k}.json`),v,{flag:'wx'});
        return {...admitted,run:data.run};
    };
    const frontend=intake('frontend','CrispStrobe/brickwright-lite',frontendRun,'.github/workflows/build.yml',['push','pull_request'],consumer,'build','github-pages');
    const nativeMetadata=JSON.parse(api('CrispStrobe/brickwright-lite',`actions/runs/${nativeRun}`));
    const native=intake('native','CrispStrobe/brickwright-lite',nativeRun,'.github/workflows/native-installed-qualification.yml',['workflow_dispatch'],nativeMetadata.head_sha,'executable','native-installed-executable');
    const supplier=intake('supplier','CrispStrobe/bw-board',producerRun,'.github/workflows/labwired-wasm.yml',['workflow_dispatch'],producerHead,'samd-game','samd-production-wasm-game');
    const log=api('CrispStrobe/brickwright-lite',`actions/jobs/${frontend.job.id}/logs`);writeFileSync(join(out,'frontend-original-job.log'),log,{flag:'wx'});const checkout=checkoutFromOfficialLog(log.toString());
    // All metadata has been admitted before the first archive acquisition.
    for(const [label,repo,data,mode] of [['frontend','CrispStrobe/brickwright-lite',frontend,'frontend'],['native','CrispStrobe/brickwright-lite',native,'native'],['fixture','CrispStrobe/bw-board',supplier,'fixture']]) {
        const archive=join(out,label+'-original.zip');
        const fd=(await import('node:fs')).openSync(archive,'wx');
        try {execFileSync('gh',['api',`repos/${repo}/actions/artifacts/${data.artifact.id}/zip`],{stdio:['ignore',fd,'pipe'],maxBuffer:1024*1024});}finally{(await import('node:fs')).closeSync(fd);}
        const bytes=readFileSync(archive);need(bytes.length===data.artifact.size_in_bytes&&'sha256:'+sha(bytes)===data.artifact.digest,'original publisher archive integrity');
        extractSamdArchive(archive,mode,join(out,label));
    }
    const inventory=Object.fromEntries(walk(join(out,'frontend'),'',536870912).map(name=>[name,sha(readFileSync(join(out,'frontend',name)))]));
    const stamp=JSON.parse(readFileSync(join(out,'frontend/brickwright-build.json')));
    need(stamp.product==='Brickwright'&&/^[0-9a-f]{7,40}$/.test(stamp.commit)&&checkout.startsWith(stamp.commit),'actual embedded frontend checkout stamp');
    const receipt=JSON.parse(readFileSync(join(out,'native/receipt.json')));
    verifyNativeReceipt({receipt,consumer,checkout,frontendRun,frontendArtifact:frontend.artifact,inventory,binarySha256:sha(readFileSync(join(out,'native/brickwright-tauri'))),producer:native.run.head_sha});
    const packet=await prepareSamdPacket({frontend:join(out,'frontend'),fixture:join(out,'fixture')});
    writeFileSync(join(out,'admission.json'),JSON.stringify({status:'SAMD_OFFICIAL_INPUTS_ADMITTED',consumer,checkout,frontendRun,nativeRun,producerRun,producerHead,engine:packet.engineSource,fixture_manifest_sha256:packet.fixture_manifest_sha256,actual_guest_qualified:false},null,2)+'\n',{flag:'wx'});
}
function walk (folder,prefix='',maxBytes=16_000_000) {
    const names=[];
    for(const name of readdirSync(join(folder,prefix))) {
        const rel=prefix?`${prefix}/${name}`:name;const st=lstatSync(join(folder,rel));
        need(!st.isSymbolicLink(),'source fixture symlinks refused');
        if(st.isDirectory())names.push(...walk(folder,rel,maxBytes));
        else {need(st.isFile()&&st.size<maxBytes,'bounded regular source fixture');names.push(rel);}
    }
    return names;
}
export async function prepareSamdPacket ({frontend,fixture}) {
    const sync=readFileSync(join(root,'scripts/sync-labwired-wasm.mjs'),'utf8');
    const pin=sync.match(/^const PIN = '([0-9a-f]{40})';$/m);need(pin,'declared immutable consumer engine');
    const pinned={};
    for(const name of ['web-labwired_wasm.js','web-labwired_wasm_bg.wasm','samd-no-asf-profile.json']) {
        const rows=[...sync.matchAll(/'([a-z0-9_.-]+)': '([0-9a-f]{64})'/g)].filter(row=>row[1]===name);
        need(rows.length===1,'one exact consumer pin for '+name);pinned[name]=rows[0][2];
    }
    const asset=name=>readFileSync(join(frontend,'static/labwired',name));
    const profileRaw=asset('samd-no-asf-profile.json');
    const {profile,inputs}=await admitSamdProfile({bytes:profileRaw,expectedSha256:pinned['samd-no-asf-profile.json'],engineSource:pin[1]});
    need(sha(asset('labwired_wasm.js'))===pinned['web-labwired_wasm.js'],'consumer glue pin');
    need(sha(asset('labwired_wasm_bg.wasm'))===pinned['web-labwired_wasm_bg.wasm'],'consumer WASM pin');
    const manifest=JSON.parse(readFileSync(join(fixture,'MANIFEST.json')));
    need(manifest.schema===2&&manifest.kind==='source-built-samd-game'&&manifest.physical_capture===false&&manifest.bootloader_code===false&&manifest.actual_guest_qualified===false&&manifest.builder.source===profile.source,'fresh source-built guest and same source recipe/engine');
    need(manifest.sources.samd.repository==='CrispStrobe/codal-samd'&&manifest.sources.samd.source==='5d3f7e4a704006ef2acbe0be3dd0e59f9be1ef0a','qualified public runtime source');
    need(manifest.qualified_reference.workflow_run===40334385377&&manifest.qualified_reference.artifact_sha256==='3fab3e5b45476c75893bfe9b3ff6f508ec9d56dbe3a374000ac6f0e45ce786ea','original qualification reference is separate from fresh guest bytes');
    const names=walk(fixture).filter(n=>n!=='MANIFEST.json');
    need(JSON.stringify(names.sort())===JSON.stringify(Object.keys(manifest.files).sort()),'closed source-built fixture union');
    for(const name of names) {const raw=readFileSync(join(fixture,name));const row=manifest.files[name];need(raw.length===row.bytes&&sha(raw)===row.sha256,'fixture identity '+name);}
    need(manifest.files['wasm.mjs']?.sha256==='df863d7a452da703cbcd3d0bfa48ba540cdd1599e4e4daf848eae2e326598d12'&&manifest.files['game.ts']?.sha256==='54239e1d794c13f6ae674037f3e1f218082fb203c611d5ec103a9a3f9742dfdb','exact qualified guest and observer source');
    for(const [name,key] of [['sw0.bin','LABWIRED_SAMD51_SIM_SW0'],['serial.bin','LABWIRED_SAMD51_SIM_SERIAL']])need(readFileSync(join(fixture,name)).equals(Buffer.from(inputs[key])),'shipped/qualified input identity');
    const firmware=readFileSync(join(fixture,'game.elf'));const symbols=JSON.parse(readFileSync(join(fixture,'symbols.json')));
    need(firmware.subarray(0,7).equals(Buffer.from([127,69,76,70,1,1,1])),'actual ARM ELF input');
    need(Object.keys(symbols).length===2&&['updateScreen','target_panic'].every(n=>Number.isSafeInteger(symbols[n])&&symbols[n]>0&&symbols[n]<0x80000&&symbols[n]%2===0),'actual bounded source symbols');
    return {engineSource:pin[1],profileSha256:pinned['samd-no-asf-profile.json'],glueSha256:pinned['web-labwired_wasm.js'],wasmSha256:pinned['web-labwired_wasm_bg.wasm'],firmware:firmware.toString('base64'),firmwareSha256:sha(firmware),symbols,fixture_manifest_sha256:sha(readFileSync(join(fixture,'MANIFEST.json')))};
}
export function auditSamdPictures (pictures) {
    need(Array.isArray(pictures)&&pictures.length>=11,'complete initial/press/release campaign');
    const rectangle=(bytes,colour,size)=>{
        const points=[];
        for(let i=0;i<bytes.length;i+=3)if(colour.every((v,n)=>bytes[i+n]===v))points.push([(i/3)%128,Math.floor(i/3/128)]);
        need(points.length===size*size,'exact source rectangle pixel count');
        const x=Math.min(...points.map(p=>p[0])),y=Math.min(...points.map(p=>p[1]));
        need(points.every(([a,b])=>a<x+size&&b<y+size),'contiguous actual rectangle');return [159-y-(size-1),x];
    };
    const observed=[];
    for(const [index,picture] of pictures.entries()) {
        const bytes=Buffer.from(picture.rgb_base64,'base64');need(bytes.length===128*160*3&&sha(bytes)===picture.sha256,'actual returned RGB bytes');
        const pressed=index>=6&&index<pictures.length-4;
        const player=rectangle(bytes,pressed?[138,255,255]:[255,32,32],16),ball=rectangle(bytes,[0,48,170],8);
        let targets=0;for(let i=0;i<bytes.length;i+=3)if(bytes[i]===255&&bytes[i+1]===138&&bytes[i+2]===48)targets++;
        need(targets===512,'all eight actual targets');
        need(JSON.stringify(player)===JSON.stringify(picture.player)&&JSON.stringify(ball)===JSON.stringify(picture.ball),'independently decoded actual coordinates');
        observed.push({player,ball});
    }
    need(JSON.stringify(observed[0].ball)!==JSON.stringify(observed[5].ball),'independently observed ball movement');
    need(observed.at(-5).player[0]>=observed[5].player[0]+8,'independently observed press displacement');
    need(JSON.stringify(observed.at(-1).player)===JSON.stringify(observed.at(-2).player),'independently observed released movement stopped');
    return true;
}
export function saveSamdResult (out,result,expectedNative) {
    need(result.status==='SAMD_ACTUAL_REALM_GAME_PASS'&&result.samples?.length===3&&result.native===expectedNative&&result.physical_capture===false,'actual required realm/three samples');
    mkdirSync(out);
    for(const sample of result.samples) {
        need(sample.engine===result.source&&sample.firmware_sha256===result.firmware_sha256&&sample.pictures.length>=11,'same actual guest and complete phases');
        auditSamdPictures(sample.pictures);
        for(const [index,picture] of sample.pictures.entries()) {
            const raw=Buffer.from(picture.rgb_base64,'base64');need(raw.length===128*160*3&&sha(raw)===picture.sha256,'actual returned RGB bytes');
            const name=`sample-${sample.sample}-${index}.rgb`;writeFileSync(join(out,name),raw,{flag:'wx'});delete picture.rgb_base64;picture.file=name;
        }
    }
    writeFileSync(join(out,'result.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx'});
}
export async function verifyBrowser ({frontend,fixture,out}) {
    const packet=await prepareSamdPacket({frontend,fixture});
    const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.wasm':'application/wasm','.svg':'image/svg+xml','.png':'image/png'};
    const server=createServer((req,res)=>{
        try {let path=decodeURIComponent(new URL(req.url,'http://observer.invalid').pathname);if(path.endsWith('/'))path+='index.html';const file=resolve(frontend,'.'+path);need(file.startsWith(resolve(frontend)+sep),'served path escape');const data=readFileSync(file);res.writeHead(200,{'content-type':types[extname(file)]||'application/octet-stream'});res.end(data);}catch{res.writeHead(404);res.end('not found');}
    });
    await new Promise(done=>server.listen(0,'127.0.0.1',done));
    const {chromium}=await import('playwright');let browser;
    try {
        browser=await chromium.launch({headless:true});
        const page=await browser.newPage({viewport:{width:1400,height:900}});
        await page.addInitScript(()=>{localStorage.clear();sessionStorage.clear();localStorage.setItem('bw-starter-v1-complete','1');});
        await page.goto(`http://127.0.0.1:${server.address().port}/`,{waitUntil:'domcontentloaded',timeout:60000});
        await page.waitForFunction(()=>!!window.__brickwrightStore?.getState()?.scratchGui?.vm?.runtime,{},{timeout:120000});
        const result=await page.evaluate(runSamdNativeGame,packet);saveSamdResult(out,result,false);
        await page.screenshot({path:join(out,'actual-browser.png')});
        console.log(`SAMD_ACTUAL_BROWSER_GAME_PASS source=${result.source} samples=3 physical_capture=false`);
    } finally {await browser?.close();await new Promise(done=>server.close(done));}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
    if(process.argv[2]==='--admit-inputs') {
        need(process.argv.length===9,'consumer frontend-run native-run producer-run producer-head fresh-output required');
        const [consumer,front,native,producer,producerHead,out]=process.argv.slice(3);
        const ids=[front,native,producer].map(s=>{need(/^[1-9][0-9]{0,15}$/.test(s),'positive run identity');const n=Number(s);need(Number.isSafeInteger(n),'safe run identity');return n;});
        await admitSamdOfficialInputs({consumer,frontendRun:ids[0],nativeRun:ids[1],producerRun:ids[2],producerHead,out:resolve(out)});
    } else {
        need(process.argv.length===5,'frontend fixture fresh-output required');
        await verifyBrowser({frontend:resolve(process.argv[2]),fixture:resolve(process.argv[3]),out:resolve(process.argv[4])});
    }
}
