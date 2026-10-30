import test from 'node:test';
import assert from 'node:assert/strict';
import {parseMakeCodeTs} from '../overlay/scratch-gui/src/lib/bw-makecode/ts-import.js';
import {analyseSourceValueProducers} from '../overlay/scratch-gui/src/lib/bw-makecode/source-value-producers.js';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import SB3Creator from '../overlay/scratch-gui/src/lib/sb3-creator.js';
import {runPxtArcade} from './helpers/pxt-arcade-runtime.mjs';

// Claim lanes/2026-10-27-arcade-controller-retention.md: the canonical SDK
// controller.moveSprite call retains a Sprite without breaking its numeric
// property invariant. Other controller shapes stay unknown escapes.
const factory='sprites.create(img`1`, SpriteKind.Player)';
function nodes(value,out=[]){
    if(!value||typeof value!=='object')return out;
    if(Array.isArray(value)){for(const item of value)nodes(item,out);return out;}
    out.push(value);
    for(const [key,item]of Object.entries(value))if(!['originalBody','parameterDefaults','paramTypes','returnType'].includes(key))nodes(item,out);
    return out;
}
const typesOfRead=source=>{
    const program=parseMakeCodeTs(source,{retainParentheses:true});
    const read=nodes(program).findLast(node=>node.type==='Member'&&node.name==='x'&&node.object?.name==='shot');
    assert.ok(read,source);
    return [...analyseSourceValueProducers(program,{ordinaryPrimitiveSdkNumbers:true}).typesAt(read)];
};
const isNumber=source=>assert.deepEqual(typesOfRead(source),['Number'],source);
const notNumber=source=>assert.notDeepEqual(typesOfRead(source),['Number'],source);

test('canonical controller.moveSprite keeps the Sprite numeric invariant for every supported arity',()=>{
    for(const call of ['controller.moveSprite(shot)','controller.moveSprite(shot, 100)','controller.moveSprite(shot, 100, 80)'])
        isNumber(`let shot=${factory};${call};let result=shot.x`);
});

test('other controller shapes and unproved speeds remain unknown escapes',()=>{
    for(const call of [
        'controller.moveSprite(shot, foreign())',
        'controller.moveSprite(shot, 1, 2, 3)',
        'controller.player2.moveSprite(shot, 100, 100)',
        'controller.stopControllingSprite(shot)',
        'foreign.moveSprite(shot)',
        'controller.moveSprite(foreign(), shot)'
    ])notNumber(`let shot=${factory};${call};let result=shot.x`);
    notNumber(`let controller:any={moveSprite:function(s:any){}};let shot=${factory};controller.moveSprite(shot);let result=shot.x`);
});

test('a controlled Sprite exports and runs like the original program',async()=>{
    const source=`let shot = sprites.create(img\`1\`, SpriteKind.Player)
shot.setPosition(20, 30)
controller.moveSprite(shot, 100, 80)
let values = [1, 2]
let result = shot.x + 1
values.push(result)
let count = values.length`;
    const imported=arcadeToPseudocode(source);assert.deepEqual(imported.unsupported,[]);
    const creator=new SB3Creator();creator.parse(imported.code);
    for(const costume of imported.costumes)creator.applyCustomSVG(costume.sprite,costume.svg);
    const out=projectToArcade(creator.project,{costumeSvg:(t,c)=>{const a=creator.assets.get(c.assetId);return a?.type==='svg'?a.data:null;}});
    assert.deepEqual(out.unsupported,[]);
    const original=await runPxtArcade(source),roundtrip=await runPxtArcade(out.files);
    const value=(r,k)=>r[k]??r['Game_'+k];
    for(const name of ['result','count']){assert.notEqual(value(original,name),undefined,name);assert.equal(value(roundtrip,name),value(original,name),name);}
});
