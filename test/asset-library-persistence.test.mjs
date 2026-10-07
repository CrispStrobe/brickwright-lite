import test from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import {createHash} from 'node:crypto';
import Creator from '../overlay/scratch-gui/src/lib/sb3-creator.js';
import {ASSET_LIBRARY_ROLE, getAssetLibraryRole, setAssetLibraryRole, assetLibraryRecords,
    withoutAssetLibraries, validateAssetLibraries} from '../overlay/scratch-gui/src/lib/bw-asset-library.js';
import {ARTWORK_PATH, ARTWORK_FORMAT, inspectArtwork, applyArtwork, writeArtworkToZip,
    getCostumeDocument} from '../overlay/scratch-gui/src/lib/bw-artwork-bundle.js';
import {captureCodeArtwork, retainCodeArtwork, captureCodeArtworkRevision, codeArtworkRevisionMatches} from '../overlay/scratch-gui/src/lib/bw-code-artwork.js';
import {importGuiDependency} from './helpers/bw-integrated.mjs';
const copy = value => JSON.parse(JSON.stringify(value));
const role = {...ASSET_LIBRARY_ROLE};
const document = () => {
    const layers = [{id:'base',name:'Pixels',type:'pixel',visible:true,locked:false,opacity:1,
        content:{kind:'pixels',value:{width:1,height:1,pixels:[2]}}}];
    return {version:5,layers,activeLayerId:'base',animation:{resource:{id:'12345678-1234-4234-8234-123456789abc',name:'Walk'},
        activeFrameId:'one',frames:[{id:'one',durationMs:100,activeLayerId:'base',layers:copy(layers)}]}};
};
const fixture = async () => {
    const c = new Creator();c.parse('DEVICE ARCADE\nSPRITE Actor:\nWHEN flag clicked:\n  hide\n');
    c.applyCustomSVG('Actor','<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"><rect width="1" height="1" fill="#ff2121"/></svg>');
    const actor=c.project.targets.find(t=>t.name==='Actor');assert.ok(actor);
    const library={...copy(actor),name:'Art',blocks:{},variables:{},lists:{},broadcasts:{},sounds:[],visible:false};
    c.project.targets.push(library);
    const zip=await JSZip.loadAsync(await (await c.generateSB3()).arrayBuffer());
    const project=JSON.parse(await zip.file('project.json').async('text'));
    // Rich source binds to actual asset content identity. Creator's temporary
    // generated names are not the identity storage computes when loading bytes.
    for (const target of project.targets) for (const costume of target.costumes) {
        const bytes=await zip.file(costume.md5ext).async('uint8array');
        const hash=createHash('md5').update(bytes).digest('hex');
        costume.assetId=hash;costume.md5ext=`${hash}.${costume.dataFormat}`;
        zip.file(costume.md5ext,bytes);
    }
    zip.file('project.json',JSON.stringify(project));
    const targetIndex=project.targets.findIndex(t=>t.name==='Art');
    const costume=project.targets[targetIndex].costumes[0];
    zip.file(ARTWORK_PATH,JSON.stringify({format:ARTWORK_FORMAT,version:7,
        libraries:[{targetIndex,role}],costumes:[{targetIndex,costumeIndex:0,renderedMd5ext:costume.md5ext,document:document()}]}));
    return {zip,project,targetIndex,bytes:await zip.generateAsync({type:'uint8array'})};
};
const open = async bytes => {
    const VM=(await importGuiDependency('scratch-vm/src/index.js')).default;
    const Storage=(await importGuiDependency('scratch-storage/dist/node/scratch-storage.js')).default;
    const vm=new VM();vm.attachStorage(new Storage());
    const inspection=await inspectArtwork(bytes);assert.equal(inspection.outcome,'loaded',inspection.reason);
    await vm.loadProject(bytes);
    const applied=applyArtwork(inspection,vm);
    assert.equal(applied.count,inspection.records.length,JSON.stringify({applied,source:inspection.records.map(r=>r.renderedMd5ext),
        actual:vm.runtime.targets.map(t=>(t.sprite?.costumes||[]).map(c=>({md5:c.md5ext,asset:c.asset?.assetId}))) }));
    return vm;
};
test('explicit library roles survive real VM serialization and SB3 reopen without name inference',async()=>{
    const f=await fixture(),vm=await open(f.bytes);
    try {
        const target=vm.runtime.targets.find(t=>t.getName()==='Art');
        assert.deepEqual(getAssetLibraryRole(target),role);assert.equal(target.visible,false);
        assert.equal(vm.runtime.bwArcadeAnimationResources.size,1);
        const ordinary=vm.runtime.targets.find(t=>t.getName()==='Actor');
        assert.equal(getAssetLibraryRole(ordinary),null);
        vm.renameSprite(target.id,'Renamed artwork');
        const project=JSON.parse(vm.toJSON());
        assert.equal(project.targets.find(t=>t.name==='Renamed artwork').bwAssetLibrary,undefined,
            'ordinary VM serializer does not accidentally own this role');
        const saved=await JSZip.loadAsync(await (await vm.saveProjectSb3()).arrayBuffer());
        assert.equal(await writeArtworkToZip(saved,vm),true);
        const payload=JSON.parse(await saved.file(ARTWORK_PATH).async('text'));
        assert.equal(payload.version,7);assert.equal(payload.libraries.length,1);
        const next=await open(await saved.generateAsync({type:'uint8array'}));
        try {
            const restored=next.runtime.targets.find(t=>t.getName()==='Renamed artwork');
            assert.deepEqual(getAssetLibraryRole(restored),role);
            assert.deepEqual(getCostumeDocument(restored.sprite.costumes[0]),document());
            assert.equal(next.runtime.bwArcadeAnimationResources.size,1);
        } finally {next.quit();}
    } finally {vm.quit();}
});
test('Code handoff carries hidden libraries separately from program declarations and gameplay export',async()=>{
    const f=await fixture(),vm=await open(f.bytes);
    try {
        const saved=JSON.parse(vm.toJSON());
        const program=withoutAssetLibraries(saved,assetLibraryRecords(vm,saved));
        assert.deepEqual(program.targets.map(t=>t.name),['Stage','Actor']);
        assert.equal(saved.targets.length,3,'projection never mutates the live snapshot');
        const context=captureCodeArtwork(vm,program);
        const generated=copy(program);
        generated.targets.push({...copy(program.targets[1]),name:'Art',blocks:{}});
        const zip=new JSZip();retainCodeArtwork(zip,generated,vm,context);
        const payload=JSON.parse(await zip.file(ARTWORK_PATH).async('text'));
        assert.equal(payload.version,7);assert.equal(payload.libraries.length,1);
        const library=generated.targets[payload.libraries[0].targetIndex];
        assert.equal(library.name,'Art_','ordinary program name collision cannot steal the role');
        assert.equal(library.visible,false);assert.deepEqual(library.blocks,{});
        assert.deepEqual(payload.costumes.find(r=>r.targetIndex===3).document,document());
        const inspection=await inspectArtwork(await zip.generateAsync({type:'uint8array'}));
        assert.equal(inspection.outcome,'loaded',inspection.reason);
        const next=await open(await zip.generateAsync({type:'uint8array'}));
        try {
            assert.deepEqual(getAssetLibraryRole(next.runtime.targets.find(t=>t.getName()==='Art_')),role);
            assert.equal(getAssetLibraryRole(next.runtime.targets.find(t=>t.getName()==='Art')),null);
        } finally {next.quit();}
    } finally {vm.quit();}
});
test('malformed roles, Stage binding and executable libraries are refused before loading',async()=>{
    const f=await fixture();
    for(const mutate of [p=>{p.libraries=null;},p=>{p.version=6;},p=>{p.libraries.push(copy(p.libraries[0]));},
        p=>{p.libraries[0].targetIndex=0;},p=>{p.libraries[0].role.version=2;}]){
        const payload=JSON.parse(await f.zip.file(ARTWORK_PATH).async('text'));mutate(payload);
        const zip=await JSZip.loadAsync(f.bytes);zip.file(ARTWORK_PATH,JSON.stringify(payload));
        assert.equal((await inspectArtwork(await zip.generateAsync({type:'uint8array'}))).outcome,'invalid');
    }
    const project=copy(f.project);project.targets[f.targetIndex].visible=true;
    assert.throws(()=>validateAssetLibraries(project,[{targetIndex:f.targetIndex,role}]),/hidden sprite/);
    project.targets[f.targetIndex].visible=false;project.targets[f.targetIndex].blocks={code:{opcode:'looks_show'}};
    assert.throws(()=>validateAssetLibraries(project,[{targetIndex:f.targetIndex,role}]),/artwork only/);
    assert.throws(()=>setAssetLibraryRole(project.targets[0],role),/hidden sprite/);
});

