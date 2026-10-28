import test from 'node:test';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {runProgram,stepFrames,clearStrayTimers} from './helpers/bw-vm.mjs';
import {runPxtArcade} from './helpers/pxt-arcade-runtime.mjs';
const originalSource=fs.readFileSync(new URL('../overlay/scratch-vm/src/extensions/crispstrobe/arcade/sprite-data-source/main.ts',import.meta.url),'utf8');
import assert from 'node:assert/strict';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
const setup='let actor=sprites.create(img`1`,SpriteKind.Player);';

test('exact nine Sprite Data APIs lower to typed native records and preserve value evaluation order',()=>{
    const source=setup+`
let other=sprites.create(img\`2\`,SpriteKind.Enemy)
sprites.setDataNumber(actor,"count",3)
sprites.changeDataNumberBy(actor,"count",2)
sprites.setDataString(actor,"name","actor")
sprites.setDataBoolean(actor,"ready",true)
sprites.setDataSprite(actor,"other",other)
let count=sprites.readDataNumber(actor,"count")
let name=sprites.readDataString(actor,"name")
let ready=sprites.readDataBoolean(actor,"ready")
let stored=sprites.readDataSprite(actor,"other")
let aliases=[stored]
let x=aliases[0].x
function forward(value:Sprite){return sprites.readDataSprite(value,"other")}
let y=forward(actor).y
function owner(){return actor}
function key(){return "count"}
function value(){return 5}
sprites.setDataNumber(owner(),key(),value())`;
    const result=arcadeToPseudocode(source);assert.deepEqual(result.unsupported,[]);
    for(const type of ['Number','String','Boolean','Sprite']) {
        assert.match(result.code,new RegExp(`arcade set sprite \\(actor\\) data .+ type ${type} to`));
        if(type==='Boolean')assert.match(result.code,/arcade sprite \(actor\) boolean data/);
        else assert.match(result.code,new RegExp(`arcade sprite \\(actor\\) data .+ type ${type}`));
    }
    assert.match(result.code,/arcade change sprite \(actor\) number data \("count"\) by \(\(0 \+ \(2\)\)\)/);
    assert.match(result.code,/arcade property x of/);
    assert.match(result.code,/arcade property y of/);
    const line=result.code.split('\n').find(line=>line.includes('arcade set sprite') && line.includes('"owner"'));
    for(const name of ['owner','key','value'])assert.equal((line.match(new RegExp(`arcade call function "${name}"`,'g'))||[]).length,1);
    assert.ok(line.indexOf('"owner"')<line.indexOf('"key"'));assert.ok(line.indexOf('"key"')<line.indexOf('"value"'));
});

test('null guards and empty keys reach original helper semantics without invented default values',()=>{
    const result=arcadeToPseudocode('let none:Sprite=null;let missing=sprites.readDataNumber(none,"x");let keyMissing=sprites.readDataString(none,"");let flag=sprites.readDataBoolean(none,"x");sprites.setDataSprite(none,"x",none)');
    assert.deepEqual(result.unsupported,[]);assert.match(result.code,/arcade sprite \(none\) data \("x"\) type Number/);
});

test('unknown Sprite Data helpers, arities and arbitrary data object accesses remain explicit gaps',()=>{
    for(const source of [setup+'sprites.setDataImage(actor,"x",img`1`)',setup+'let v=sprites.readDataImage(actor,"x")',setup+'sprites.changeDataNumber(actor,"x",1)',setup+'sprites.setDataNumber(actor,"x")',setup+'let n=sprites.readDataNumber(actor)',setup+'let n=actor.data.n',setup+'actor.data.n=2'])assert.ok(arcadeToPseudocode(source).unsupported.length,source);
});


