import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import JSZip from 'jszip';
import {scopeAfter} from './helpers/js-scope.mjs';
import {ARCADE_PALETTE} from '../overlay/scratch-gui/src/lib/bw-makecode/pixel-image.js';
import {blankLayer,layersDocument,layersToSvg,composeLayers,sourceFrames} from '../overlay/scratch-gui/src/lib/bw-pixel-layers.js';
import {setCostumeDocument,getCostumeDocument,newAnimationResourceId,syncAnimationResources,copyCostumeDocument,
    resetCostumeDocument,applyArtwork,attachArtwork,inspectArtwork,artworkBundleVersion,ARTWORK_PATH} from '../overlay/scratch-gui/src/lib/bw-artwork-bundle.js';
import * as oldReader from './fixtures/artwork-reader-v4.mjs';
const source=readFileSync(new URL('../overlay/scratch-gui/src/components/tw-pseudocode/pixel-art-editor.jsx',import.meta.url),'utf8');
const clone=value=>structuredClone(value);
const binding={id:'12345678-1234-4234-8234-123456789abc',name:'Walk'};
const document=(resource=binding)=>{
    const first=blankLayer('pixels','Pixels',2,1);first.pixels=new Uint8Array([2,3]);
    const second=blankLayer('pixels','Pixels',2,1);second.pixels=new Uint8Array([7,8]);
    return layersDocument([first],2,1,3,'pixels',ARCADE_PALETTE,{activeFrameId:'a',resource,frames:[
        {id:'a',durationMs:100,layers:[first],activeLayerId:'pixels'},
        {id:'b',durationMs:100,layers:[second],activeLayerId:'pixels'}]});
};
const fixture=()=>{
    const costume={name:'Painted',assetId:'art',md5ext:'art.svg',dataFormat:'svg',asset:{assetId:'art',dataFormat:'svg',data:new TextEncoder().encode('<svg/>')}};
    const target={isStage:false,isOriginal:true,name:'Actor',currentCostume:0,sprite:{costumes:[costume]}};
    const errors=[],vm={runtime:{targets:[target],emit:(type,message)=>errors.push({type,message})}};
    return {costume,target,vm,errors};
};
const method=(signature,parameters,bindings)=>new Function(...Object.keys(bindings),`return function(${parameters}) ${scopeAfter(source,signature)}`)(...Object.values(bindings));
const methods={
    save:method('save (resourceOverride) {','resourceOverride',{layersDocument,layersToSvg,setCostumeDocument,syncAnimationResources}),
    publishAnimation:method('publishAnimation () {','',{newAnimationResourceId}),
    removeAnimationBinding:method('removeAnimationBinding () {','',{}),
    remember:method('remember () {','',{}),
    undo:method('undo () {','',{}),
    restore:method('restore (snapshot) {','snapshot',{composeLayers})
};
const editorFixture=(published=false)=>{
    const f=fixture(),doc=document(published?binding:null),frames=sourceFrames(doc,2,1),layers=frames[0].layers;
    setCostumeDocument(f.costume,doc);syncAnimationResources(f.vm);
    let writes=0;
    f.vm.updateSvg=()=>{writes++;};
    const state={image:composeLayers(layers,2,1),layers,frames,activeFrameId:'a',activeLayerId:'pixels',w:2,h:1,scale:3,
        palette:ARCADE_PALETTE,animationResource:published?binding:null,animationName:'Walk',animationError:'',animationWarnings:[]};
    const editor={...methods,props:{vm:f.vm,costumeIndex:0},state,undoStack:[],redoStack:[],costume:()=>f.costume,stopPlayback(){},
        materializeFrames(state=this.state){return state.frames;},setState(patch){Object.assign(this.state,typeof patch==='function'?patch(this.state):patch);}};
    return {...f,editor,writes:()=>writes};
};