test('prior bundle6 readers preserve the role-bearing bundle as opaque future source',async()=>{
    const old=await import('./fixtures/artwork-reader-v6.mjs');
    const f=await fixture();const inspected=await old.inspectArtwork(f.bytes);
    assert.equal(inspected.outcome,'future');
    const vm=await open(f.bytes);
    try {
        old.applyArtwork(inspected,vm);
        const zip=await JSZip.loadAsync(await (await vm.saveProjectSb3()).arrayBuffer());
        assert.equal(await old.writeArtworkToZip(zip,vm),true);
        assert.equal(await zip.file(ARTWORK_PATH).async('text'),inspected.raw);
        assert.equal((await inspectArtwork(await zip.generateAsync({type:'uint8array'}))).libraries.length,1);
    } finally {vm.quit();}
});


test('library rename or visibility changes during compression invalidate the Code transaction',async()=>{
    const f=await fixture(),vm=await open(f.bytes);
    try {
        const saved=JSON.parse(vm.toJSON());
        const context=captureCodeArtwork(vm,withoutAssetLibraries(saved,assetLibraryRecords(vm,saved)));
        const revision=captureCodeArtworkRevision(vm,context);
        assert.equal(codeArtworkRevisionMatches(vm,revision),true);
        const library=vm.runtime.targets.find(t=>t.getName()==='Art');
        library.visible=true;assert.equal(codeArtworkRevisionMatches(vm,revision),false);
        library.visible=false;assert.equal(codeArtworkRevisionMatches(vm,revision),true);
        vm.renameSprite(library.id,'Changed');assert.equal(codeArtworkRevisionMatches(vm,revision),false);
    } finally {vm.quit();}
});
