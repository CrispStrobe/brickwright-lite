import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import JSZip from 'jszip';
import Creator from '../overlay/scratch-gui/src/lib/sb3-creator.js';
import {prepareAnimationImport, installAnimationImport} from '../overlay/scratch-gui/src/lib/bw-animation-import.js';
import {importProjectFiles, importArtefact, makeCodeSourceHex} from '../overlay/scratch-gui/src/lib/bw-makecode/index.js';
import {encodeAnimationJres} from '../overlay/scratch-gui/src/lib/bw-makecode/animation-jres.js';
import {inspectArtwork, applyArtwork, getCostumeDocument, writeArtworkToZip} from '../overlay/scratch-gui/src/lib/bw-artwork-bundle.js';
import {getAssetLibraryRole, withoutAssetLibraries} from '../overlay/scratch-gui/src/lib/bw-asset-library.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {importGuiDependency} from './helpers/bw-integrated.mjs';
import {VM, ownerOf, projectOpcodes, stepFrames} from './helpers/bw-vm.mjs';
import {loadExtensionClass} from './helpers/bw-extensions.mjs';
import {compile} from '../scripts/lib/pxt-node.mjs';
import {runArcadeSim} from '../scripts/lib/makecode-arcade-sim.mjs';
const hash = bytes => createHash('md5').update(bytes).digest('hex');
const native = (id, pixels, intervalMs = 100) => encodeAnimationJres({id, name:id, width:2, height:1,
    intervalMs, frames:pixels.map(p => ({pixels:p}))});
const files = () => ({'main.ts': `let first=assets.animation\`Walk\`
let alias=first
let second=assets.animation\`Walk\`
first[0].setPixel(0,0,9)
let changed=alias[0].getPixel(0,0)
let independent=second[0].getPixel(0,0)
let count=second.length
console.log(changed)
console.log(independent)
console.log(count)`,
    'pxt.json':JSON.stringify({name:'Library test',dependencies:{device:'*'},files:['main.ts','images.g.jres']}),
    'images.g.jres':JSON.stringify({Walk:native('Walk',[[2,3],[4,5]]),Unused:native('Unused',[[6,7]],65535)})});