const fixture=setup+`
let other=sprites.create(img\`2\`,SpriteKind.Enemy)
other.x=25
sprites.setDataNumber(actor,"count",3)
sprites.changeDataNumberBy(actor,"count",2)
sprites.setDataString(actor,"label","actor")
sprites.setDataBoolean(actor,"ready",true)
sprites.setDataSprite(actor,"friend",other)
let count=sprites.readDataNumber(actor,"count")
let label=sprites.readDataString(actor,"label")
let ready=sprites.readDataBoolean(actor,"ready")
let missing=sprites.readDataNumber(actor,"missing")
let missingText=sprites.readDataString(actor,"missing")
let missingFlag=sprites.readDataBoolean(actor,"missing")
let guarded=sprites.readDataNumber(null,"count")
let emptyKey=sprites.readDataString(actor,"")
let friend=sprites.readDataSprite(actor,"friend")
let aliases=[friend]
aliases[0].x+=3
let friendX=other.x
sprites.setDataString(actor,"zero","")
sprites.changeDataNumberBy(actor,"zero",4)
let replaced=sprites.readDataNumber(actor,"zero")
function readFriend(value:Sprite){return sprites.readDataSprite(value,"friend")}
let forwardedX=readFriend(actor).x
let done=1
done+=0`;
const samples=['count','label','ready','missing','missingText','missingFlag','guarded','emptyKey','friendX','replaced','forwardedX','done'];
const originals=main=>({'main.ts':main,'sprite-data.ts':originalSource,'pxt.json':JSON.stringify({dependencies:{device:'*'},files:['sprite-data.ts','main.ts']})});
const values=run=>Object.fromEntries(run.vm.runtime.targets.flatMap(t=>Object.values(t.variables)).map(v=>[v.name.replace(/^Game_/,''),v.value?.bwUndefined===true?undefined:v.value]));
test('Sprite Data generated algorithms retain all exact original functions',()=>{
    execFileSync(process.execPath,['scripts/generate-arcade-sprite-data.mjs','--check'],{stdio:'pipe'});
});
test('Sprite Data original helpers match native aliases, undefined values, booleans and editable roundtrips',async()=>{
    const original=await runPxtArcade(originals(fixture));
    assert.equal(original.count,5);assert.equal(original.friendX,28);assert.equal(original.missing,undefined);assert.equal(original.missingText,undefined);assert.equal(original.ready,true);assert.equal(original.missingFlag,false);
    const imported=arcadeToPseudocode(fixture);assert.deepEqual(imported.unsupported,[]);
    try{
        const check=run=>{assert.deepEqual(run.errors,[]);assert.deepEqual(run.creator.warnings,[]);const actual=values(run);for(const name of samples)assert.equal(actual[name],original[name],name);};
        const run=await runProgram(imported.code,{frames:100,storage:true,uploads:imported.costumes});check(run);
        const blocks=run.creator.project.targets.flatMap(t=>Object.values(t.blocks));assert.ok(blocks.some(b=>b.opcode==='arcade_spriteDataReadBoolean'),'Boolean reads use a boolean opcode');
        check(await runProgram(run.creator.decompile(),{frames:100,storage:true,uploads:imported.costumes}));
        const exported=projectToArcade(run.creator.project,{costumeSvg:(t,c)=>run.creator.assets.get(c.assetId)?.data});assert.deepEqual(exported.unsupported,[]);
        assert.equal(JSON.parse(exported.files['pxt.json']).dependencies['arcade-sprite-data'],'github:microsoft/arcade-sprite-data#332026d12c46286c7afe59bc4829ccf08471d5b1');
        // Execute the unchanged original helper as a local supplemental source;
        // this avoids network acquisition and keeps exported main bytes intact.
        const pxt=await runPxtArcade(originals(exported.ts));for(const name of samples)assert.equal(pxt[name]??pxt['Game_'+name],original[name],name+' exported');
        const again=arcadeToPseudocode(exported.ts);assert.deepEqual(again.unsupported,[]);check(await runProgram(again.code,{frames:100,storage:true,uploads:again.costumes}));
        await run.vm.loadProject(Buffer.from(await(await run.vm.saveProjectSb3()).arrayBuffer()));run.vm.greenFlag();await stepFrames(run.vm,100);check(run);
    }finally{clearStrayTimers();}
});

