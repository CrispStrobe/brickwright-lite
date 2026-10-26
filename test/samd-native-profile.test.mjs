// SPDX-License-Identifier: BSD-3-Clause
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtempSync,rmSync,readFileSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {admitSamdProfile} from '../scripts/verify-samd-native-game.mjs';
import {admitOfficialMetadata,checkoutFromOfficialLog,auditSamdPictures,extractSamdArchive} from '../scripts/verify-samd-native-game-browser.mjs';
const source = '0123456789abcdef0123456789abcdef01234567';
const sha = raw => createHash('sha256').update(raw).digest('hex');
function official () {
    return {repository:'CrispStrobe/brickwright-lite',workflow:'.github/workflows/build.yml',event:['push','pull_request'],head:source,id:123,job:'build',artifact:'github-pages',
        run:{id:123,repository:{full_name:'CrispStrobe/brickwright-lite'},head_sha:source,path:'.github/workflows/build.yml',event:'pull_request',run_attempt:1,status:'completed',conclusion:'success'},
        jobs:{total_count:1,jobs:[{id:456,name:'build',head_sha:source,run_id:123,status:'completed',conclusion:'success'}]},
        artifacts:{total_count:1,artifacts:[{id:789,name:'github-pages',expired:false,size_in_bytes:1024,digest:'sha256:'+'a'.repeat(64),workflow_run:{id:123,head_sha:source}}]}};
}
test('official input admission requires the producing job and publisher-bound artifact',()=>{
    const input=official();assert.equal(admitOfficialMetadata(input).artifact.id,789);
    for(const change of [i=>i.run.head_sha='f'.repeat(40),i=>i.run.run_attempt=2,i=>i.jobs.jobs[0].conclusion='skipped',i=>i.artifacts.artifacts[0].workflow_run.head_sha='f'.repeat(40),i=>i.artifacts.artifacts[0].digest='',i=>i.artifacts.artifacts[0].expired=true,i=>i.jobs.total_count=101]) {
        const changed=structuredClone(input);change(changed);assert.throws(()=>admitOfficialMetadata(changed));
    }
});
test('duplicate producer jobs and artifacts cannot replace a single original',()=>{
    for(const key of ['jobs','artifacts']) {
        const input=official();input[key][key].push(structuredClone(input[key][key][0]));input[key].total_count++;
        assert.throws(()=>admitOfficialMetadata(input),/one /);
    }
});
test('actual primary checkout is read before build setup with ambiguous logs refused',()=>{
    const text=`Syncing repository: CrispStrobe/brickwright-lite\ngit log -1 --format=%H\n${source}\n##[group]Run actions/setup-node@pinned\n`;
    assert.equal(checkoutFromOfficialLog(text),source);
    assert.throws(()=>checkoutFromOfficialLog(text.replace(source,'1234567')),/full actual/);
    assert.throws(()=>checkoutFromOfficialLog(text.replace('##[group]',`git log -1 --format=%H\n${source}\n##[group]`)),/one original/);
    assert.throws(()=>checkoutFromOfficialLog(text.replace('CrispStrobe/brickwright-lite','unrelated/repository')),/primary/);
});
test('standalone archive reader refuses escape, alias and link packets before writing',()=>{
    const dir=mkdtempSync(join(tmpdir(),'samd-archive-controls-'));
    try {
        for(const mode of ['valid','parent','absolute','backslash','alias','link']) {
            const archive=join(dir,mode+'.zip'),out=join(dir,mode);
            execFileSync('/usr/bin/python3',['-c',String.raw`
import stat,sys,zipfile
archive,mode=sys.argv[1:];prefix='test/fixtures/labwired/samd-native-game/'
with zipfile.ZipFile(archive,'w') as z:
 z.writestr(prefix+'game.ts',b'authored fixture')
 if mode=='parent':z.writestr('../escape',b'bad')
 if mode=='absolute':z.writestr('/escape',b'bad')
 if mode=='backslash':z.writestr(prefix+chr(92)+'escape',b'bad')
 if mode=='alias':z.writestr(prefix+'./game.ts',b'alias')
 if mode=='link':
  e=zipfile.ZipInfo(prefix+'link');e.create_system=3;e.external_attr=(stat.S_IFLNK|0o777)<<16;z.writestr(e,b'../escape')
`,archive,mode]);
            if(mode==='valid') {extractSamdArchive(archive,'fixture',out);assert.equal(readFileSync(join(out,'game.ts'),'utf8'),'authored fixture');}
            else {assert.throws(()=>extractSamdArchive(archive,'fixture',out),undefined,mode);assert.equal(existsSync(out),false,'reject the whole roster before writes');}
        }
    } finally {rmSync(dir,{recursive:true,force:true});}
});
function authoredPictures (mutation='') {
    return Array.from({length:11},(_,index)=>{
        const raw=Buffer.alloc(128*160*3);
        const rect=(x,y,w,h,colour)=>{for(let dy=0;dy<h;dy++)for(let dx=0;dx<w;dx++)raw.set(colour,((y+dy)*128+x+dx)*3);};
        rect(0,0,120,160,[117,223,85]);
        for(let i=0;i<(mutation==='missing-target'?7:8);i++)rect(16,136-16*i,8,8,[255,138,48]);
        const px=index<6||mutation==='no-displacement'?32:40+(mutation==='release-drift'&&index===10?1:0);
        const bx=mutation==='frozen-ball'?76:76+index;
        rect(92,159-px-15,16,16,index===6?[138,255,255]:[255,32,32]);
        rect(56,159-bx-7,8,8,[0,48,170]);
        return {rgb_base64:raw.toString('base64'),sha256:sha(raw),player:[px,92],ball:[bx,56]};
    });
}
test('independent RGB reader rejects plausible annotations over wrong pixels or input phases',()=>{
    assert.equal(auditSamdPictures(authoredPictures()),true);
    for(const mutation of ['missing-target','no-displacement','frozen-ball','release-drift'])assert.throws(()=>auditSamdPictures(authoredPictures(mutation)),undefined,mutation);
    const annotations=authoredPictures();annotations[0].player=[99,92];assert.throws(()=>auditSamdPictures(annotations),/independently decoded/);
    const bytes=authoredPictures();bytes[0].rgb_base64=Buffer.alloc(128*160*3).toString('base64');assert.throws(()=>auditSamdPictures(bytes),/actual returned/);
});
function fixture () {
    const data = Buffer.alloc(1024); const body = {};
    const source_bindings = {};
    for (const [field, name] of Object.entries({chip_yaml:'configs/chips/samd51-no-asf-simulation.yaml',system_yaml:'configs/systems/samd51-no-asf-simulation.yaml',display_yaml:'configs/devices/st7735r-memory-simulation.yaml'})) {
        body[field] = `# authored ${field}\n`;
        source_bindings[name] = {bytes:Buffer.byteLength(body[field]),sha256:sha(body[field])};
    }
    const packet = () => ({encoding:'hex',data:data.toString('hex'),bytes:1024,sha256:sha(data)});
    return {schema:1,source,profile:'samd51-no-asf-simulation',kind:'authored-software-profile',physical_capture:false,source_bindings,...body,inputs:{LABWIRED_SAMD51_SIM_SW0:packet(),LABWIRED_SAMD51_SIM_SERIAL:packet()}};
}
const request = (value, extra = {}) => {
    const bytes = Buffer.from(JSON.stringify(value));
    return {bytes,expectedSha256:sha(bytes),engineSource:source,...extra};
};
test('consumer admits all exact source and authored input bytes without a guest claim', async () => {
    const input = fixture(); const result = await admitSamdProfile(request(input));
    assert.equal(result.profile.source,source);
    assert.equal(result.inputs.LABWIRED_SAMD51_SIM_SW0.length,1024);
    assert.equal(result.inputs.LABWIRED_SAMD51_SIM_SERIAL.length,1024);
    assert.deepEqual(result.profile.source_bindings,input.source_bindings);
});
test('consumer refuses a changed release, different engine or physical relabel', async () => {
    await assert.rejects(admitSamdProfile(request(fixture(),{expectedSha256:'0'.repeat(64)})),/SHA-256 mismatch/);
    await assert.rejects(admitSamdProfile(request(fixture(),{engineSource:'f'.repeat(40)})),/different engine/);
    await assert.rejects(admitSamdProfile(request({...fixture(),physical_capture:true})),/software simulation/);
});
test('consumer independently refuses source edits and missing or foreign configuration', async () => {
    await assert.rejects(admitSamdProfile(request({...fixture(),chip_yaml:'edited'})),/byte binding mismatch/);
    const absent = fixture(); delete absent.source_bindings['configs/devices/st7735r-memory-simulation.yaml'];
    await assert.rejects(admitSamdProfile(request(absent)),/closed source/);
    const foreign = fixture(); foreign.source_bindings['private'] = {bytes:1,sha256:sha('x')};
    await assert.rejects(admitSamdProfile(request(foreign)),/closed source/);
});
test('consumer refuses a silently zeroed calibration byte and partial input union', async () => {
    const changed = fixture(); changed.inputs.LABWIRED_SAMD51_SIM_SW0.data = 'ff'+changed.inputs.LABWIRED_SAMD51_SIM_SW0.data.slice(2);
    await assert.rejects(admitSamdProfile(request(changed)),/input SHA-256/);
    const missing = fixture(); delete missing.inputs.LABWIRED_SAMD51_SIM_SERIAL;
    await assert.rejects(admitSamdProfile(request(missing)),/closed authored input/);
});
