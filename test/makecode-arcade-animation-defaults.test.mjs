import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import SB3Creator from '../overlay/scratch-gui/src/lib/sb3-creator.js';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {compile,STATIC} from '../scripts/lib/pxt-node.mjs';

const setup='let actor=sprites.create(img`1`,SpriteKind.Player);let frames=[img`2`,img`3`];';
const commands=code=>code.split('\n').filter(line=>line.trim().startsWith('arcade animate sprite'));

test('animation defaults and stop enums match the locally pinned original source',()=>{
    const target=JSON.parse(fs.readFileSync(`${STATIC}/arcade/target.json`,'utf8'));
    const source=target.bundledpkgs.game['animation.ts'];
    assert.match(source,/function runImageAnimation\(sprite: Sprite, frames: Image\[\], frameInterval\?: number, loop\?: boolean\)/);
    assert.match(source,/new ImageAnimation\(sprite, frames, frameInterval \|\| 500, !!loop\)/);
    assert.match(source,/enum AnimationTypes\s*\{[\s\S]*?All,[\s\S]*?ImageAnimation,[\s\S]*?MovementAnimation/);
    const legacy=target.bundledpkgs.animation['legacy.ts'];
    assert.match(legacy,/function createAnimation\(action: number, interval: number\)/);
    assert.match(legacy,/function attachAnimation\(sprite: Sprite, set: Animation\)/);
    assert.match(legacy,/function setAction\(sprite: Sprite, action: number\)/);
});

test('two, three and four argument image animations become editable native blocks with real defaults',async()=>{
    const source=setup+`
animation.runImageAnimation(actor,frames)
animation.runImageAnimation(actor,frames,80)
animation.runImageAnimation(actor,frames,120,true)`;
    const result=arcadeToPseudocode(source);assert.deepEqual(result.unsupported,[]);
    const lines=commands(result.code);assert.equal(lines.length,3);
    assert.match(lines[0],/interval \(500\) loop \(\(1 < 0\)\)$/);
    assert.match(lines[1],/interval \(80\) loop \(\(1 < 0\)\)$/);
    assert.match(lines[2],/interval \(120\) loop \(\(0 < 1\)\)$/);
    const creator=new SB3Creator(),project=creator.parse(result.code);
    const blocks=project.targets.flatMap(target=>Object.values(target.blocks)).filter(block=>block.opcode==='arcade_runImageAnimation');
    assert.equal(blocks.length,3);assert.deepEqual(creator.warnings,[]);
    const decompiled=creator.decompile();assert.equal(commands(decompiled).length,3);
    const recompiled=new SB3Creator();recompiled.parse(decompiled);assert.deepEqual(recompiled.warnings,[]);
    const built=await compile('arcade',{'main.ts':source,'pxt.json':JSON.stringify({name:'bw-animation-defaults',dependencies:{device:'*'},files:['main.ts']})});
    assert.equal(built.success,true,JSON.stringify(built.diagnostics));
});

test('provided zero, undefined and negative intervals remain runtime operands',()=>{
    const result=arcadeToPseudocode(setup+`
animation.runImageAnimation(actor,frames,0)
animation.runImageAnimation(actor,frames,undefined)
animation.runImageAnimation(actor,frames,-20,false)`);
    assert.deepEqual(result.unsupported,[]);
    const lines=commands(result.code);assert.equal(lines.length,3);
    assert.match(lines[0],/interval \(0\)/);
    assert.match(lines[1],/interval \(undefined value\)/);
    const project=new SB3Creator().parse(result.code);
    const target=project.targets.find(target=>Object.values(target.blocks).filter(block=>block.opcode==='arcade_runImageAnimation').length===3);
    const animations=Object.values(target.blocks).filter(block=>block.opcode==='arcade_runImageAnimation');
    const unary=target.blocks[animations[2].inputs.INTERVAL[1]];
    assert.equal(unary.opcode,'arrays_valueUnary');
    assert.equal(unary.inputs.OP[1][1],'-');
    const numeric=target.blocks[unary.inputs.VALUE[1]];
    assert.equal(numeric.opcode,'operator_add','numeric literal retains its typed number wrapper');
    assert.equal(Number(numeric.inputs.NUM1[1][1]),0);
    assert.equal(Number(numeric.inputs.NUM2[1][1]),20);
});

test('supplied interval and loop procedures are lowered once in argument order',()=>{
    const result=arcadeToPseudocode(setup+`
let calls=0
function interval(){calls+=1;return 25;}
function loop(){calls+=1;return false;}
animation.runImageAnimation(actor,frames,interval(),loop())`);
    assert.deepEqual(result.unsupported,[]);
    const line=commands(result.code)[0];
    assert.equal((line.match(/arcade call function "interval"/g)||[]).length,1);
    assert.equal((line.match(/arcade call function "loop"/g)||[]).length,1);
    assert.ok(line.indexOf('"interval"')<line.indexOf('"loop"'));
});

test('the actual stop enum names become numeric block selectors; undeclared names stay diagnostics',()=>{
    const result=arcadeToPseudocode(setup+`
animation.stopAnimation(animation.AnimationTypes.All,actor)
animation.stopAnimation(animation.AnimationTypes.ImageAnimation,actor)
animation.stopAnimation(animation.AnimationTypes.MovementAnimation,actor)`);
    assert.deepEqual(result.unsupported,[]);
    assert.match(result.code,/arcade stop animations of \(actor\) type \(0\)/);
    assert.match(result.code,/arcade stop animations of \(actor\) type \(1\)/);
    assert.match(result.code,/arcade stop animations of \(actor\) type \(2\)/);
    for(const name of ['Image','Movement','Unknown']){
        const invalid=arcadeToPseudocode(setup+`animation.stopAnimation(animation.AnimationTypes.${name},actor)`);
        assert.ok(invalid.unsupported.some(gap=>gap.includes(`${name} is not a declared`)));
        assert.doesNotMatch(invalid.code,/arcade stop animations of/);
    }
});

test('unsupported movement and malformed required arguments remain named diagnostics',()=>{
    for(const [call,name] of [
        ['animation.runMovementAnimation(actor,"L 1 1")','runMovementAnimation'],
        ['animation.runImageAnimation(actor)','runImageAnimation'],
        ['animation.runImageAnimation(actor,frames,10,false,123)','runImageAnimation'],
        ['let a=animation.createAnimation(1)','createAnimation'],
        ['animation.attachAnimation(actor)','attachAnimation'],
        ['animation.setAction(actor)','setAction'],
        ['animation.stopAnimation(actor)','stopAnimation']
    ]) {
        const result=arcadeToPseudocode(setup+call);
        assert.ok(result.unsupported.some(gap=>gap.includes(name)),call);
    }
});
