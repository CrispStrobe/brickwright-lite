import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import JSZip from 'jszip';
import {deflateSync, inflateSync} from 'node:zlib';
import {scopeAfter} from './helpers/js-scope.mjs';
import {ARCADE_PALETTE, editablePixelSize, MAX_PIXEL_DIMENSION, rasterEditorSize, quantizeRgba,
    pixelsToSvg, svgToPixels, sliceSpriteSheet, toImgLiteral} from '../overlay/scratch-gui/src/lib/bw-makecode/pixel-image.js';
import {parseExactImgLiteral} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-assets.js';
import {blankLayer, resizeLayers, composeLayers, layersDocument, layersToSvg, sourceLayers, sourceFrames} from '../overlay/scratch-gui/src/lib/bw-pixel-layers.js';
import {setCostumeDocument, getCostumeDocument, attachArtwork, inspectArtwork, applyArtwork} from '../overlay/scratch-gui/src/lib/bw-artwork-bundle.js';
const source=readFileSync(new URL('../overlay/scratch-gui/src/components/tw-pseudocode/pixel-art-editor.jsx',import.meta.url),'utf8');
const image={width:160,height:120,pixels:new Uint8Array(160*120)};
for(const [offset,color] of [[0,2],[159,7],[119*160,5],[19199,9]])image.pixels[offset]=color;
const rgba=new Uint8Array(160*120*4);
for(let i=0;i<image.pixels.length;i++)if(image.pixels[i])rgba.set([...ARCADE_PALETTE[image.pixels[i]].slice(1).match(/../g).map(v=>parseInt(v,16)),255],i*4);

// A real PNG fixture with unfiltered RGBA rows, avoiding an image SDK dependency.
const pngChunk=(name,data)=>{
    const body=Buffer.concat([Buffer.from(name),data]);let crc=0xffffffff;
    for(const byte of body){crc^=byte;for(let bit=0;bit<8;bit++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}
    const head=Buffer.alloc(4),tail=Buffer.alloc(4);head.writeUInt32BE(data.length);tail.writeUInt32BE((crc^0xffffffff)>>>0);
    return Buffer.concat([head,body,tail]);
};
const scanlines=Buffer.concat(Array.from({length:120},(_,y)=>Buffer.concat([Buffer.from([0]),Buffer.from(rgba.subarray(y*640,(y+1)*640))])));
const header=Buffer.alloc(13);header.writeUInt32BE(160);header.writeUInt32BE(120,4);header[8]=8;header[9]=6;
const png=Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),pngChunk('IHDR',header),pngChunk('IDAT',deflateSync(scanlines)),pngChunk('IEND',Buffer.alloc(0))]);
const idatOffset=8+12+13;
const decoded=inflateSync(png.subarray(idatOffset+8,idatOffset+8+png.readUInt32BE(idatOffset)));
const decodedRgba=Buffer.concat(Array.from({length:120},(_,y)=>decoded.subarray(y*641+1,(y+1)*641)));

test('160×120 indexed backgrounds retain every pixel through SVG and Arcade literals',()=>{
    assert.ok(editablePixelSize(160,120));assert.ok(editablePixelSize(128,128));
    for(const size of [[161,120],[160,161],[0,120],[-1,1],[1.5,2],[Infinity,1]])assert.equal(editablePixelSize(...size),false);
    const svg=pixelsToSvg(image,{scale:3});
    const reopened=svgToPixels(svg);assert.equal(reopened.scale,3);assert.deepEqual(reopened.pixels,image.pixels);
    assert.deepEqual(parseExactImgLiteral(toImgLiteral(image)).pixels,image.pixels);
});

test('PNG raster pixels and 3× stage renders retain background dimensions and corners',()=>{
    const size=rasterEditorSize(160,120,true);assert.deepEqual(size,{width:160,height:120,scale:3});
    assert.deepEqual(quantizeRgba(decodedRgba,160,120,size.width,size.height).pixels,image.pixels);
    const big=new Uint8Array(480*360*4);
    for(let y=0;y<360;y++)for(let x=0;x<480;x++)big.set(rgba.subarray((Math.floor(y/3)*160+Math.floor(x/3))*4,(Math.floor(y/3)*160+Math.floor(x/3))*4+4),(y*480+x)*4);
    assert.deepEqual(rasterEditorSize(480,360,true),size);
    assert.deepEqual(quantizeRgba(big,480,360,160,120).pixels,image.pixels);
    assert.deepEqual(rasterEditorSize(160,120,false),{width:40,height:30,scale:4},'other costume conversion unchanged');
});

test('sprite sheets permit complete full-screen frames and reject invalid/oversize cells',()=>{
    const sheet=new Uint8Array(160*240*4);sheet.set(rgba);sheet.set(rgba,rgba.length);
    assert.deepEqual(sliceSpriteSheet(sheet,160,240,160,120).frames.map(f=>f.pixels),[image.pixels,image.pixels]);
    for(const args of [[-160,240,160,120],[160,240,-160,120],[160,240,160,121],[161,240,161,120]])assert.equal(sliceSpriteSheet(sheet,...args),null);
});

const bind=(signature,parameters,bindings)=>new Function(...Object.keys(bindings),`return function(${parameters}) ${scopeAfter(source,signature)}`)(...Object.values(bindings));
const resize=bind('resize (w, h, scale = this.state.scale) {','w,h,scale=this.state.scale',{MAX_PIXEL_DIMENSION,resizeLayers,composeLayers});
const save=bind('save () {','',{layersToSvg,layersDocument,setCostumeDocument});
const dirty=bind('hasUnsavedChanges () {','',{});

