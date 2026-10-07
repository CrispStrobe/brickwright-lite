import test from 'node:test';
import assert from 'node:assert/strict';
import {encodeAnimationCompanion, recoverAnimationCompanion, AnimationCompanionError,
    ANIMATION_COMPANION_LIMITS} from '../overlay/scratch-gui/src/lib/bw-makecode/animation-companion.js';
import {ARCADE_PALETTE,remapPalette} from '../overlay/scratch-gui/src/lib/bw-makecode/pixel-image.js';
import {blankLayer,layersDocument} from '../overlay/scratch-gui/src/lib/bw-pixel-layers.js';
import {animationResourceFromDocument} from '../overlay/scratch-gui/src/lib/bw-animation-resources.js';
import {encodeAnimationJres,decodeAnimationJres} from '../overlay/scratch-gui/src/lib/bw-makecode/animation-jres.js';
const uuid='12345678-1234-4234-8234-123456789abc';
const source=(id=uuid,palette=ARCADE_PALETTE)=>{
    const base=blankLayer('ink','Ink',2,1);base.pixels=new Uint8Array([2,3]);
    const hidden=blankLayer('hidden','Hidden',2,1);hidden.visible=false;hidden.pixels=new Uint8Array([7,9]);
    const later=blankLayer('ink','Ink',2,1);later.pixels=new Uint8Array([5,6]);
    return layersDocument([base,hidden],2,1,3,'ink',palette,{resource:{id,name:'Walk'},activeFrameId:'first',frames:[
        {id:'first',name:'First',durationMs:100,activeLayerId:'ink',layers:[base,hidden]},
        {id:'later',name:'Later',durationMs:100,activeLayerId:'ink',layers:[later]}]});
};
const fixture=(document=source(),palette=ARCADE_PALETTE,id='myAnimations.walk')=>{
    const resource=animationResourceFromDocument(document);
    const frames=resource.frames.map(frame=>remapPalette({width:resource.width,height:resource.height,pixels:frame.pixels},resource.palette,palette));
    const nativeEntry=encodeAnimationJres({id,namespace:'myAnimations',name:resource.name,
        width:resource.width,height:resource.height,intervalMs:resource.frames[0].durationMs,frames});
    const animation=decodeAnimationJres(nativeEntry);
    return {entry:{nativeId:animation.id,document,nativeEntry},animation};
};
const rejected=(action,code)=>assert.throws(action,error=>error instanceof AnimationCompanionError && error.code===code);
const edit=(text,fn)=>{const payload=JSON.parse(text);fn(payload);return JSON.stringify(payload);};

test('no-edit recovery retains UUID, frame IDs, layers and palette, with detached output documents',()=>{
    const {entry,animation}=fixture(),text=encodeAnimationCompanion([entry],ARCADE_PALETTE);
    const expected=structuredClone(entry.document);
    const result=recoverAnimationCompanion(text,[animation],ARCADE_PALETTE);
    assert.deepEqual(result.warnings,[]);assert.deepEqual(result.resources,[{nativeId:animation.id,document:expected}]);
    result.resources[0].document.layers[0].name='Edited locally';
    assert.deepEqual(entry.document,expected);
    assert.deepEqual(recoverAnimationCompanion(text,[animation],ARCADE_PALETTE).resources[0].document,expected);
});

test('native display rename updates rich name while retaining UUID and source frames',()=>{
    const {entry,animation}=fixture(),text=encodeAnimationCompanion([entry]);
    const renamed={...animation,name:'Run'};
    const result=recoverAnimationCompanion(text,[renamed]);
    assert.deepEqual(result.warnings,[]);
    assert.equal(result.resources[0].document.animation.resource.id,uuid);
    assert.equal(result.resources[0].document.animation.resource.name,'Run');
    assert.deepEqual(result.resources[0].document.animation.frames,entry.document.animation.frames);
});