const build = async imported => {
    const creator=new Creator();creator.parse(imported.code);assert.deepEqual(creator.warnings,[]);
    const zip=await JSZip.loadAsync(await (await creator.generateSB3()).arrayBuffer());
    await installAnimationImport(zip,imported.animationResources,hash);
    return {zip,bytes:await zip.generateAsync({type:'uint8array'}),creator};
};
const open = async (bytes, project) => {
    const vm=new VM(),Storage=(await importGuiDependency('scratch-storage/dist/node/scratch-storage.js')).default;
    vm.attachStorage(new Storage());
    for (const id of new Set([...projectOpcodes(project)].map(ownerOf).filter(Boolean))) {
        const extension=new (loadExtensionClass(id))(vm.runtime);
        const service=vm.extensionManager._registerInternalExtension(extension);
        vm.extensionManager._loadedExtensions.set(id,service);
    }
    const inspection=await inspectArtwork(bytes);assert.equal(inspection.outcome,'loaded',inspection.reason);
    await vm.loadProject(bytes);assert.equal(applyArtwork(inspection,vm).count,inspection.records.length);
    return {vm,inspection};
};
test('native imports install used and unused animations with fresh runtime semantics and real storage hashes',async()=>{
    const original=files(),snapshot=structuredClone(original);
    const imported=importProjectFiles(original,{target:'arcade',animationResources:true});
    assert.deepEqual(imported.unsupported,[]);assert.deepEqual(original,snapshot);
    assert.equal(imported.animationResources.length,2);
    assert.match(imported.code,/arcade animation fresh frames resource "[a-f0-9-]+"/);
    const f=await build(imported),project=JSON.parse(await f.zip.file('project.json').async('text'));
    const {vm,inspection}=await open(f.bytes,project);
    try {
        const library=vm.runtime.targets.find(getAssetLibraryRole);
        assert.equal(library.visible,false);assert.equal(library.sprite.costumes.length,2);
        for (const resource of vm.runtime.bwArcadeAnimationResources.values()) {
            assert.equal(resource.source.targetId, library.id);
            assert.equal(resource.source.targetName, library.getName());
            assert.ok(library.sprite.costumes.some(costume => costume.name === resource.source.costumeName));
        }
        assert.deepEqual(library.blocks._blocks,{});
        for (const costume of library.sprite.costumes) {
            assert.equal(project.targets.at(-1).costumes[library.sprite.costumes.indexOf(costume)].md5ext,`${costume.asset.assetId}.svg`);
            assert.ok(getCostumeDocument(costume).animation.resource.id);
        }
        vm.runtime.stc=f.creator.project.stc;vm.start();vm.greenFlag();vm.quit();await stepFrames(vm,30);
        const values=Object.fromEntries(vm.runtime.targets.flatMap(t=>Object.values(t.variables))
            .map(v=>[v.name.replace(/^Game_/,''),v.value]));
        assert.equal(values.changed,9,JSON.stringify({values,code:imported.code,resources:[...vm.runtime.bwArcadeAnimationResources.keys()]}));assert.equal(values.independent,2);assert.equal(values.count,2);
        const savedZip=await JSZip.loadAsync(await (await vm.saveProjectSb3()).arrayBuffer());
        assert.equal(await writeArtworkToZip(savedZip,vm),true);
        const restored=await inspectArtwork(await savedZip.generateAsync({type:'uint8array'}));
        assert.equal(restored.outcome,'loaded',restored.reason);
        assert.deepEqual(restored.records.filter(r=>r.document.animation?.resource).map(r=>r.document),inspection.records.map(r=>r.document));
        const out=projectToArcade(withoutAssetLibraries(project,inspection.libraries),
            {animationDocuments:inspection.records.map(r=>r.document)});
        assert.deepEqual(out.unsupported,[]);
        const again=importProjectFiles(out.files,{target:'arcade',animationResources:true});
        assert.deepEqual(again.unsupported,[]);
        assert.deepEqual(again.animationResources.map(r=>r.document),imported.animationResources.map(r=>r.document));
    } finally {vm.quit();}
});
test('embedded native import chooses resource identities once; legacy lowering remains available',async()=>{
    const source=files();
    assert.doesNotMatch(importProjectFiles(source,{target:'arcade'}).code,/fresh frames resource/);
    const imported=await importArtefact(new TextEncoder().encode(makeCodeSourceHex(source,{target:'arcade'})),
        {animationResources:true});
    for (const resource of imported.animationResources) assert.equal(resource.document.version,5);
    const plans=prepareAnimationImport(imported.animationResources);
    assert.deepEqual(plans.map(r=>r.document),imported.animationResources.map(r=>r.document));
});
test('identical rich resources receive distinct Scratch carrier costumes and survive real VM reload',async()=>{
    const imported=importProjectFiles(files(),{target:'arcade',animationResources:true});
    const first=imported.animationResources[0],second=structuredClone(first);
    second.id='myAnimations.copy';second.name='Walk copy';
    second.document.animation.resource.id=imported.animationResources[1].document.animation.resource.id;
    imported.animationResources=[first,second];
    const expected=structuredClone(imported.animationResources.map(row=>row.document));
    const f=await build(imported),project=JSON.parse(await f.zip.file('project.json').async('text'));
    assert.deepEqual(imported.animationResources.map(row=>row.document),expected);
    const costumes=project.targets.at(-1).costumes;
    assert.deepEqual(costumes.map(row=>row.name),['Walk','Walk 2']);
    assert.equal(costumes[0].assetId,costumes[1].assetId,'identical pixels share the exact storage asset');
    const opened=await open(f.bytes,project);
    try {
        const zip=await JSZip.loadAsync(await(await opened.vm.saveProjectSb3()).arrayBuffer());
        assert.equal(await writeArtworkToZip(zip,opened.vm),true);
        const saved=await zip.generateAsync({type:'uint8array'});
        const reopened=await open(saved,JSON.parse(await zip.file('project.json').async('text')));
        try {
            assert.deepEqual(reopened.inspection.records.filter(row=>row.document.animation?.resource)
                .map(row=>row.document),expected);
            assert.equal(reopened.vm.runtime.bwArcadeAnimationResources.size,2);
        } finally {reopened.vm.quit();}
    } finally {opened.vm.quit();}
});
test('failed native preflight and hash failures leave the generated ZIP unchanged',async()=>{
    const imported=importProjectFiles(files(),{target:'arcade',animationResources:true});
    const creator=new Creator();creator.parse(imported.code);
    const zip=await JSZip.loadAsync(await (await creator.generateSB3()).arrayBuffer());
    const before=await zip.generateAsync({type:'uint8array'});
    const invalid=structuredClone(imported.animationResources);invalid[1].document.animation.frames[0].layers[0].content.value.pixels[0]=16;
    await assert.rejects(installAnimationImport(zip,invalid,hash),/invalid pixel/);
    let calls=0;
    await assert.rejects(installAnimationImport(zip,imported.animationResources,bytes=>{
        if (++calls===2) throw new Error('storage failed');return hash(bytes);
    }),/storage failed/);
    assert.deepEqual(await zip.generateAsync({type:'uint8array'}),before);
});
test('CLI native import/export/import preserves unused artwork and compiles fresh semantics in original PXT',async()=>{
    const dir=await fs.mkdtemp(path.join(os.tmpdir(),'bw-animation-library-cli-'));
    const command=(...args)=>promisify(execFile)(process.execPath,['scripts/makecode.mjs',...args],{maxBuffer:1024*1024});
    try {
        const input=path.join(dir,'native.hex'),sb3=path.join(dir,'native.sb3'),hex=path.join(dir,'return.hex');
        await fs.writeFile(input,makeCodeSourceHex(files(),{target:'arcade',name:'Native'}));
        await command('to-sb3',input,'--target','arcade','-o',sb3);
        const first=await inspectArtwork(await fs.readFile(sb3));assert.equal(first.outcome,'loaded',first.reason);
        assert.equal(first.libraries.length,1);assert.equal(first.records.length,2);
        await command('to-hex',sb3,'--target','arcade','--source','-o',hex);
        const recovered=await importArtefact(await fs.readFile(hex),{animationResources:true});
        assert.deepEqual(recovered.animationResources.map(r=>r.document),first.records.map(r=>r.document));
        const pxt=await compile('arcade',recovered.files);assert.equal(pxt.success,true,JSON.stringify(pxt.diagnostics));
        assert.deepEqual(pxt.netAttempts,[]);
        const original=await runArcadeSim(pxt.outfiles['binary.js'],{ms:500});assert.equal(original.error,null);
        assert.deepEqual(original.serial.map(row=>Number(row.text)).filter(Number.isFinite),[9,2,2]);
        const second=path.join(dir,'second.sb3');await command('to-sb3',hex,'--target','arcade','-o',second);
        const next=await inspectArtwork(await fs.readFile(second));assert.equal(next.outcome,'loaded',next.reason);
        assert.deepEqual(next.records.map(r=>r.document),first.records.map(r=>r.document));
    } finally {await fs.rm(dir,{recursive:true,force:true});}
});
