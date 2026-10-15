import test from 'node:test';
import assert from 'node:assert/strict';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import Creator from '../overlay/scratch-gui/src/lib/sb3-creator.js';
const build=source=>{const imported=arcadeToPseudocode(source);assert.deepEqual(imported.unsupported,[]);const creator=new Creator();creator.parse(imported.code);return creator.project;};
const of=(project,opcode)=>project.targets.flatMap(target=>Object.values(target.blocks||{}).filter(block=>block.opcode===opcode).map(block=>({target,block})));
const output=project=>projectToArcade(project);
const fieldSource=(type,value)=>`class Reader{value:${type};constructor(){this.value=${value}}read():${type}{return this.value}}let reader=new Reader();let result=reader.read();`;
const edits=[['number','1',[10,'20']],['string','"a"',[4,'20']],['boolean','true',[10,'20']]];
for(const[type,initial,value]of edits)test(type+' field rejects actual incompatible current input without changing native value or declared metadata',()=>{
    const project=build(fieldSource(type,initial)),writer=of(project,'arcade_setObjectField');assert.equal(writer.length,1);
    writer[0].block.inputs.VALUE=[1,value];const before=JSON.stringify(project),exported=output(project);
    assert.ok(exported.unsupported.some(message=>message.includes('Class primitive export: field Reader.value writer conflicts with declared '+type)),JSON.stringify(exported.unsupported));
    assert.equal(JSON.stringify(project),before);assert.match(exported.ts,new RegExp('value: '+type));
    assert.ok(exported.ts.includes(type==='string'?'this.value = 20':'this.value = "20"'));
});
for(const[type,initial,value]of edits)test(type+' method rejects incompatible actual return input',()=>{
    const project=build(`class Reader{read():${type}{return ${initial}}}let reader=new Reader();let result=reader.read();`),returns=of(project,'arcade_returnValue');assert.equal(returns.length,1);returns[0].block.inputs.VALUE=[1,value];
    assert.ok(output(project).unsupported.some(message=>message.startsWith('Class primitive export: result Reader.')&&message.includes('declared '+type)));
});
test('matching renamed primitive fields, constructor/formal constraints and alias writers preserve source export',()=>{
    for(const source of [
        'class Box{constructor(public count:number,public label:string,public flag:boolean){}read(n:number):number{return this.count+n}}let box=new Box(2,"a",true);let alias=box;alias.count=5;let result=box.read(3);',
        'class Base{constructor(public n:number){}get value():number{return this.n}set value(v:number){this.n=v}}class Child extends Base{read():number{return this.n+10}}let box=new Child(2);box.value=5;let result=box.read();',
        'class Box{n:number;get value():number{return this.n}set value(v:number){this.n=v}}let box=new Box();let before=box.value===undefined;box.value=7;let result=box.value;',
        'class Box{constructor(public n:number){}get value():number{return this.n}set value(v:number){this.n=v}}let box=new Box(2);(box as any).value=false;let result=(box as any).value;'
    ])assert.deepEqual(output(build(source)).unsupported,[],source);
});
test('actual method argument and formal overwrite are checked separately from symbolic parameter constraints',()=>{
    const project=build('class Box{read(n:number):number{n=2;return n}}let box=new Box();let result=box.read(1);');
    const set=of(project,'arcade_setLocal').find(({block,target})=>{const slot=block.inputs.NAME?.[1];return Array.isArray(slot)&&slot[1]==='n'||target.blocks[slot]?.fields.TEXT?.[0]==='n';});assert.ok(set);set.block.inputs.VALUE=[1,[10,'bad']];
    assert.ok(output(project).unsupported.some(message=>message.includes('formal Box.n writer conflicts with declared number')));
    const other=build('class Box{read(n:number):number{return n}}let box=new Box();let result=box.read(1);');
    const arg=of(other,'arcade_functionArgument').find(({block,target})=>target.blocks[block.inputs.VALUE?.[1]]?.opcode==='operator_add');assert.ok(arg);arg.block.inputs.VALUE=[1,[10,'bad']];
    assert.ok(output(other).unsupported.some(message=>message.includes('argument Box.')&&message.includes('declared number')));
});
test('all current return branches and later field writers retain incompatibilities',()=>{
    const project=build('class Box{value:number;constructor(){this.value=1}read(flag:boolean):number{if(flag){return this.value}else{return 2}}}let box=new Box();let result=box.read(true);');
    const returns=of(project,'arcade_returnValue');assert.equal(returns.length,2);returns[0].block.inputs.VALUE=[1,[10,'bad']];
    assert.ok(output(project).unsupported.some(message=>message.startsWith('Class primitive export: result Box.')));
    const later=build('class Box{constructor(public value:number){}read():number{return this.value}}let box=new Box(1);let alias=box;alias.value=2;let result=box.read();');
    const writers=of(later,'arcade_setObjectField');writers.at(-1).block.inputs.VALUE=[1,[10,'bad']];
    assert.ok(output(later).unsupported.some(message=>message.includes('field Box.value writer conflicts')));
});
test('duplicate real procedure definitions cannot supply an unambiguous class proof',()=>{
    const project=build(fieldSource('number','1')),target=project.targets.find(target=>of({targets:[target]},'arcade_declareClass').length),entry=Object.entries(target.blocks).find(([,block])=>block.opcode==='procedures_definition');assert.ok(entry);
    const [id,definition]=entry,proto=definition.inputs.custom_block[1],copy=structuredClone(definition),copyProto=structuredClone(target.blocks[proto]);copy.inputs.custom_block=[1,'duplicatePrototype'];copy.next=null;target.blocks.duplicateDefinition=copy;copyProto.parent='duplicateDefinition';target.blocks.duplicatePrototype=copyProto;
    assert.ok(output(project).unsupported.some(message=>/Class primitive export:.*(unique|ownership|procedure)/.test(message)));
});
test('actual native Text remains String through Code and saved reload while class export refuses its Number constraint',async()=>{
    const {runProgram,stepFrames,clearStrayTimers}=await import('./helpers/bw-vm.mjs');
    const BW=(await import('../overlay/scratch-vm/src/util/bw-values.js')).default;
    const runs=[],check=run=>{assert.deepEqual(run.errors,[]);const result=run.vm.runtime.targets.flatMap(target=>Object.values(target.variables)).find(variable=>variable.name==='result');assert.equal(BW.decode(result?.value),'20');};
    try{
        const imported=arcadeToPseudocode(fieldSource('number','1')),run=await runProgram(imported.code,{frames:8,storage:true});runs.push(run);
        const project=structuredClone(run.creator.project),writer=of(project,'arcade_setObjectField');assert.equal(writer.length,1);writer[0].block.inputs.VALUE=[1,[10,'20']];
        run.creator.project=project;const edited=Buffer.from(await(await run.creator.generateSB3()).arrayBuffer());run.vm.stopAll();await run.vm.loadProject(edited);run.vm.greenFlag();await stepFrames(run.vm,8);check(run);
        const current=JSON.parse(run.vm.toJSON());for(const target of project.targets)target.blocks=current.targets.find(actual=>actual.name===target.name&&actual.isStage===target.isStage).blocks;run.creator.project=project;
        const again=await runProgram(run.creator.decompile(),{frames:8,storage:true});runs.push(again);check(again);
        const saved=Buffer.from(await(await run.vm.saveProjectSb3()).arrayBuffer());run.vm.stopAll();await run.vm.loadProject(saved);run.vm.greenFlag();await stepFrames(run.vm,8);check(run);
        const fresh=await runProgram('SPRITE Placeholder:\nWHEN flag clicked:\n  hide',{frames:0,storage:true});runs.push(fresh);fresh.vm.stopAll();await fresh.vm.loadProject(saved);fresh.vm.greenFlag();await stepFrames(fresh.vm,8);check(fresh);
        const exported=output(project);assert.ok(exported.unsupported.includes('Class primitive export: field Reader.value writer conflicts with declared number (actual String)'));
        assert.match(exported.ts,/value: number/);assert.match(exported.ts,/this\.value = "20"/);
    }finally{for(const run of runs){run.vm.stopAll();run.vm.quit();}clearStrayTimers();}
});
test('foreign primitive receiver and malformed current body ownership cannot borrow a class property name',()=>{
    const project=build(fieldSource('number','1')),writer=of(project,'arcade_setObjectField')[0];writer.block.inputs.OBJECT=[1,[10,'Reader']];
    assert.ok(output(project).unsupported.includes('Class primitive export: field writer requires an actual declared receiver and fixed property'));
    const malformed=build(fieldSource('number','1')),bad=of(malformed,'arcade_setObjectField')[0];bad.block.parent='missingActualParent';
    assert.ok(output(malformed).unsupported.some(message=>message.includes('procedure ownership is malformed')));
});
test('an unreachable incompatible return still remains a rendered source constraint',()=>{
    const project=build('class Reader{read():number{return 1}}let reader=new Reader();let result=reader.read();'),row=of(project,'arcade_returnValue')[0];
    const id=Object.entries(row.target.blocks).find(([,block])=>block===row.block)[0];row.block.next='afterReturn';
    row.target.blocks.afterReturn={opcode:'arcade_returnValue',parent:id,next:null,topLevel:false,shadow:false,fields:{},inputs:{VALUE:[1,[10,'bad']]}};
    assert.ok(output(project).unsupported.some(message=>message.startsWith('Class primitive export: result Reader.')));
});
test('current parameter defaults are constraints too, without seeding argument producer facts',()=>{
    const project=build('class Reader{constructor(public n:number=1){}read():number{return this.n}}let reader=new Reader();let result=reader.read();');
    const declaration=of(project,'arcade_declareClass')[0],slot=declaration.block.inputs.PARAMETERS[1];assert.ok(Array.isArray(slot));
    const parameters=JSON.parse(slot[1]);parameters[0].default='20';slot[1]=JSON.stringify(parameters);
    assert.ok(output(project).unsupported.some(message=>message.includes('default Reader.n conflicts with declared number')));
});
test('preexisting current accessor mismatch escape remains explicit and is not an authored-cast provenance proof',()=>{
    for(const value of [[10,'20'],[4,'20']]){
        const project=build('class Box{constructor(public n:number){}get value():number{return this.n}set value(v:number){this.n=v}}let box=new Box(1);box.value=2;let result=box.value;');
        const writer=of(project,'arcade_setObjectField').find(({block})=>JSON.stringify(block.inputs.FIELD).includes('value'));assert.ok(writer);writer.block.inputs.VALUE=[1,value];
        const exported=output(project);assert.deepEqual(exported.unsupported,[]);
        if(value[0]===10)assert.match(exported.ts,/as any\)\.value = "20"/);else assert.match(exported.ts,/\.value = 20/);
    }
    const project=build('class Box{constructor(public n:number){}get value():number{return this.n}set value(v:number){this.n=v}}let box=new Box(1);box.value=2;let result=box.value;');
    const writer=of(project,'arcade_setObjectField').find(({block})=>JSON.stringify(block.inputs.FIELD).includes('value'));writer.block.inputs.VALUE=[2,'booleanEdit'];
    project.targets.find(target=>Object.values(target.blocks||{}).includes(writer.block)).blocks.booleanEdit={opcode:'operator_not',parent:Object.entries(writer.target.blocks).find(([,block])=>block===writer.block)[0],next:null,shadow:false,topLevel:false,fields:{},inputs:{OPERAND:[1,[10,'']]}};
    const exported=output(project);assert.deepEqual(exported.unsupported,[]);assert.match(exported.ts,/as any\)\.value =/);
});
test('edited Text and Boolean accessor stores retain actual native values and their preexisting dynamic export route',async()=>{
    const {runProgram,stepFrames,clearStrayTimers}=await import('./helpers/bw-vm.mjs');
    const BW=(await import('../overlay/scratch-vm/src/util/bw-values.js')).default;
    const source='class Box{constructor(public n:number){}get value():number{return this.n}set value(v:number){this.n=v}}let box=new Box(1);box.value=2;let result=box.value;',runs=[];
    try{for(const physical of ['text','boolean']){
        const imported=arcadeToPseudocode(source),run=await runProgram(imported.code,{frames:8,storage:true});runs.push(run);const project=structuredClone(run.creator.project);
        const writer=of(project,'arcade_setObjectField').find(({block})=>JSON.stringify(block.inputs.FIELD).includes('value'));assert.ok(writer);
        if(physical==='text')writer.block.inputs.VALUE=[1,[10,'20']];
        else{const id=Object.entries(writer.target.blocks).find(([,block])=>block===writer.block)[0];writer.block.inputs.VALUE=[2,'currentBoolean'];writer.target.blocks.currentBoolean={opcode:'operator_not',parent:id,next:null,shadow:false,topLevel:false,fields:{},inputs:{OPERAND:[1,[10,'']]}};}
        run.creator.project=project;const saved=Buffer.from(await(await run.creator.generateSB3()).arrayBuffer());run.vm.stopAll();await run.vm.loadProject(saved);run.vm.greenFlag();await stepFrames(run.vm,8);
        assert.deepEqual(run.errors,[]);const result=run.vm.runtime.targets.flatMap(target=>Object.values(target.variables)).find(variable=>variable.name==='result');assert.equal(BW.decode(result?.value),physical==='text'?'20':true);
        const current=JSON.parse(run.vm.toJSON());for(const target of project.targets)target.blocks=current.targets.find(actual=>actual.name===target.name&&actual.isStage===target.isStage).blocks;
        const exported=output(project);assert.deepEqual(exported.unsupported,[]);assert.match(exported.ts,/as any\)\.value =/);
    }}finally{for(const run of runs){run.vm.stopAll();run.vm.quit();}clearStrayTimers();}
});