test('published timeline schema is version4 and bundle5, ordinary animations remain version3',()=>{
    const doc=document();assert.equal(doc.version,4);assert.deepEqual(doc.animation.resource,binding);
    assert.equal(artworkBundleVersion([{document:doc}]),5);
    assert.equal(document(null).version,3);assert.equal(artworkBundleVersion([{document:document(null)}]),3);
    const {costume}=fixture();
    for(const resource of [{...binding,id:'name-only'},{...binding,name:''},{...binding,name:'x'.repeat(81)},null]){
        const invalid=clone(doc);invalid.animation.resource=resource;assert.throws(()=>setCostumeDocument(costume,invalid),/resource identity/);
    }
    const wrong=clone(doc);wrong.version=3;assert.throws(()=>setCostumeDocument(costume,wrong),/require artwork document version 4/);
});

test('registry retains identity through costume/target rename and reorder, updates labels and ordered frames',()=>{
    const {vm,costume,target}=fixture();setCostumeDocument(costume,document());
    const initial=syncAnimationResources(vm).get(binding.id);
    target.name='Renamed target';costume.name='Renamed costume';target.sprite.costumes.unshift({name:'Other',dataFormat:'svg',md5ext:'other.svg'});
    assert.equal(syncAnimationResources(vm).get(binding.id).revision,initial.revision);
    const renamed=document({...binding,name:'Run'});setCostumeDocument(costume,renamed);
    assert.equal(syncAnimationResources(vm).get(binding.id).revision,initial.revision);assert.equal(vm.runtime.bwArcadeAnimationResources.get(binding.id).name,'Run');
    renamed.animation.frames.reverse();setCostumeDocument(costume,renamed);
    assert.deepEqual(syncAnimationResources(vm).get(binding.id).frames.map(frame=>frame.id),['b','a']);
});

test('duplicate IDs fail atomically; project replacement clears stale resources and diagnoses new duplicates',()=>{
    const f=fixture();setCostumeDocument(f.costume,document());const prior=syncAnimationResources(f.vm);
    const duplicate={name:'Copy',md5ext:'copy.svg',dataFormat:'svg'};f.target.sprite.costumes.push(duplicate);setCostumeDocument(duplicate,document());
    assert.throws(()=>syncAnimationResources(f.vm),/Duplicate animation resource ID/);assert.equal(f.vm.runtime.bwArcadeAnimationResources,prior);
    const result=applyArtwork({outcome:'loaded',records:[{targetIndex:0,costumeIndex:0,renderedMd5ext:'art.svg',document:document()},
        {targetIndex:0,costumeIndex:1,renderedMd5ext:'copy.svg',document:document()}]},f.vm);
    assert.match(result.resourceError,/Duplicate animation resource ID/);assert.equal(f.vm.runtime.bwArcadeAnimationResources.size,0);assert.equal(f.errors.length,1);
    for(const outcome of ['legacy','future','invalid']){
        f.vm.runtime.bwArcadeAnimationResources=prior;applyArtwork({outcome},f.vm);assert.equal(f.vm.runtime.bwArcadeAnimationResources.size,0);
    }
});

test('duplicating a published costume creates a fresh stable UUID; reset removes only that binding',()=>{
    const f=fixture();setCostumeDocument(f.costume,document());syncAnimationResources(f.vm);
    const duplicate={name:'Copy',dataFormat:'svg',md5ext:'copy.svg'};f.target.sprite.costumes.push(duplicate);
    copyCostumeDocument(f.costume,duplicate,f.vm);
    const next=getCostumeDocument(duplicate);assert.notEqual(next.animation.resource.id,binding.id);assert.match(next.animation.resource.id,/^[0-9a-f-]{36}$/);
    assert.deepEqual(next.animation.frames,document().animation.frames);assert.equal(f.vm.runtime.bwArcadeAnimationResources.size,2);
    resetCostumeDocument(duplicate,f.vm);assert.deepEqual([...f.vm.runtime.bwArcadeAnimationResources.keys()],[binding.id]);
});

