import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import BWValues from '../overlay/scratch-vm/src/util/bw-values.js';
import {runPxtCore} from './helpers/pxt-core-runtime.mjs';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
// Task E1 keeps the import half of these round trips; the export half (projectToArcade, then compiling or running the exported TypeScript in PXT, then re-importing it) returns with task E2 (docs/OPEN-TASKS-2026-09-29.md).
import {runProgram,stepFrames} from './helpers/bw-vm.mjs';
import {loadExtensionClass} from './helpers/bw-extensions.mjs';
const vars=run=>Object.fromEntries(run.vm.runtime.targets.flatMap(t=>Object.values(t.variables)).map(v=>[v.name.replace(/^Game_/,''),v.value]));

test('image values match executed PXT operators and retain identity through arrays and procedures',async()=>{
    const source=`let picture=image.create(2,1)
picture.fill(5)
let cloned=picture.clone()
let first:any=picture
let copy:any=cloned
function echo(value:Image){return value}
let alias:Image=echo(picture)
let refs:any[]=[first,copy]
let joined=first+2
let text=first+""
let sum=first+copy
let product=first*2
let difference=first-2
let divided=first/2
let remainder=first%2
let numeric=+first
let negated=-first
let same=first===alias
let different=first!==copy
let loose=first==0
let objectText=first=="[object Object]"
let textCollision=first==="arcade-image:1"
let ordered=first<=copy
let mixed=first===refs
let index=refs.indexOf(alias)
let wrong=refs.indexOf("arcade-image:1")
alias.setPixel(0,0,7)
let changed=picture.getPixel(0,0)
let untouched=cloned.getPixel(0,0)`;
    const expected=await runPxtCore(source,{images:true});
    const names=['joined','text','sum','product','difference','divided','remainder','numeric','negated','same','different','loose','objectText','textCollision','ordered','mixed','index','wrong','changed','untouched'];
    const check=run=>{
        const actual=vars(run);
        for(const name of names)assert.deepEqual(actual[name],expected[name],name);
        assert.equal(actual.first,actual.alias);assert.notEqual(actual.first,actual.copy);
        assert.deepEqual(run.errors,[]);assert.deepEqual(run.creator.warnings,[]);
    };
    const execute=async imported=>{
        assert.deepEqual(imported.unsupported,[]);
        const run=await runProgram(imported.code,{frames:80,uploads:imported.costumes,storage:true});check(run);return run;
    };
    const imported=arcadeToPseudocode(source),run=await execute(imported);
    await execute({...imported,code:run.creator.decompile()});
    await run.vm.loadProject(Buffer.from(await(await run.vm.saveProjectSb3()).arrayBuffer()));run.vm.greenFlag();await stepFrames(run.vm,80);check(run);
});

test('image lookups reject ordinary ID text, foreign scopes and wrong resource kinds',()=>{
    const Arcade=loadExtensionClass('arcade'),a=new EventEmitter(),b=new EventEmitter();
    const first=new Arcade(a),other=new Arcade(b),image=first.createImage({WIDTH:2,HEIGHT:1}),foreign=other.createImage({WIDTH:2,HEIGHT:1});
    assert.ok(BWValues.isReference(image));assert.equal(image.bwReference.kind,'image');
    assert.equal(String(image),'[object Object]');
    first.mutateImage({IMAGE:image,OP:'fill',COLOR:7});
    assert.equal(first.imagePixel({IMAGE:JSON.parse(JSON.stringify(image)),X:0,Y:0}),7);
    for(const invalid of [image.bwReference.id,foreign,BWValues.reference(a,'array',image.bwReference.id)]){
        first.mutateImage({IMAGE:invalid,OP:'fill',COLOR:2});assert.equal(first.cloneImage({IMAGE:invalid}),'');
    }
    assert.equal(first.imagePixel({IMAGE:image,X:0,Y:0}),7);
    a.emit('PROJECT_START');assert.equal(first.cloneImage({IMAGE:image}),'');
});
