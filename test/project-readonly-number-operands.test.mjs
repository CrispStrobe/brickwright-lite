import test from 'node:test';
import assert from 'node:assert/strict';
import Creator from '../overlay/scratch-gui/src/lib/sb3-creator.js';
import {HELPERS} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-runtime.js';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade,projectJsonToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {createProjectJsonSnapshot} from '../overlay/scratch-gui/src/lib/bw-makecode/project-json-snapshot.js';
import {createProjectMathNormalResults} from '../overlay/scratch-gui/src/lib/bw-makecode/project-math-normal-results.js';
import {createProjectReadonlyNumberOperands} from '../overlay/scratch-gui/src/lib/bw-makecode/project-readonly-number-operands.js';
import {startupNumberPrefix as prefix,startupNumberProcedure as procedure,startupNumberConsume as consume,startupNumberSource as source} from './fixtures/arcade-startup-number-game.mjs';

// Real importer/Creator and immutable JSON; no VM, original SDK or browser.
const clean=result=>{for(const key of ['unsupported','errors','warnings','unparsed'])if(Object.hasOwn(result,key))assert.deepEqual(result[key],[],key);};
const create=source=>{const imported=arcadeToPseudocode(source);clean(imported);const c=new Creator();c.parse(imported.code);clean(c);return c;};
const query=project=>{const p=createProjectJsonSnapshot(JSON.stringify(project)),t=p.targets.find(t=>Object.values(t.blocks).some(n=>n.opcode==='arcade_mathBinary')),math=Object.values(t.blocks).filter(n=>n.opcode==='arcade_mathBinary');assert.ok(math.length);return {p,t,math,proof:createProjectMathNormalResults(p),operands:createProjectReadonlyNumberOperands(p)};};
const positive=q=>{for(const node of q.math)assert.equal(q.proof.isNumberResult(q.t,node),true);};
const negative=q=>{for(const node of q.math)assert.equal(q.proof.isNumberResult(q.t,node),false);};
const writers=(project,name)=>project.targets.flatMap(target=>Object.values(target.blocks).filter(n=>n.opcode==='data_setvariableto'&&n.fields?.VARIABLE?.[0]===name).map(node=>({target,node})));
const clone=project=>JSON.parse(JSON.stringify(project));
const renameCell=(project,oldName,newName)=>{
    const matches=project.targets.flatMap(target=>Object.entries(target.variables||{}).filter(([,row])=>row[0]===oldName).map(([id,row])=>({target,id,row})));assert.equal(matches.length,1);
    const cell=matches[0];cell.row[0]=newName;
    for(const target of project.targets)for(const node of Object.values(target.blocks)){
        if(node.fields?.VARIABLE?.[1]===cell.id)node.fields.VARIABLE[0]=newName;
        for(const slot of Object.values(node.inputs||{}))for(const value of slot.slice(1))if(Array.isArray(value)&&value[0]===12&&value[2]===cell.id)value[1]=newName;
    }
    for(const monitor of project.monitors||[])if(monitor.id===cell.id)monitor.params.VARIABLE=newName;
    return cell;
};

test('actual readonly startup dependencies supply only the selected Number arithmetic result',()=>{
    for(const paint of [false,true])for(const unrelated of ['', 'let unrelated=[3,5];']){
        const c=create(source(paint)+unrelated),q=query(c.project);positive(q);
        const selected=Object.values(q.t.blocks).filter(n=>n.opcode==='arrays_valueBinary'&&n.fields?.OP?.[0]==='-');assert.ok(selected.length>=2);
        for(const node of selected){assert.equal(q.operands.isNumberArithmeticResult(q.t,node),true);assert.equal(q.operands.isNumberArithmeticResult(q.t,{...node}),false);assert.equal(q.operands.isNumberArithmeticResult({...q.t},node),false);}
        assert.equal(createProjectReadonlyNumberOperands(c.project).isNumberArithmeticResult(c.project.targets.find(t=>t.name===q.t.name),selected[0]),false,'live objects cannot enroll');
        assert.equal(q.operands.isNumberArithmeticResult(q.t,q.math[0]),false,'the private issuer grants no generic Math result');
    }
});