test('projection uses the exact exporter palette remapping and compares project RGB',()=>{
    const palette=[...ARCADE_PALETTE];[palette[2],palette[5]]=[palette[5],palette[2]];
    const {entry,animation}=fixture(source(uuid,palette));
    assert.equal(animation.frames[0].pixels[0],5,'source index2 is exported at project index5');
    const text=encodeAnimationCompanion([entry],ARCADE_PALETTE);
    assert.deepEqual(recoverAnimationCompanion(text,[animation],ARCADE_PALETTE).resources[0].document,entry.document);
    const upper=ARCADE_PALETTE.map((colour,i)=>i?colour.toUpperCase():'#000000');
    assert.deepEqual(recoverAnimationCompanion(text,[animation],upper).warnings,[],'palette hex case and transparent slotRGB are normalized');
    const changed=[...ARCADE_PALETTE];changed[2]='#123456';
    const stale=recoverAnimationCompanion(text,[animation],changed);
    assert.equal(stale.resources[0].document,null);assert.equal(stale.resources[0].reason,'project-palette-changed');
    assert.match(stale.warnings[0],/project-palette-changed/);
});

test('native pixel/order/count/timing/size edits retain native assets and invalidate rich source',()=>{
    const {entry,animation}=fixture(),text=encodeAnimationCompanion([entry]);
    const edits=[a=>a.frames[0].pixels[0]=9,a=>a.frames.reverse(),a=>a.frames.pop(),
        a=>a.intervalMs=120,a=>{a.width=1;a.frames.forEach(f=>f.pixels=f.pixels.slice(0,1));}];
    for(const change of edits){
        const modified=structuredClone(animation);change(modified);const before=structuredClone(modified);
        const result=recoverAnimationCompanion(text,[modified]);
        assert.equal(result.resources[0].document,null);assert.equal(result.resources[0].reason,'stale-projection');
        assert.match(result.warnings[0],/stale-projection/);assert.deepEqual(modified,before,'native data never changed');
    }
});

test('missing metadata/unused native assets remain explicit, unmodified fallback resources',()=>{
    const {entry,animation}=fixture(),text=encodeAnimationCompanion([entry]);
    const unused={...animation,id:'myAnimations.unused',name:'Unused'};
    const result=recoverAnimationCompanion(text,[animation,unused]);
    assert.equal(result.resources.length,2);assert.equal(result.resources[1].document,null);assert.equal(result.resources[1].reason,'no-record');
    const single={...unused,intervalMs:1,frames:[unused.frames[0]]};
    assert.equal(recoverAnimationCompanion(null,[single]).resources[0].document,null);
    assert.equal(single.intervalMs,1);assert.equal(single.frames.length,1);
    assert.match(recoverAnimationCompanion(text,[]).warnings[0],/no native asset/);
    assert.equal(recoverAnimationCompanion(undefined,[animation]).resources[0].reason,'missing-companion');
});

test('companion metadata count limits do not restrict larger native galleries',()=>{
    const {entry,animation}=fixture();
    const gallery=[animation,...Array.from({length:128},(_,i)=>({...animation,id:`myAnimations.extra${i}`,name:`Extra ${i}`}))];
    const before=structuredClone(gallery);
    const missing=recoverAnimationCompanion(undefined,gallery);
    assert.equal(missing.resources.length,129);
    assert.ok(missing.resources.every(resource=>resource.document===null && resource.reason==='missing-companion'));
    const recovered=recoverAnimationCompanion(encodeAnimationCompanion([entry]),gallery);
    assert.equal(recovered.resources.length,129);
    assert.deepEqual(recovered.resources[0].document,entry.document);
    assert.ok(recovered.resources.slice(1).every(resource=>resource.document===null && resource.reason==='no-record'));
    assert.deepEqual(gallery,before);
    rejected(()=>recoverAnimationCompanion(undefined,{}),'SCHEMA');
});

