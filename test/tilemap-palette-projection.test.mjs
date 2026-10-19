import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectTilemapPalette, observeTilemapPalette, drawTilemapImage, tilemapPixelColor} from '../overlay/scratch-gui/src/lib/bw-makecode/tilemap-palette.js';
import {DEFAULT_PROJECT_PALETTE, paletteHex} from '../overlay/scratch-gui/src/lib/arcade-project-palette.js';
import {createTilemap, addTile, paintTilePixel, paintCell, setWall, tilemapText, parseTilemapText} from '../overlay/scratch-gui/src/lib/bw-makecode/tilemap-editor.js';

const colors = [...DEFAULT_PROJECT_PALETTE];
colors[0] = '#102030'; colors[1] = '#123456'; colors[2] = '#123456'; colors[3] = '#654321'; colors[15] = '#000000';
const emitter = () => {
    const listeners = new Map();
    return {on(name, fn) { if (!listeners.has(name)) listeners.set(name, new Set()); listeners.get(name).add(fn); },
        removeListener(name, fn) { listeners.get(name)?.delete(fn); },
        emit(name) { for (const fn of [...(listeners.get(name) || [])]) fn(); }, listeners};
};
// Normal VM block schema passed to the actual project inspector, not a mock
// palette query. Native artwork/save/load coverage is in the separate module.
const fixture = (palette = colors) => {
    const blocks = {_blocks: {}, getScripts() { return ['start']; }, getBlock(id) { return this._blocks[id]; }};
    blocks._blocks.start = {id:'start',opcode:'arcade_whenSourceStarts',next:palette ? 'palette' : null};
    if (palette) {
        blocks._blocks.palette = {id:'palette',opcode:'arcade_setPalette',inputs:{DATA:{block:'text',shadow:'text'}},next:null};
        blocks._blocks.text = {id:'text',opcode:'text',shadow:true,fields:{TEXT:{value:paletteHex(palette)}}};
    }
    const vm = {...emitter(),runtime:{...emitter(),targets:[{id:'owner',isOriginal:true,blocks}]}};
    return {vm,blocks};
};
const paint = (image, palette) => {
    const calls = [], ctx = {fillStyle:null,fillRect(x,y,w,h) { calls.push({color:this.fillStyle,x,y,w,h}); }};
    drawTilemapImage(ctx,image,0,0,1,palette); return calls;
};

test('the real startup palette projects duplicate colors and opaque15 without painting transparent0', () => {
    const {vm} = fixture(), image = {width:4,height:1,pixels:[0,1,2,15]}, before = structuredClone(image);
    const actual = inspectTilemapPalette(vm);
    assert.equal(actual.kind,'constant');
    assert.deepEqual(paint(image,actual),[
        {color:'#123456',x:1,y:0,w:1,h:1},{color:'#123456',x:2,y:0,w:1,h:1},{color:'#000000',x:3,y:0,w:1,h:1}
    ]);
    assert.deepEqual(image,before);assert.equal(tilemapPixelColor(actual,0),null);
    const defaults = inspectTilemapPalette(fixture(null).vm);
    assert.deepEqual(defaults.colors,[null,...DEFAULT_PROJECT_PALETTE.slice(1)]);
});

test('painting and serializing the actual tile model retains duplicate-RGB indices and independent walls', () => {
    let map = addTile(createTilemap({columns:2,rows:1,tileSize:4})).data;
    map = paintCell(setWall(map,1,0,true),0,0,1);
    map = paintTilePixel(paintTilePixel(paintTilePixel(map,1,0,0,1),1,1,0,2),1,2,0,15);
    const before = tilemapText(map), palette = inspectTilemapPalette(fixture().vm);
    paint(map.images[1],palette);
    assert.equal(tilemapText(map),before);
    const reopened = parseTilemapText(before);
    assert.deepEqual(reopened.images[1].pixels.slice(0,4),[1,2,15,0]);
    assert.deepEqual(reopened.indices,[1,0]);assert.deepEqual(reopened.walls,[0,1]);
    assert.deepEqual(reopened,map);
});

test('unresolved startup palettes show neutral indices and retain authored later palette changes', () => {
    const {vm,blocks} = fixture();
    Object.defineProperty(vm.runtime,'bwArcadeDeviceState',{get() { throw Error('runtime colors are not source authority'); }});
    blocks._blocks.later = {id:'later',opcode:'arcade_setPalette'};
    assert.equal(inspectTilemapPalette(vm).laterChanges,true);
    blocks._blocks.text.shadow = false;
    const dynamic = inspectTilemapPalette(vm);assert.equal(dynamic.kind,'dynamic');assert.equal(dynamic.colors,null);
    assert.deepEqual(paint({width:2,height:1,pixels:[0,3]},dynamic),[{color:'#94a3b8',x:1,y:0,w:1,h:1}]);
    blocks._blocks.text.shadow = true;
    vm.runtime.targets.push({id:'second',isOriginal:true,blocks});
    const conflict = inspectTilemapPalette(vm);assert.equal(conflict.kind,'conflict');assert.equal(conflict.colors,null);
});

test('actual project edit/load subscriptions refresh projections and release all old or queued callbacks', () => {
    const {vm,blocks} = fixture(), observed = [], release = observeTilemapPalette(vm,p=>observed.push(p));
    assert.equal(observed.length,1);const queued = [...vm.runtime.listeners.get('PROJECT_CHANGED')][0];
    const edited = [...colors];edited[3]='#abcdef';blocks._blocks.text.fields.TEXT.value=paletteHex(edited);
    vm.runtime.emit('PROJECT_CHANGED');assert.equal(observed.at(-1).colors[3],'#abcdef');
    assert.notEqual(observed[0].signature,observed.at(-1).signature);
    vm.emit('PROJECT_LOADED');vm.emit('targetsUpdate');assert.equal(observed.length,4);
    release();queued();vm.runtime.emit('PROJECT_CHANGED');vm.emit('PROJECT_LOADED');vm.emit('targetsUpdate');
    assert.equal(observed.length,4);assert.equal(vm.runtime.listeners.get('PROJECT_CHANGED').size,0);
    assert.equal(vm.listeners.get('PROJECT_LOADED').size,0);assert.equal(vm.listeners.get('targetsUpdate').size,0);
    const fresh = [], next = observeTilemapPalette(fixture().vm,p=>fresh.push(p));assert.equal(fresh[0].colors[3],'#654321');next();
});
