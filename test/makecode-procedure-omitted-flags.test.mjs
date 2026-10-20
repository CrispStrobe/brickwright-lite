import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {parseMakeCodeTs} from '../overlay/scratch-gui/src/lib/bw-makecode/ts-import.js';
import {prepareProcedureConstraintSource} from '../overlay/scratch-gui/src/lib/bw-makecode/procedure-constraint-source.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {runProgram,stepFrames,clearStrayTimers} from './helpers/bw-vm.mjs';
import {VM_SRC} from './helpers/bw-extensions.mjs';
const BW=createRequire(import.meta.url)(VM_SRC+'/util/bw-values.js');
const options={procedureConstraintsPrototype:true};
const source='let pdTrace="";let pdCalleeCalls=0;let pdArgCalls=0;function pdSupplied(){pdArgCalls+=1;return 8}function pdKeep(first:any=20,second:any=30){pdCalleeCalls+=1;pdTrace+="C";return first+second}let pdOmitted=pdKeep();let pdExplicit=pdKeep(undefined,undefined);let pdPresent=pdKeep(pdSupplied(),7);';
const parse=text=>parseMakeCodeTs(text,{parameterDefaults:true,retainCallableMetadata:true});
test('omission flags are fresh ordinary Number formals with actual exact-arity call operands',()=>{
 const ast=parse('let __bwOmittedDefault0=8;function keep(first:any=20,second:any=30){return first+second}let zero=keep();let partial=keep(2);let full=keep(undefined,undefined);');
 const before=JSON.stringify(ast),prepared=prepareProcedureConstraintSource(ast);assert.deepEqual(prepared.diagnostics,[]);assert.equal(JSON.stringify(ast),before,'source AST is not mutated');
 const fn=prepared.program.body.find(row=>row.type==='FunctionDeclaration');
 assert.deepEqual(fn.params,['first','second','__bwOmittedDefault1','__bwOmittedDefault2']);
 assert.equal(fn.paramTypes.__bwOmittedDefault1.text,'number');assert.deepEqual(fn.optionalParams,[]);
 for(let index=0;index<2;index++)assert.deepEqual(fn.body[index].test,{type:'Binary',op:'===',left:{type:'Identifier',name:fn.params[index+2]},right:{type:'Number',value:'1'}});
 const calls=[];const walk=node=>{if(!node||typeof node!=='object')return;if(Array.isArray(node)){node.forEach(walk);return;}if(node.type==='Call'&&node.callee.name==='keep')calls.push(node);for(const child of Object.values(node))if(child&&typeof child==='object')walk(child);};walk(prepared.program);
 assert.equal(calls.length,3);assert.deepEqual(calls.map(call=>call.args.slice(2).map(row=>row.value)),[['1','1'],['0','1'],['0','0']]);
 assert.ok(calls.every(call=>call.args.length===4));assert.equal(calls[0].args[0].type,'Undefined');assert.equal(calls[2].args[0].type,'Undefined');
 assert.deepEqual(prepareProcedureConstraintSource(prepared.program).diagnostics,[],'generated actual Number operands discharge obligations on reimport');
});
test('default omission lowering never admits escaped, changed, competing or malformed ordinary bindings',()=>{
 const cases=[
 'function keep(x:any=20){return x}let alias=keep;let result=alias();',
 'function keep(x:any=20){return x}keep=other;let result=keep();',
 'function keep(x:any=20){return x}function keep(x:any=30){return x}let result=keep();',
 'function keep(x:any=20){return x}let result=new keep();',
 'function keep(x:any=20){return x}let result=keep(1,2);',
 'function keep<T>(x:any=20){return x}let result=keep();',
 'function keep(x:number=20){return x}let result=keep();',
 'function keep(x:Image=image.create(1,1),y:any=20){return y}let result=keep();',
 'function keep(required:number,x:any=20){return x}let result=keep();'
 ];assert.equal(cases.length,9);for(const text of cases)assert.ok(arcadeToPseudocode(text,options).unsupported.some(row=>/Procedure parameter constraint:/.test(row)),text);
});
const values=run=>Object.fromEntries(['pdOmitted','pdExplicit','pdPresent','pdTrace','pdCalleeCalls','pdArgCalls'].map(name=>{const rows=run.vm.runtime.targets.flatMap(t=>Object.values(t.variables)).filter(v=>v.name===name);assert.equal(rows.length,1,name);return[name,BW.decode(rows[0].value)];}));
const check=(run,omitted)=>{assert.deepEqual(run.errors,[]);assert.deepEqual(run.creator.warnings,[]);assert.deepEqual(values(run),{pdOmitted:omitted,pdExplicit:NaN,pdPresent:15,pdTrace:'CCC',pdCalleeCalls:3,pdArgCalls:1});assert.ok(Number.isNaN(values(run).pdExplicit));};
test('selected omitted/explicit Undefined semantics and actual default edit survive all current portable routes',async()=>{
 const imported=arcadeToPseudocode(source,options);assert.deepEqual(imported.unsupported,[]);assert.match(imported.code,/__bwOmittedDefault/);const runs=[];
 const portable=async(first,expected)=>{
  check(first,expected);
  const code=first.creator.decompile(JSON.parse(first.vm.toJSON()));assert.match(code,/__bwOmittedDefault/);const feedback=await runProgram(code,{frames:45});runs.push(feedback);check(feedback,expected);
  const bytes=Buffer.from(await(await first.vm.saveProjectSb3()).arrayBuffer());first.vm.stopAll();await first.vm.loadProject(bytes);first.vm.greenFlag();await stepFrames(first.vm,45);check(first,expected);
  const fresh=await runProgram('DEVICE ARCADE\nSPRITE Game:\nWHEN arcade source starts:\n  hide',{frames:0});runs.push(fresh);fresh.vm.stopAll();await fresh.vm.loadProject(bytes);fresh.vm.greenFlag();await stepFrames(fresh.vm,45);check(fresh,expected);
  const exported=projectToArcade(JSON.parse(fresh.vm.toJSON()));assert.deepEqual(exported.unsupported,[]);assert.match(exported.ts,/__bwOmittedDefault\d+:\s*number/);assert.match(exported.ts,/return left === right/);assert.match(exported.ts,/__bwCompareStrictEqual\(__bwOmittedDefault\d+, \(0 \+ 1\)\)/);
  const again=arcadeToPseudocode(exported.files,options);assert.deepEqual(again.unsupported,[]);const last=await runProgram(again.code,{frames:45});runs.push(last);check(last,expected);
 };
 try{
  const first=await runProgram(imported.code,{frames:45});runs.push(first);await portable(first,50);
  const target=first.vm.runtime.targets.find(t=>Object.values(t.blocks._blocks).some(b=>b.opcode==='math_number'&&String(b.fields.NUM?.value)==='20'));assert.ok(target);
  const numbers=Object.values(target.blocks._blocks).filter(b=>b.opcode==='math_number'&&String(b.fields.NUM?.value)==='20');assert.equal(numbers.length,1,'one editable default value, no per-call literal copies');
  const number=numbers[0],parent=target.blocks.getBlock(number.parent);assert.equal(parent.opcode,'operator_add');assert.ok(Object.values(parent.inputs).some(input=>input.block===number.id));
  target.blocks.changeBlock({id:number.id,element:'field',name:'NUM',value:'30'});assert.equal(target.blocks.getBlock(number.id).parent,parent.id);assert.equal(target.blocks.getBlock(number.id).fields.NUM.value,'30');
  first.vm.stopAll();first.vm.greenFlag();await stepFrames(first.vm,45);await portable(first,60);
 }finally{for(const run of runs){run.vm.stopAll();run.vm.quit();}clearStrayTimers();}
});
test('partial omission keeps original operand effects in order and observes runtime Undefined as supplied',async()=>{
 const text='let order="";function a(){order+="A";return undefined}function b(){order+="B";return 7}function keep(first:any=20,second:any=30){order+="C";return first+second}let partial=keep(2);let explicit=keep(a(),b());let after=order;';
 const imported=arcadeToPseudocode(text,options);assert.deepEqual(imported.unsupported,[]);let run;
 try{run=await runProgram(imported.code,{frames:45});assert.deepEqual(run.errors,[]);const vars=run.vm.runtime.targets.flatMap(t=>Object.values(t.variables));const read=name=>BW.decode(vars.find(row=>row.name===name).value);assert.equal(read('partial'),32);assert.ok(Number.isNaN(read('explicit')));assert.equal(read('after'),'CABC');}finally{if(run){run.vm.stopAll();run.vm.quit();}clearStrayTimers();}
});