test('malformed or duplicate metadata fails atomically before any recovered documents escape',()=>{
    const {entry,animation}=fixture(),text=encodeAnimationCompanion([entry]);
    rejected(()=>recoverAnimationCompanion('{',[animation]),'JSON');
    rejected(()=>recoverAnimationCompanion(edit(text,p=>p.version=99),[animation]),'VERSION');
    rejected(()=>recoverAnimationCompanion(edit(text,p=>p.format='other'),[animation]),'SCHEMA');
    rejected(()=>recoverAnimationCompanion(edit(text,p=>p.resources.push(p.resources[0])),[animation]),'DUPLICATE_NATIVE_ID');
    rejected(()=>recoverAnimationCompanion(edit(text,p=>p.resources.push({...p.resources[0],nativeId:'myAnimations.other'})),[animation]),'DUPLICATE_UUID');
    rejected(()=>recoverAnimationCompanion(edit(text,p=>{
        const duplicate=structuredClone(p.resources[0]);duplicate.nativeId='myAnimations.upper';
        duplicate.document.animation.resource.id=uuid.toUpperCase();p.resources.push(duplicate);
    }),[animation]),'DUPLICATE_UUID');
    rejected(()=>recoverAnimationCompanion(edit(text,p=>p.resources[0].document.animation.resource.id='not-uuid'),[animation]),'DOCUMENT');
    rejected(()=>recoverAnimationCompanion(edit(text,p=>p.resources[0].document.layers[0].opacity=2),[animation]),'DOCUMENT');
    rejected(()=>recoverAnimationCompanion(edit(text,p=>p.resources[0].document.animation.frames[0].layers[0].content.value.pixels[0]=16),[animation]),'DOCUMENT');
    rejected(()=>recoverAnimationCompanion(edit(text,p=>p.resources[0].document.activeLayerId='missing'),[animation]),'DOCUMENT');
    rejected(()=>recoverAnimationCompanion(edit(text,p=>p.resources[0].nativeProjection.frames[0][0]=12),[animation]),'PROJECTION');
    rejected(()=>recoverAnimationCompanion(text,[animation,animation]),'DUPLICATE_NATIVE_ID');
    assert.deepEqual(entry.document,source(),'invalid attempts never mutate input source');
});

test('encode rejects unbound/mismatched source and enforces byte, count and palette bounds',()=>{
    const {entry,animation}=fixture();
    rejected(()=>encodeAnimationCompanion([{...entry,nativeId:'walk'}]),'IDENTITY');
    const wrong=structuredClone(entry);wrong.document.animation.frames.reverse();
    rejected(()=>encodeAnimationCompanion([wrong]),'PROJECTION');
    rejected(()=>encodeAnimationCompanion([entry,entry]),'DUPLICATE_NATIVE_ID');
    rejected(()=>encodeAnimationCompanion(Array(ANIMATION_COMPANION_LIMITS.resources+1).fill(entry)),'RESOURCE_LIMIT');
    rejected(()=>recoverAnimationCompanion(' '.repeat(ANIMATION_COMPANION_LIMITS.bytes+1),[animation]),'RESOURCE_LIMIT');
    rejected(()=>recoverAnimationCompanion('é'.repeat(ANIMATION_COMPANION_LIMITS.bytes/2+1),[animation]),'RESOURCE_LIMIT');
    rejected(()=>encodeAnimationCompanion([entry],['bad']),'PALETTE');
    rejected(()=>recoverAnimationCompanion(null,[{...animation,intervalMs:0}]),'NATIVE_ASSET');
    const valid=encodeAnimationCompanion([entry]);
    const reordered=edit(valid,p=>{const projection=p.resources[0].nativeProjection;
        p.resources[0].nativeProjection={frames:projection.frames,intervalMs:projection.intervalMs,height:projection.height,width:projection.width};});
    assert.deepEqual(recoverAnimationCompanion(reordered,[animation]).warnings,[],'JSON object key order is not pixel identity');
});