const mapKeys=['__proto__','prototype','constructor','toString','hasOwnProperty','valueOf'];
const keyMain=setup+'let other=sprites.create(img`2`,SpriteKind.Enemy);other.x=17;\nfunction inheritedKey(prefix:string){return prefix+"OwnProperty"}\nlet inheritedName=inheritedKey("has");\n'+mapKeys.map((key,i)=>{const expression=key==='hasOwnProperty'?'inheritedName':JSON.stringify(key);return `
let missingNumber${i}=sprites.readDataNumber(actor,${expression})
let missingText${i}=sprites.readDataString(actor,${expression})
let missingBoolean${i}=sprites.readDataBoolean(actor,${expression})
sprites.setDataNumber(actor,${expression},${i+1})
sprites.changeDataNumberBy(actor,${expression},3)
let number${i}=sprites.readDataNumber(actor,${expression})
sprites.setDataString(actor,${expression},"value-${i}")
let text${i}=sprites.readDataString(actor,${expression})
sprites.setDataBoolean(actor,${expression},true)
let flag${i}=sprites.readDataBoolean(actor,${expression})`;}).join('\n')+`
sprites.setDataSprite(actor,"__proto__",other)
sprites.setDataSprite(actor,"constructor",other)
let friend=sprites.readDataSprite(actor,"__proto__")
friend.x+=2
let constructorFriend=sprites.readDataSprite(actor,"constructor")
let aliasedX=constructorFriend.x
let done=1
done+=0`;
const keySamples=mapKeys.flatMap((_,i)=>['missingNumber','missingText','missingBoolean','number','text','flag'].map(name=>name+i)).concat(['aliasedX','done']);

test('original PXT own-key Sprite Data maps match native prototype-name reads and writes through editable roundtrips',async()=>{
    try{
        const original=await runPxtArcade(originals(keyMain));
        for(const [i] of mapKeys.entries()){
            assert.equal(original['missingNumber'+i],undefined);
            assert.equal(original['missingText'+i],undefined);
            assert.equal(original['missingBoolean'+i],false);
            assert.equal(original['number'+i],i+4);
            assert.equal(original['text'+i],'value-'+i);
            assert.equal(original['flag'+i],true);
        }
        assert.equal(original.aliasedX,19);
        const imported=arcadeToPseudocode(keyMain);assert.deepEqual(imported.unsupported,[]);
        const check=run=>{assert.deepEqual(run.errors,[]);assert.deepEqual(run.creator.warnings,[]);const actual=values(run);for(const name of keySamples)assert.equal(actual[name],original[name],name);};
        const run=await runProgram(imported.code,{frames:100,storage:true,uploads:imported.costumes});check(run);
        check(await runProgram(run.creator.decompile(),{frames:100,storage:true,uploads:imported.costumes}));
        const exported=projectToArcade(run.creator.project,{costumeSvg:(t,c)=>run.creator.assets.get(c.assetId)?.data});assert.deepEqual(exported.unsupported,[]);
        const pxt=await runPxtArcade(originals(exported.ts));for(const name of keySamples)assert.equal(pxt[name]??pxt['Game_'+name],original[name],name+' exported');
        const again=arcadeToPseudocode(exported.ts);assert.deepEqual(again.unsupported,[]);check(await runProgram(again.code,{frames:100,storage:true,uploads:again.costumes}));
        const saved=Buffer.from(await(await run.vm.saveProjectSb3()).arrayBuffer());await run.vm.loadProject(saved);run.vm.greenFlag();await stepFrames(run.vm,100);check(run);
        const fresh=await runProgram('SPRITE Placeholder:\nWHEN flag clicked:\n  hide',{frames:0,storage:true});await fresh.vm.loadProject(saved);fresh.vm.greenFlag();await stepFrames(fresh.vm,100);check(fresh);
    }finally{clearStrayTimers();}
});
