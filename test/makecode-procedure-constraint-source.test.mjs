import test from 'node:test';
import assert from 'node:assert/strict';
import {parseMakeCodeTs} from '../overlay/scratch-gui/src/lib/bw-makecode/ts-import.js';
import {analyseSourceValueProducers} from '../overlay/scratch-gui/src/lib/bw-makecode/source-value-producers.js';
import {procedureConstraintPrefix,validateProcedureConstraintSource,prepareProcedureConstraintSource} from '../overlay/scratch-gui/src/lib/bw-makecode/procedure-constraint-source.js';
const parse=source=>parseMakeCodeTs(source,{parameterDefaults:true,retainCallableMetadata:true});
test('unused ordinary primitive parameter keeps visible constraints and has no actual producer',()=>{
 const ast=parse('function holdText(thisText:string){game.showLongText(thisText,0)}'),fn=ast.body[0];
 assert.deepEqual(procedureConstraintPrefix(fn,'holdText %s'),['  declare arcade procedure "holdText %s" parameter "thisText" as String']);
 assert.deepEqual(validateProcedureConstraintSource(ast),[]);
 const graph=analyseSourceValueProducers(ast),read=fn.body[0].expr.args[0];assert.deepEqual([...graph.typesAt(read)],[]);
});
test('real incoming Number/Text contradictions and actual formal/captured writers refuse',()=>{
 for(const source of ['function f(x:string){game.showLongText(x,0)}f(20)', 'function f(x:number){}f("20")','function f(x:string){x=20}', 'function f(x:string){let later=()=>{x=20}}'])assert.ok(validateProcedureConstraintSource(parse(source)).length,source);
 for(const source of ['function f(x:string){game.showLongText(x,0)}f("20")','function f(x:number){}f(20)','function f(x:string){x="ok"}', 'function f(x:string){function inner(x:number){x=20}}'])assert.deepEqual(validateProcedureConstraintSource(parse(source)),[],source);
});
test('legacy reference/callable signatures remain outside the ordinary primitive protocol',()=>{
 for(const source of ['function f(x:Image){}','function f(x:()=>number){}']){const fn=parse(source).body[0];assert.deepEqual(procedureConstraintPrefix(fn,'f %s'),[]);}
 assert.throws(()=>procedureConstraintPrefix(parse('function f(x?:string){}').body[0],'f %s'),/optional/);
});

test('source catalogue excludes generated class procedures and retains actual ordinary binding metadata',()=>{
 const ast=parse('class Box{constructor(x:number){}} function f(x:string){}');
 const prepared=prepareProcedureConstraintSource(ast);assert.deepEqual(prepared.diagnostics,[]);
 assert.deepEqual(prepared.prefix({name:'__bwClass_Box_constructor',params:['self','x'],paramTypes:{x:{text:'number'}}},'class %s %s'),[]);
 const fn=ast.body.find(node=>node.type==='FunctionDeclaration');
 assert.equal(prepared.prefix({...fn,source:'f',name:'Game_f'},'Game_f %s').length,1);
 assert.throws(()=>prepared.prefix({...fn,params:['wrong']},'f %s'),/metadata differs/);
});
