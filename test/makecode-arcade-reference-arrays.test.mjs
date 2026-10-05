import test from 'node:test';
import assert from 'node:assert/strict';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {runProgram,stepFrames} from './helpers/bw-vm.mjs';
// Task E1 keeps the import half of these round trips; the export half (projectToArcade, then compiling or running the exported TypeScript in PXT, then re-importing it) returns with task E2 (docs/OPEN-TASKS-2026-09-29.md).
const vars=run=>Object.fromEntries(run.vm.runtime.targets.flatMap(t=>Object.values(t.variables)).map(v=>[v.name.replace(/^Game_/,''),v.value]));
async function execute(imported){
    assert.deepEqual(imported.unsupported,[]);
    const run=await runProgram(imported.code,{frames:60,uploads:imported.costumes,storage:true});
    assert.deepEqual(run.errors,[]);assert.deepEqual(run.creator.warnings,[]);return run;
}
async function roundtrip(source,check){
    const imported=arcadeToPseudocode(source),run=await execute(imported);await check(run);
    await check(await execute({...imported,code:run.creator.decompile()}));
    await run.vm.loadProject(Buffer.from(await(await run.vm.saveProjectSb3()).arrayBuffer()));run.vm.greenFlag();await stepFrames(run.vm,60);await check(run);
}
test('Image arrays share aliases and element resources through indexing, assignment and mutation',async()=>{
    await roundtrip(`let pictures=[img\`2 .\n. 5\`,img\`7 7\n7 7\`]
let alias=pictures
let first=sprites.create(pictures[0],SpriteKind.Player)
let second=sprites.create(pictures[1],SpriteKind.Food)
alias[0].fill(3)
alias[1]=pictures[0]
let third=sprites.create(alias[1],SpriteKind.Enemy)
let sample=pictures[1].getPixel(0,0)
let arrayCount=alias.length`,run=>{
        const [a,b,c]=Object.values(run.vm.runtime.bwArcadeDeviceState.sprites);
        assert.equal(a.image,c.image);assert.notEqual(a.image,b.image);
        assert.deepEqual([...a.image.pixels],[3,3,3,3]);assert.deepEqual([...b.image.pixels],[7,7,7,7]);
        assert.equal(vars(run).pictures,vars(run).alias);assert.equal(Number(vars(run).sample),3);assert.equal(Number(vars(run).arrayCount),2);
    });
});
test('Sprite arrays preserve reference identity through procedure parameters, returns and for-of mutation',async()=>{
    await roundtrip(`function makeActors(){return [sprites.create(img\`2\`,SpriteKind.Player),sprites.create(img\`7\`,SpriteKind.Food)]}
function steer(actors:Sprite[]){for(let actor of actors){actor.x+=10};return actors}
let actors=makeActors()
let alias=steer(actors)
let third=sprites.create(img\`5\`,SpriteKind.Enemy)
alias.push(third)
let removed=actors.removeAt(1)
removed.setPosition(30,40)
alias[0].setImage(img\`5\`)
let popped=alias.pop()
popped.x=120
let arrayCount=actors.length
let located=actors.indexOf(actors[0])`,run=>{
        const [a,b,c]=Object.values(run.vm.runtime.bwArcadeDeviceState.sprites);
        assert.equal(a.x,89.5);assert.equal(a.image.pixels[0],5);assert.equal(b.x,30);assert.equal(b.y,40);assert.equal(c.x,120);
        assert.equal(vars(run).actors,vars(run).alias);assert.equal(Number(vars(run).arrayCount),1);assert.equal(Number(vars(run).located),0);
    });
});
test('empty typed arrays infer pushed sprites and clearing changes every alias',async()=>{
    await roundtrip(`let actors:Sprite[]=[]
let alias=actors
let hero=sprites.create(img\`7\`,SpriteKind.Player)
actors.push(hero)
alias[0].setPosition(25,35)
let old=alias.shift()
actors.push(old)
actors.length=0
let count=alias.length`,run=>{
        const [hero]=Object.values(run.vm.runtime.bwArcadeDeviceState.sprites);assert.equal(hero.x,25);assert.equal(hero.y,35);
        assert.equal(vars(run).actors,vars(run).alias);assert.equal(Number(vars(run).count),0);
    });
});
test('empty removals and missing array slots preserve undefined through variables and procedures',async()=>{
    await roundtrip(`let images:Image[]=[]
let empty=images.pop()
let missing=images[9]
let result=0
if(empty===undefined){result+=1}
if(missing==null){result+=2}
if(empty!==null){result+=4}
if(empty){result+=100}
function echo(value:any){return value}
let returned=echo(empty)
if(returned===undefined){result+=8}
let rows:any[]=[images]
rows.push(returned)
let stored=rows[1]
if(stored===undefined){result+=16}
images[3]=undefined
if(images[3]===undefined){result+=32}
function maybe(value:number){if(value>0){return images}}
let fallthrough=maybe(0)
if(fallthrough===undefined){result+=64}`,run=>{
        assert.equal(Number(vars(run).result),127);
        assert.deepEqual(vars(run).empty,{bwUndefined:true});
    });
});
test('nested for-of loops keep independent indexes across Code, SB3 and MakeCode',async()=>{
    await roundtrip(`let actors=[sprites.create(img\`2\`,SpriteKind.Player),sprites.create(img\`7\`,SpriteKind.Food)]
let pictures=[img\`3\`,img\`5\`]
for(let actor of actors){for(let picture of pictures){actor.x+=picture.getPixel(0,0)}}`,run=>{
        assert.deepEqual(Object.values(run.vm.runtime.bwArcadeDeviceState.sprites).map(s=>s.x),[87.5,87.5]);
    });
});
test('random array selection evaluates a procedure argument exactly once',async()=>{
    await roundtrip(`let evaluations=0
let pictures=[img\`3\`]
function getPictures(){evaluations+=1;return pictures}
let picture=Math.pickRandom(getPictures())
let actor=sprites.create(picture,SpriteKind.Player)`,run=>{
        assert.equal(Number(vars(run).evaluations),1);
        assert.deepEqual([...Object.values(run.vm.runtime.bwArcadeDeviceState.sprites)[0].image.pixels],[3]);
    });
});
test('insertion, reversal and removal mutate the shared sprite array in order',async()=>{
    await roundtrip(`let first=sprites.create(img\`2\`,SpriteKind.Player)
let second=sprites.create(img\`7\`,SpriteKind.Food)
let third=sprites.create(img\`5\`,SpriteKind.Enemy)
let actors=[first,second]
let alias=actors
alias.unshift(third)
actors.insertAt(1,second)
alias.reverse()
actors.removeElement(second)
alias.set(0,third)
let removed=actors.removeAt(2)
removed.x=99
let popped=alias.pop()
popped.y=44
let shifted=actors.shift()
shifted.x=101
actors.push(first)
let count=alias.length
let same=alias.indexOf(first)`,run=>{
        const [a,b,c]=Object.values(run.vm.runtime.bwArcadeDeviceState.sprites);
        assert.equal(a.x,79.5);assert.equal(b.y,44);assert.equal(c.x,101);
        assert.equal(vars(run).actors,vars(run).alias);assert.equal(Number(vars(run).count),1);assert.equal(Number(vars(run).same),0);
    });
});
test('removeElement reports whether it removed a sprite and removes only its first occurrence',async()=>{
    await roundtrip(`let actor=sprites.create(img\`2\`,SpriteKind.Player)
let actors=[actor,actor]
let removed=actors.removeElement(actor)
let remaining=actors.length
let again=actors.removeElement(actor)
let absent=actors.removeElement(actor)`,run=>{
        // The pinned PXT Array_.removeElement shim reports numeric flags.
        assert.equal(vars(run).removed,1);assert.equal(Number(vars(run).remaining),1);
        assert.equal(vars(run).again,1);assert.equal(vars(run).absent,0);
    });
});
test('numeric array elements retain their type across literal, variable and calculated values',async()=>{
    await roundtrip(`let actor=sprites.create(img\`2\`,SpriteKind.Player)
let n=1
let numbers=[1,2]
let texts=["1","2"]
let literalIndex=numbers.indexOf(1)
let calculatedIndex=numbers.indexOf(1+0)
let variableIndex=numbers.indexOf(n)
numbers.push(n)
let removed=numbers.removeElement(n)
let found=numbers.indexOf(1)
let skipped=numbers.indexOf(1,2)
let last=numbers.indexOf(1,-1)
let textIndex=texts.indexOf("1")
let wrongType=texts.indexOf(1+0)
let value=numbers[1]`,run=>{
        const values=vars(run);
        for(const key of ['literalIndex','calculatedIndex','variableIndex','textIndex'])assert.equal(Number(values[key]),0,key);
        assert.equal(values.removed,1);assert.equal(Number(values.found),1);assert.equal(Number(values.wrongType),-1);
        assert.equal(Number(values.skipped),-1);assert.equal(Number(values.last),1);
        assert.equal(values.value,1);assert.equal(typeof values.value,'number');
    });
});
test('nested Sprite arrays retain row aliases through procedures, iteration and removal',async()=>{
    await roundtrip(`function makeRows(){return [[sprites.create(img\`2\`,SpriteKind.Player),sprites.create(img\`7\`,SpriteKind.Food)],[sprites.create(img\`5\`,SpriteKind.Enemy)]]}
function steerRows(rows:Sprite[][]){for(let row of rows){for(let actor of row){actor.x+=5}};return rows}
let rows=makeRows()
let alias=steerRows(rows)
let firstRow=rows[0]
let removedRow=alias.pop()
firstRow.push(removedRow[0])
let mirrors=[firstRow,firstRow]
mirrors[1][0].x=55
removedRow[0].x=123
let count=rows[0].length`,run=>{
        const [a,b,c]=Object.values(run.vm.runtime.bwArcadeDeviceState.sprites);
        assert.equal(a.x,55);assert.equal(b.x,84.5);assert.equal(c.x,123);
        assert.equal(vars(run).rows,vars(run).alias);assert.equal(Number(vars(run).count),3);
    });
});
test('three-dimensional Image arrays preserve replacement, shared images and detached rows',async()=>{
    await roundtrip(`let picture=img\`2\`
let cube=[[[picture]]]
let layer=cube[0]
let row=layer[0]
row[0].fill(7)
let first=sprites.create(cube[0][0][0],SpriteKind.Player)
cube[0][0][0]=img\`5\`
let second=sprites.create(row[0],SpriteKind.Food)
let detached=layer.pop()
detached[0].setPixel(0,0,3)
let count=cube[0].length`,run=>{
        const [a,b]=Object.values(run.vm.runtime.bwArcadeDeviceState.sprites);
        assert.equal(a.image.pixels[0],7);assert.equal(b.image.pixels[0],3);assert.notEqual(a.image,b.image);
        assert.equal(vars(run).row,vars(run).detached);assert.equal(Number(vars(run).count),0);
    });
});
test('empty nested arrays infer Image rows passed through a procedure',async()=>{
    await roundtrip(`function appendPicture(rows:Image[][],picture:Image){let row:Image[]=[];row.push(picture);rows.push(row);return row}
let rows:Image[][]=[]
let row=appendPicture(rows,img\`7\`)
let actor=sprites.create(rows[0][0],SpriteKind.Player)
row[0].fill(3)`,run=>{
        const [actor]=Object.values(run.vm.runtime.bwArcadeDeviceState.sprites);assert.equal(actor.image.pixels[0],3);
    });
});
test('self-containing arrays remain finite type graphs and retain their runtime reference',async()=>{
    await roundtrip(`let actor=sprites.create(img\`2\`,SpriteKind.Player)
let values:any[]=[]
values.push(values)
let alias=values[0]
let found=alias.indexOf(values)
let count=alias.length`,run=>{
        assert.equal(vars(run).values,vars(run).alias);assert.equal(Number(vars(run).found),0);assert.equal(Number(vars(run).count),1);
    });
});
test('array item conditions use JavaScript truthiness, including missing rows and boolean literals',async()=>{
    await roundtrip(`let actor=sprites.create(img\`2\`,SpriteKind.Player)
let numbers=[0,1]
let texts=["","0","false"]
let flags=[false,true]
let rows:any[][]=[]
let result=0
if(!numbers[0]){result+=1}
if(numbers[1]){result+=2}
if(!texts[0]){result+=4}
if(texts[1]){result+=8}
if(texts[2]){result+=16}
if(!flags[0]){result+=32}
if(flags[1]){result+=64}
if(!rows[0]){rows[0]=[]}
if(rows[0]){result+=128}
if(!numbers[99]){result+=256}`,run=>{
        assert.equal(Number(vars(run).result),511);
    });
});