test('direct and JSON exports retain the actual numeric helpers through Code and reimport',()=>{
    let c=create(source(true));
    for(let generation=0;generation<2;generation++){
        const direct=projectToArcade(c.project),json=projectJsonToArcade(JSON.stringify(c.project));clean(direct);clean(json);assert.deepEqual(direct.files,json.files);
        assert.match(json.ts,/Math\.min\(/);assert.match(json.ts,/function (?:Game_)+take/);assert.match(json.ts,/game\.onPaint\(/);
        const code=new Creator();code.parse(c.decompile());clean(code);clean(projectJsonToArcade(JSON.stringify(code.project)));
        c=create(json.files);
    }
});

test('direct variable-to-Math input remains outside the existing closed operand grammar',()=>{
    const c=create(prefix+procedure+'take(Math.min(w,h));'),q=query(c.project);negative(q);
    const out=projectJsonToArcade(JSON.stringify(c.project));assert.ok(out.unsupported.some(s=>/requires Number|actual.*producer/.test(s)),JSON.stringify(out.unsupported));
});

test('annotations, missing or conditional initialization and early ordinary entries supply no operand fact',()=>{
    for(const changed of [
        source().replace('let sz=8;','let sz:number;'),
        source().replace('let sz=8;','let sz:number;if(result){sz=8;}'),
        'let sz:number;let w:number;let h:number;let result=0;'+procedure+consume+'sz=8;w=(160/sz)|0;h=(120/sz)|0;',
        'let sz:number;let w:number;let h:number;let result=0;'+procedure+'function early(){'+consume+'}early();sz=8;w=(160/sz)|0;h=(120/sz)|0;',
        'let sz:number;let w:number;let h:number;let result=0;'+procedure+'game.onPaint(function(){'+consume+'});sz=8;w=(160/sz)|0;h=(120/sz)|0;'
    ])negative(query(create(changed).project));
});

test('later and callback writers and dependency cycles remain refused',()=>{
    for(const changed of [
        source()+'sz="wrong" as any;',source()+'w=undefined as any;',
        prefix+procedure+'function sample(){take(Math.min(w+1,99));}game.onPaint(function(){w="1" as any;sample();});sample();',
        prefix+procedure+'game.onPaint(function(){sz="wrong" as any;'+consume+'});'+consume,
        source().replace('let sz=8;','let sz=w;'),
        source().replace('let sz=8;','let sz:any=[];')
    ])negative(query(create(changed).project));
});

test('stored callable source retains its named refusal before private operand analysis',()=>{
    const imported=arcadeToPseudocode(prefix+procedure+'function sample(){'+consume+'}let escaped=sample;sample();');
    assert.deepEqual(imported.unsupported,[
        'Named function values: body calls require an actual unchanged zero-argument declaration',
        'procedure sample used as a stored callable value requires closure support'
    ]);
});

test('physical cell, writer, socket and entry identities cannot be copied or replaced',()=>{
    const original=create(source()).project;
    const mutations=[
        p=>{const id=writers(p,'sz')[0].node.fields.VARIABLE[1],owners=p.targets.filter(t=>Object.hasOwn(t.variables||{},id));assert.equal(owners.length,1);owners[0].variables[id][2]=true;},
        p=>{const row=writers(p,'sz')[0];row.node.fields.VARIABLE[0]='foreign';},
        p=>{const row=writers(p,'sz')[0];row.node.fields.VARIABLE[1]='foreign';},
        p=>{const row=writers(p,'sz')[0];row.node.inputs.OTHER=[1,[4,'8']];},
        p=>{const row=writers(p,'sz')[0];row.node.next=null;},
        p=>{const row=writers(p,'sz')[0];p.monitors=[{id:row.node.fields.VARIABLE[1],opcode:'data_variable',params:{VARIABLE:'sz'},visible:true}];},
        p=>{const t=p.targets.find(t=>Object.values(t.blocks).some(n=>n.opcode==='procedures_call')),call=Object.values(t.blocks).find(n=>n.opcode==='procedures_call'),code=call.mutation.proccode,at=code.indexOf(' %');call.mutation.proccode='foreign'+(at<0?'':code.slice(at));},
        p=>{const t=p.targets.find(t=>Object.values(t.blocks).some(n=>n.opcode==='arcade_whenSourceStarts'));t.blocks.foreignRoot={opcode:'event_whenflagclicked',parent:null,topLevel:true,shadow:false,next:null,inputs:{},fields:{}};}
    ];
    for(const mutate of mutations){const p=clone(original);mutate(p);negative(query(p));}
});

test('direct private-copy queries preserve artwork callback receivers, arity and actual object identities',()=>{
    const c=create(source()),targets=c.project.targets;let calls=0;
    const opts={costumePalette:function(target,costume){calls++;assert.equal(this,opts);assert.equal(arguments.length,2);assert.ok(targets.includes(target));assert.ok(target.costumes.includes(costume));return null;}};
    clean(projectToArcade(c.project,opts));assert.ok(calls>0,'the real exporter invokes the actual artwork callback');
});

test('a direct callback cannot use the captured Number proof for a changed live source',()=>{
    const c=create(source()),writer=writers(c.project,'sz')[0].node,original=writer.inputs.VALUE;let changed=false;
    const opts={costumePalette(){if(!changed){writer.inputs.VALUE=[1,[4,'16']];changed=true;}return null;}};
    let result;try{result=projectToArcade(c.project,opts);}finally{writer.inputs.VALUE=original;}
    assert.equal(changed,true);assert.ok(result.unsupported.some(s=>/requires Number|current proof environment/.test(s)),JSON.stringify(result.unsupported));
    clean(projectToArcade(c.project));
});

test('actual non-Number and unresolved producers cannot gain Number through arithmetic output spelling',()=>{
    const original=create(source()).project;
    for(const kind of ['undefined','null','boolean','InfinityUnknown']){
        const p=clone(original),{target,node}=writers(p,'sz')[0],parent=Object.keys(target.blocks).find(id=>target.blocks[id]===node);
        const remove=id=>{const n=target.blocks[id];if(!n)return;for(const slot of Object.values(n.inputs||{}))for(const child of slot.slice(1))if(typeof child==='string')remove(child);delete target.blocks[id];};
        if(typeof node.inputs.VALUE[1]==='string')remove(node.inputs.VALUE[1]);
        target.blocks.nonNumber=kind==='boolean'?
            {opcode:'operator_equals',parent,topLevel:false,shadow:false,next:null,fields:{},inputs:{OPERAND1:[1,[10,'x']],OPERAND2:[1,[10,'x']]}}:
            {opcode:'arrays_specialValue',parent,topLevel:false,shadow:false,next:null,fields:{KIND:[kind,null]},inputs:{}};
        node.inputs.VALUE=[3,'nonNumber',[4,'0']];negative(query(p));
    }
    assert.throws(()=>createProjectJsonSnapshot(JSON.stringify({targets:[],actualBigInt:8n})),/BigInt/,'a genuine BigInt cannot be smuggled into an owned JSON numeric literal');
});

test('used Number operand facts expire on observed ambient mutation and cannot renew after restoration',()=>{
    const q=query(create(source()).project);positive(q);const selected=Object.values(q.t.blocks).find(n=>n.opcode==='arrays_valueBinary'&&n.fields?.OP?.[0]==='-');assert.ok(selected);assert.equal(q.operands.isNumberArithmeticResult(q.t,selected),true);
    const descriptor=Object.getOwnPropertyDescriptor(Number,'isFinite');
    try{Object.defineProperty(Number,'isFinite',{...descriptor,value:()=>true});assert.equal(q.operands.current(),false);assert.equal(q.proof.current(),false);}finally{Object.defineProperty(Number,'isFinite',descriptor);}
    assert.equal(q.operands.current(),false);assert.equal(q.operands.isNumberArithmeticResult(q.t,selected),false);assert.equal(q.proof.isNumberResult(q.t,q.math[0]),false);
    positive(query(create(source()).project));
});

// These are legal physical Scratch binding identities. TypeScript's shared
// emitted namespace must not replace the independently proved variable cell.
test('emitted binding hygiene refuses a formal that shadows the proved global',()=>{
    const c=create('let result=0;let sz=8;let outerWidth=(160/sz)|0;let h=(120/sz)|0;function sample(w:string){result=Math.min(outerWidth+1,h-1);}sample("1");');
    renameCell(c.project,'outerWidth','w');negative(query(c.project));
});

test('emitted binding hygiene refuses reserved-name normalization collisions',()=>{
    const c=create('let result=0;let sz=8;let outerWidth=(160/sz)|0;let other="1";function sample(){result=Math.min(outerWidth+1,99);}sample();');
    renameCell(c.project,'outerWidth','image');renameCell(c.project,'other','image_');negative(query(c.project));
});

test('emitted binding hygiene includes the leading underscore of numeric target prefixes',()=>{
    const c=create('let result=0;let sz=8;let outerWidth=(160/sz)|0;let other="1";function sample(){result=Math.min(outerWidth+1,99);}sample();');
    const local=renameCell(c.project,'outerWidth','local'),target=c.project.targets.find(t=>!t.isStage);assert.ok(target);target.name='1Game';
    delete local.target.variables[local.id];target.variables[local.id]=local.row;
    for(const monitor of c.project.monitors||[])if(monitor.id===local.id)monitor.spriteName='1Game';
    renameCell(c.project,'other','_1Game_local');negative(query(c.project));
});

test('canonical registered-paint void exits grant no startup-return or arbitrary-value authority',()=>{
    const withExit=source(true).replace('function(){sample();}','function(){if(result<0)return;sample();}');
    const c=create(withExit);assert.ok(c.project.targets.some(t=>Object.values(t.blocks).some(n=>n.opcode==='arcade_returnValue')));positive(query(c.project));
    negative(query(create(withExit.replace('return;','return 7;')).project));
    negative(query(create(source().replace('let sz=8;','let sz:number;function initialize(){sz=8;return;}initialize();')).project));
});

test('emitted local binding refuses the escaped name of a global cell',()=>{
    const c=create('let result=0;let sz=8;let outerWidth=(160/sz)|0;function sample(){let image_="1";result=Math.min(outerWidth+1,99);}sample();');
    renameCell(c.project,'outerWidth','image');negative(query(c.project));
});

test('emitted local binding refuses a prefixed sprite-local cell name',()=>{
    const c=create('let result=0;let sz=8;let outerWidth=(160/sz)|0;function sample(){let Game_w="1";result=Math.min(outerWidth+1,99);}sample();');
    const local=renameCell(c.project,'outerWidth','w'),target=c.project.targets.find(t=>!t.isStage);assert.ok(target);
    delete local.target.variables[local.id];target.variables[local.id]=local.row;
    for(const monitor of c.project.monitors||[])if(monitor.id===local.id)monitor.spriteName=target.name;
    negative(query(c.project));
});

test('emitted local binding cannot shadow the actual Math namespace',()=>{
    const c=create('let result=0;let sz=8;let w=(160/sz)|0;function sample(){let localMath="1";result=Math.min(w+1,99);}sample();');let renamed=0;
    for(const target of c.project.targets)for(const node of Object.values(target.blocks))if(node.opcode==='arcade_setLocal'&&node.inputs.NAME?.[1]?.[1]==='localMath'){node.inputs.NAME=[1,[10,'Math']];renamed++;}
    assert.equal(renamed,1);negative(query(c.project));
});


test('emitted local bindings cannot replace SDK anchors or allocated arithmetic helpers',()=>{
    for(const name of ['randint','pause','screen','music','Sounds','__bwBinarySubtract','__bwBinarySubtract__','__bwUnaryBitNot_']){
        const c=create('let result=0;let sz=8;let w=(160/sz)|0;function sample(){let actualLocal="1";result=Math.min(w-1,99);}sample();');
        let renamed=0;
        for(const target of c.project.targets)for(const node of Object.values(target.blocks))if(node.opcode==='arcade_setLocal'&&node.inputs.NAME?.[1]?.[1]==='actualLocal'){node.inputs.NAME=[1,[10,name]];renamed++;}
        assert.equal(renamed,1,name);negative(query(c.project));
    }
});

test('emitted formal bindings cannot replace SDK anchors or allocated arithmetic helpers',()=>{
    for(const name of ['randint','screen','music','Sounds','__bwBinarySubtract','__bwBinarySubtract_']){
        const c=create('let result=0;let sz=8;let w=(160/sz)|0;function sample('+name+':string){result=Math.min(w-1,99);}sample("1");');
        negative(query(c.project));
    }
});

test('unrelated ordinary locals and formals retain their own bindings',()=>{
    const c=create('let result=0;let sz=8;let w=(160/sz)|0;function sample(label:string){let actualLocal="1";result=Math.min(w-1,99);}sample("safe");');
    positive(query(c.project));clean(projectJsonToArcade(JSON.stringify(c.project)));
});


test('used binding hygiene expires when actual helper declarations change',()=>{
    const q=query(create(source()).project);positive(q);
    const helper=HELPERS[Object.keys(HELPERS)[0]],descriptor=Object.getOwnPropertyDescriptor(helper,'ts');assert.ok(descriptor);
    try{Object.defineProperty(helper,'ts',{...descriptor,value:''});assert.equal(q.operands.current(),false);assert.equal(q.proof.current(),false);}
    finally{Object.defineProperty(helper,'ts',descriptor);}
    assert.equal(q.operands.current(),false);negative(q);positive(query(create(source()).project));
});

test('callback-only paint witness survives source export and reimport',()=>{
    let c=create(source(true).replace('let result=0;','let painted=0;let result=0;').replace('function(){sample();}','function(){sample();painted=1;}'));
    for(let generation=0;generation<2;generation++){
        positive(query(c.project));const out=projectJsonToArcade(JSON.stringify(c.project));clean(out);
        assert.match(out.ts,/painted\s*=\s*\(0 \+ 1\)/);c=create(out.files);
    }
});


test('emitted global cells cannot replace fixed SDK anchors',()=>{
    for(const name of ['randint','screen','music','Sounds']){
        const c=create('let result=0;let sz=randint(8,8);let outerWidth=(160/sz)|0;function sample(){result=Math.min(outerWidth-1,99);}sample();');
        let converted=0;
        for(const target of c.project.targets)for(const node of Object.values(target.blocks))if(node.opcode==='arcade_mathBinary'&&node.fields.OP[0]==='randomRange'){
            node.opcode='operator_random';node.inputs={FROM:node.inputs.A,TO:node.inputs.B};node.fields={};converted++;
        }
        assert.equal(converted,1,'one canonical stock SDK random producer');
        renameCell(c.project,'outerWidth',name);negative(query(c.project));
    }
    const safe=create(source());renameCell(safe.project,'w','image');positive(query(safe.project));
    const out=projectJsonToArcade(JSON.stringify(safe.project));clean(out);assert.match(out.ts,/image_/);
});