test('actual Publish/Update/Remove methods save resource metadata and preserve undo snapshots',()=>{
    const f=editorFixture();f.editor.publishAnimation();assert.equal(f.writes(),1);
    const first=getCostumeDocument(f.costume);assert.equal(first.version,4);const id=first.animation.resource.id;
    assert.equal(f.vm.runtime.bwArcadeAnimationResources.get(id).frames.length,2);
    f.editor.state.animationName='Running';assert.equal(f.editor.save(),true);assert.equal(getCostumeDocument(f.costume).animation.resource.id,id);
    assert.equal(f.vm.runtime.bwArcadeAnimationResources.get(id).name,'Running');
    f.editor.state.animationName='Sprint';f.editor.publishAnimation();assert.equal(getCostumeDocument(f.costume).animation.resource.id,id);
    assert.equal(f.vm.runtime.bwArcadeAnimationResources.get(id).name,'Sprint');
    f.editor.removeAnimationBinding();assert.equal(getCostumeDocument(f.costume).version,3);assert.equal(f.vm.runtime.bwArcadeAnimationResources.size,0);
    f.editor.undo();assert.equal(f.editor.state.animationResource.id,id);assert.equal(f.editor.save(),true);assert.equal(f.vm.runtime.bwArcadeAnimationResources.size,1);
});

test('unequal publication and in-place published save refuse before touching artwork or registry',()=>{
    for(const published of [false,true]){
        const f=editorFixture(published),prior=f.vm.runtime.bwArcadeAnimationResources,doc=getCostumeDocument(f.costume);
        f.editor.state.frames[1].durationMs=240;
        f.editor.publishAnimation();assert.equal(f.writes(),0);assert.match(f.editor.state.animationError,/equal durations/);
        if(published){assert.equal(f.editor.save(),false);assert.match(f.editor.state.animationError,/equal frame durations/);}
        assert.equal(f.vm.runtime.bwArcadeAnimationResources,prior);assert.equal(getCostumeDocument(f.costume),doc);
        assert.equal(f.editor.state.frames[1].durationMs,240,'art remains editable, not flattened');
    }
});

test('save/publication reports compositing warnings without substituting uncomposited frames',()=>{
    const f=editorFixture();for(const frame of f.editor.state.frames)frame.layers[0].opacity=0.7;
    f.editor.publishAnimation();assert.equal(f.writes(),1);assert.ok(f.editor.state.animationWarnings.some(warning=>/opacity quantized/.test(warning)));
    assert.ok(source.includes('data-testid="bw-pixel-animation-warnings"'));
});

test('published animation survives SB3 and older readers preserve future bundle bytes',async()=>{
    const f=fixture();setCostumeDocument(f.costume,document());
    const zip=new JSZip();zip.file('project.json',JSON.stringify({targets:[{isStage:false,name:'Actor',costumes:[{name:'Painted',md5ext:'art.svg',dataFormat:'svg'}]}]}));zip.file('art.svg','<svg/>');
    const saved=await attachArtwork(await zip.generateAsync({type:'blob'}),f.vm);
    const payload=await (await JSZip.loadAsync(await saved.arrayBuffer())).file(ARTWORK_PATH).async('text');assert.equal(JSON.parse(payload).version,5);
    const inspection=await inspectArtwork(await saved.arrayBuffer());assert.equal(inspection.outcome,'loaded');
    applyArtwork(inspection,f.vm);assert.equal(f.vm.runtime.bwArcadeAnimationResources.get(binding.id).name,'Walk');
    const old=await oldReader.inspectArtwork(await saved.arrayBuffer());assert.equal(old.outcome,'future');oldReader.applyArtwork(old,f.vm);
    const oldSaved=await oldReader.attachArtwork(saved,f.vm);
    assert.equal(await (await JSZip.loadAsync(await oldSaved.arrayBuffer())).file(ARTWORK_PATH).async('text'),payload);
});