test('compound if and loop conditions skip reads and side effects, including procedure locals',async()=>{
    await roundtrip(`let calls=0
function touch(){calls+=1;return 1}
let matrix:Image[][]=[[]]
let points=0
if(false && matrix[99][0]){points+=100}
if(true || touch()){points+=1}
if(!(false && touch())){points+=2}
function count(){let i=0;while(i<3 && touch()){i++;};return i}
let total=count()
for(let j=0;j<2 && touch();j++){points+=4}
if(false || touch()){points+=8}`,async run=>{
        const deadline=Date.now()+3000;
        while(Number(vars(run).calls)!==6 && Date.now()<deadline){await stepFrames(run.vm,5);await new Promise(done=>setTimeout(done,10));}
        assert.equal(Number(vars(run).calls),6,JSON.stringify({vars:vars(run),threads:run.vm.runtime.threads.map(t=>({status:t.status,stack:t.stack.map(id=>t.target.blocks.getBlock(id)?.opcode),params:t.stackFrames.map(f=>f.params)}))}));assert.equal(Number(vars(run).total),3);assert.equal(Number(vars(run).points),19);
    });
});

test('SB3 preserves missing values without confusing them with ordinary strings',async()=>{
    const imported=arcadeToPseudocode(`let pictures:Image[]=[]
let missing=pictures.pop()
let nothing=null
let text="undefined"
let result=0
if(missing===undefined){result+=1}
if(nothing===null){result+=2}
if(text!==undefined){result+=4}
function maybe(flag:number){if(flag>0){return};return pictures}
let bare=maybe(1)
if(bare===undefined){result+=8}`);
    const run=await execute(imported);assert.equal(Number(vars(run).result),15);
    const buffer=Buffer.from(await(await run.vm.saveProjectSb3()).arrayBuffer());
    await run.vm.loadProject(buffer);
    assert.equal(vars(run).nothing,null);assert.equal(vars(run).text,'undefined');
    assert.deepEqual(vars(run).missing,{bwUndefined:true});assert.deepEqual(vars(run).bare,{bwUndefined:true});
});
