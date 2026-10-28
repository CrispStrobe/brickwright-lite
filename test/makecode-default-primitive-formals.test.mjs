import test from 'node:test';
import assert from 'node:assert/strict';
import {parseMakeCodeTs} from '../overlay/scratch-gui/src/lib/bw-makecode/ts-import.js';
import {prepareProcedureConstraintSource,procedureConstraintAstMetadata} from '../overlay/scratch-gui/src/lib/bw-makecode/procedure-constraint-source.js';
import {analyseSourceValueProducers} from '../overlay/scratch-gui/src/lib/bw-makecode/source-value-producers.js';
import {importProjectFiles} from '../overlay/scratch-gui/src/lib/bw-makecode/index.js';
const parse=s=>parseMakeCodeTs(s,{parameterDefaults:true,retainPrimitiveProcedureDefaults:true});
const prepare=s=>prepareProcedureConstraintSource(parse(s),{mode:'supported-default'});
const translated=s=>importProjectFiles({'main.ts':s},{target:'arcade'});

test('default declaration catalogue has no duplicate executable AST and retains bound formal identity',()=>{
 const ast=parse('function unused(text:string){}'),fn=ast.body[0],prepared=prepareProcedureConstraintSource(ast,{mode:'supported-default'}),metadata=procedureConstraintAstMetadata(prepared);
 assert.equal(prepared.program,ast);assert.equal(prepared.program.body[0],fn);assert.deepEqual(Object.keys(metadata),['prefix']);assert.ok(Object.isFrozen(metadata));
 const walk=value=>{if(!value||typeof value!=='object')return;assert.notEqual(value.type,'Program');assert.notEqual(value.type,'FunctionDeclaration');assert.ok(!Object.hasOwn(value,'body'));for(const child of Object.values(value))walk(child);};walk(metadata);
 assert.equal(metadata.prefix(fn,'unused %s').length,1);assert.throws(()=>metadata.prefix({...fn,params:['other']},'unused %s'),/metadata differs/);
 assert.deepEqual([...analyseSourceValueProducers(ast).typesAt({type:'Identifier',name:'text'})],[]);
});

test('default structural selection leaves mixed signatures and callback AST on existing paths',()=>{
 const source='function mixed(n:number,image:Image){} function optional(x?:string){} let callback=(x:number)=>x;';
 assert.deepEqual(parse(source),parseMakeCodeTs(source,{parameterDefaults:true}));const result=prepare(source);assert.deepEqual(result.diagnostics,[]);for(const fn of result.program.body.filter(n=>n.type==='FunctionDeclaration'))assert.deepEqual(result.prefix(fn,fn.name+' %s'),[]);
 const defaultSource='function f(n:number,value:any=20){return value}f(1);';const ast=parse(defaultSource);assert.equal(ast.body[0].parameterDefaultPrologue,true);assert.equal(ast.body[0].functionKind,undefined);const prepared=prepare(defaultSource);assert.deepEqual(prepared.diagnostics,[]);assert.ok(prepared.program.body[0].params.some(p=>p.startsWith('__bwOmittedDefault')));
});

test('default obligations refuse actual bad callers and all writers without deselection',()=>{
 for(const s of ['function f(x:string){}f(2);','function f(x:string){x=2;}','function f(x:string){let later=()=>{x=2;}}','function f(x:number){}function later(){f("bad");}','function f(x:any=unknown){}f();']){
  const prepared=prepare(s);assert.ok(prepared.diagnostics.length,s);assert.ok(prepared.prefix(prepared.program.body[0],'f %s').length,s);
 }
 for(const [type,value]of[['string','"ok"'],['number','20'],['boolean','true']]){const result=translated(`function hold(x:${type}){}hold(${value});`);assert.deepEqual(result.unsupported,[]);assert.match(result.code,/declare arcade procedure/);}
});

test('only whole-root-owned zero-argument info.score supplies ordinary Number constraints',()=>{
 const valid='function f(x:number){}f(info.score());';assert.deepEqual(prepare(valid).diagnostics,[]);
 for(const extra of ['info.score=()=>1;','function later(){info.score=()=>1;}','let extracted=info.score;','let alias=info;','info["score"]();','function later(){consume(info);}'])assert.ok(prepare(valid+extra).diagnostics.some(d=>/actual producers/.test(d)),extra);
 for(const s of ['function f(x:number){}f(info.score(1));','let info={score:()=>"text"};function f(x:number){}f(info.score());'])assert.ok(prepare(s).diagnostics.length,s);
 const ast=parse(valid),call=ast.body[1].expr.args[0];assert.deepEqual([...analyseSourceValueProducers(ast).typesAt(call)],['Opaque']);assert.deepEqual([...analyseSourceValueProducers(ast,{ordinaryPrimitiveSdkNumbers:true}).typesAt(call)],['Number']);
});

test('ordinary score source uses actual player1 reporter while retaining whole-root constraint proof',()=>{
 const result=translated('let seen=0;function receive(value:number){seen=value;}info.setScore(35);receive(info.score());');
 assert.deepEqual(result.unsupported,[]);assert.match(result.code,/CALL: \(receive \(arcade player \(1\) score\)\)/);assert.doesNotMatch(result.code,/\(arcade score\)/);
 const wrong=translated('function receive(value:number){}info.score=()=>"wrong";receive(info.score());');assert.ok(wrong.unsupported.some(message=>/actual producers/.test(message)));
});
