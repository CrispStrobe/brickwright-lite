import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {loadExtensionClass} from './helpers/bw-extensions.mjs';
const setup=()=>{const runtime=new EventEmitter(),errors=[];runtime.startHats=()=>[];runtime.on('BLOCKS_ERROR',error=>errors.push(error));return{runtime,errors,native:new(loadExtensionClass('arcade'))(runtime)};};
const image=(width,height,color=0)=>({width,height,pixels:new Uint8Array(width*height).fill(color)});

test('tile kind compares original pixels without inserting a copied image into the map',()=>{
    const {native}=setup(),owner=native._inst,state=owner._state(),tile=image(16,16,3),clear=image(16,16);
    state.tilemap={columns:3,rows:3,tileSize:16,images:[clear,tile],indices:new Uint8Array([0,1,0,1,1,1,0,1,0]),views:[]};
    state.sprites.actor={id:'actor',_fx:24*256,_fy:24*256};
    const copy=owner._imageHandle(image(16,16,3));
    for(const direction of [0,1,2,3,4,99])assert.equal(native.spriteTileKindAt({ID:'actor',DIRECTION:direction,IMAGE:copy}),true);
    assert.equal(state.tilemap.images.length,2);
    owner._image(copy).pixels[0]=4;
    assert.equal(native.spriteTileKindAt({ID:'actor',DIRECTION:4,IMAGE:copy}),false);
    state.sprites.actor._fx=-1;
    assert.equal(native.spriteTileKindAt({ID:'actor',DIRECTION:0,IMAGE:owner._imageHandle(clear)}),true);
});

test('original image equality checks dimensions and indexed pixels, regardless of aliases',()=>{
    const {native,errors}=setup(),owner=native._inst,a=owner._imageHandle(image(2,2,3)),b=owner._imageHandle(image(2,2,3));
    assert.equal(native.imageEquals({IMAGE:a,OTHER:b}),true);
    assert.equal(native.imageEquals({IMAGE:a,OTHER:owner._imageHandle(image(1,4,3))}),false);
    owner._image(b).pixels[1]=4;assert.equal(native.imageEquals({IMAGE:a,OTHER:b}),false);
    assert.equal(native.imageEquals({IMAGE:a,OTHER:''}),false);assert.deepEqual(errors,[]);
});

test('next-button waits settle together on a new press and stop disposes registered waits',async()=>{
    const {runtime,native}=setup();let done=0;
    const a=native.waitAnyButton().then(()=>done++),b=native.waitAnyButton().then(()=>done++);
    await Promise.resolve();assert.equal(done,0);
    runtime.emit('KEY_STATE_CHANGED','space',true);await Promise.all([a,b]);assert.equal(done,2);
    const cancelled=native.waitAnyButton();runtime.emit('PROJECT_STOP_ALL');await cancelled;
    assert.equal(native._inst._nativeButtonWaiters.size,0);
    const replacement=native.waitAnyButton().then(()=>done++);
    runtime.emit('KEY_STATE_CHANGED','space',true);await Promise.resolve();assert.equal(done,2);
    runtime.emit('KEY_STATE_CHANGED','space',false);runtime.emit('KEY_STATE_CHANGED','space',true);await replacement;assert.equal(done,3);
});