test('actual editor preset resize/save retains layers, frames, logical pixels and scale undo',()=>{
    const first=blankLayer('first','First',160,120);first.pixels=image.pixels;
    const second=blankLayer('second','Second',160,120);second.visible=false;
    const layers=[first,second],frames=[{id:'a',durationMs:100,layers,activeLayerId:'first'},{id:'b',durationMs:240,layers,activeLayerId:'second'}];
    const costume={};let rendered;
    const editor={props:{costumeIndex:0,vm:{updateSvg:(index,svg,cx,cy)=>{rendered={index,svg,cx,cy};}}},undoStack:[],redoStack:[],state:{image:composeLayers(layers,160,120),w:160,h:120,scale:4,layers,frames,activeFrameId:'a',activeLayerId:'first',palette:ARCADE_PALETTE,original:{layers,frames,palette:ARCADE_PALETTE,w:160,h:120,scale:4}},
        remember:bind('remember () {','',{}),restore:bind('restore (snapshot) {','snapshot',{composeLayers}),materializeFrames(state=this.state){return state.frames;},stopPlayback(){},costume:()=>costume,
        setState(patch){Object.assign(this.state,typeof patch==='function'?patch(this.state):patch);}};
    resize.call(editor,160,120,3);assert.equal(editor.undoStack[0].scale,4);assert.ok(dirty.call(editor));
    bind('undo () {','',{}).call(editor);assert.equal(editor.state.scale,4);
    bind('redo () {','',{}).call(editor);assert.equal(editor.state.scale,3);
    save.call(editor);assert.equal(rendered.cx,240);assert.equal(rendered.cy,180);
    assert.deepEqual(svgToPixels(rendered.svg).pixels,image.pixels);assert.equal(dirty.call(editor),false);
    const doc=getCostumeDocument(costume);assert.equal(doc.pixelScale,3);assert.equal(doc.animation.frames[1].durationMs,240);assert.equal(doc.layers[1].visible,false);
    assert.ok(source.includes('data-testid="bw-pixel-arcade-background" onClick={() => this.resize(160, 120, 3)}'));
});

test('160×120 layered animation persists through SB3 and rejects malformed/oversize sources',async()=>{
    const layer=blankLayer('pixels','Pixels',160,120);layer.pixels=image.pixels;
    const frames=[{id:'a',durationMs:100,layers:[layer],activeLayerId:'pixels'},{id:'b',durationMs:240,layers:[layer],activeLayerId:'pixels'}];
    const doc=layersDocument([layer],160,120,3,'pixels',ARCADE_PALETTE,{frames,activeFrameId:'a'});
    const costume={name:'Backdrop',md5ext:'background.png',dataFormat:'png'};
    setCostumeDocument(costume,doc);
    const zip=new JSZip();zip.file('project.json',JSON.stringify({targets:[{isStage:true,name:'Stage',costumes:[costume]}]}));zip.file('background.png',png);
    const vm={runtime:{targets:[{isOriginal:true,isStage:true,sprite:{costumes:[costume]}}]}};
    const saved=await attachArtwork(await zip.generateAsync({type:'blob'}),vm);
    const savedZip=await JSZip.loadAsync(await saved.arrayBuffer());assert.deepEqual(await savedZip.file('background.png').async('nodebuffer'),png);
    const inspected=await inspectArtwork(await saved.arrayBuffer());assert.equal(inspected.outcome,'loaded');
    const reopened={...costume};assert.equal(applyArtwork(inspected,{runtime:{targets:[{isOriginal:true,isStage:true,sprite:{costumes:[reopened]}}]}}).count,1);
    assert.deepEqual(getCostumeDocument(reopened),doc);
    for(const mutate of [value=>{value.width=161;value.pixels=Array(161*120).fill(0);},value=>{value.pixels.pop();},value=>{value.pixels[0]=16;}]){
        const bad=structuredClone(doc);mutate(bad.layers[0].content.value);assert.throws(()=>setCostumeDocument({},bad),/invalid pixel source/);
    }
});


test('actual editor opening recognizes a native PNG backdrop without shrinking it',async()=>{
    const bindings={getCostumeDocument,ARCADE_PALETTE,sourceLayers,sourceFrames,composeLayers,svgToPixels,
        editablePixelSize,rasterEditorSize,quantizeRgba,blankLayer,
        rasterize:async()=>({rgba:decodedRgba,w:160,h:120})};
    const load=new Function(...Object.keys(bindings),`return async function(size) ${scopeAfter(source,'async load (size) {')}`)(...Object.values(bindings));
    const costume={asset:{dataFormat:'png'}};
    const editor={props:{vm:{editingTarget:{isStage:true}}},state:{},costume:()=>costume,
        setState(patch){Object.assign(this.state,patch);}};
    await load.call(editor);assert.equal(editor.state.w,160);assert.equal(editor.state.h,120);assert.equal(editor.state.scale,3);
    assert.deepEqual(editor.state.image.pixels,image.pixels);assert.equal(editor.state.converted,true,'palette conversion remains disclosed');
    await load.call(editor,{w:160,h:120});assert.equal(editor.state.scale,3,'reconversion retains chosen backdrop display scale');
});
