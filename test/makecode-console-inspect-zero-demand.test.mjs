import test from 'node:test';
import assert from 'node:assert/strict';
import {parseMakeCodeTs} from '../overlay/scratch-gui/src/lib/bw-makecode/ts-import.js';
import {lowerConsoleInspectValues,lowerConsoleInspectValuesForTranslation} from '../overlay/scratch-gui/src/lib/bw-makecode/lower-console-inspect-values.js';
import {observeLoweringInput} from '../overlay/scratch-gui/src/lib/bw-makecode/lowering-input-observation.js';
import {prepareProcedureConstraintSourceForTranslation,procedureConstraintAstMetadata} from '../overlay/scratch-gui/src/lib/bw-makecode/procedure-constraint-source.js';
import {prepareThrowSource} from '../overlay/scratch-gui/src/lib/bw-makecode/throw-source-gate.js';

const parse=source=>parseMakeCodeTs(source);
const pair=source=>{const program=parse(source),before=JSON.stringify(program);const eager=lowerConsoleInspectValues(program),compiler=lowerConsoleInspectValuesForTranslation(program);assert.deepEqual(compiler,eager);assert.equal(JSON.stringify(program),before);return {program,eager,compiler};};

test('zero-console compiler preparation retains complete nested rewrite and independent cloned nodes',()=>{
 const {program,compiler}=pair('let n=1;function next(value:number){let scratch:any;return value+n}for(let i=0;i<3;i++){n=next(n)}');
 const prepared=prepareProcedureConstraintSourceForTranslation(parse('function plus(n:number){return n+1}let value=plus(2);'),{mode:'supported-default'});
 assert.deepEqual(prepared.diagnostics,[]);
 const protocol={...prepared.program,bwProcedureConstraintSource:procedureConstraintAstMetadata(prepared)},stage=prepareThrowSource(protocol);
 assert.equal(stage.present,false);assert.equal(typeof stage.program.bwProcedureConstraintSource.prefix,'function');
 const admitted=observeLoweringInput(stage.program);assert.ok(admitted);assert.equal(admitted.current(),true,'the actual compiler metadata must not make this optimization unreachable');
 const eagerStage=lowerConsoleInspectValues(stage.program),compilerStage=lowerConsoleInspectValuesForTranslation(stage.program);assert.deepEqual(compilerStage,eagerStage);
 const cloned=observeLoweringInput(compilerStage.program);assert.ok(cloned);assert.equal(cloned.current(),true,'the real complete clone must remain usable at the later Font stage');
 const envelope=protocol.bwProcedureConstraintSource;protocol.bwProcedureConstraintSource=Object.freeze({prefix(){throw Error('must not invoke');}});assert.equal(admitted.current(),false);protocol.bwProcedureConstraintSource=envelope;assert.equal(admitted.current(),false,'expired metadata observation cannot revive');assert.equal(observeLoweringInput(protocol).current(),true);
 const foreign=parse('let n=1;');foreign.extra=()=>1;assert.equal(observeLoweringInput(foreign),null,'other function leaves remain outside this demand');
 const aliased={...protocol,other:envelope};assert.equal(observeLoweringInput(aliased),null,'the opaque metadata envelope has one actual root role');
 const copiedFunction={...protocol,other:envelope.prefix};assert.equal(observeLoweringInput(copiedFunction),null,'the opaque function cannot be copied into another AST role');
 assert.deepEqual(compiler.unsupported,[]);assert.notEqual(compiler.program,program);assert.notEqual(compiler.program.body,program.body);
 for(let i=0;i<program.body.length;i++)assert.notEqual(compiler.program.body[i],program.body[i]);
 const fn=compiler.program.body.find(node=>node.type==='FunctionDeclaration');assert.equal(Boolean(fn.body.find(node=>node.type==='Declaration').decls[0].init),false,'no console demand must not initialize an omitted local');
});

test('zero-console preparation preserves reserved internal names diagnostics and source unchanged',()=>{
 const {compiler}=pair('let __bwConsoleInspectSecret=1;function __bwConsoleInspectHelper(){return 2}');
 assert.ok(compiler.unsupported.includes('Internal console inspection names are not source bindings'));
});

test('actual console calls retain eager producer proof and required Undefined local initialization',()=>{
 const {compiler}=pair('function show(){let value:any;console.inspect(value)}show();');
 assert.deepEqual(compiler.unsupported,[]);
 const fn=compiler.program.body.find(node=>node.type==='FunctionDeclaration');assert.deepEqual(fn.body.find(node=>node.type==='Declaration').decls[0].init,{type:'Undefined'});
 assert.ok(JSON.stringify(fn).includes('__bwConsoleInspectValue'));
 for(const source of ['console.inspect(unknown);','console.inspect(1,unknown);','let c=console;c.inspect(1);console.inspect(1);'])assert.ok(pair(source).compiler.unsupported.length>0,source);
});

test('public eager callback observations and accessor-input compiler fallback remain equal',()=>{
 const run=lower=>{const program=parse('let n=1;n=n+1;');let reads=0;Object.defineProperty(program.body[1].expr,'extra',{enumerable:true,configurable:true,get(){reads++;return 'unchanged';}});return {result:lower(program),reads};};
 const eager=run(lowerConsoleInspectValues),compiler=run(lowerConsoleInspectValuesForTranslation);assert.ok(eager.reads>1,'actual scanner, graph and rewrite must observe the callback');assert.equal(compiler.reads,eager.reads);assert.deepEqual(compiler.result,eager.result);
});

test('uncertain Throw Unknown and opaque shapes keep the existing eager result and clone behavior',()=>{
 for(const kind of ['ThrowStatement','Unknown','Opaque']){const program=parse('let n=1;');program.body.push({type:kind,argument:{type:'Number',value:2}});const before=JSON.stringify(program);const observe=lower=>{try{return {returned:lower(program)};}catch(error){return {thrown:{name:error.name,message:error.message}};}};assert.deepEqual(observe(lowerConsoleInspectValuesForTranslation),observe(lowerConsoleInspectValues));assert.equal(JSON.stringify(program),before);}
});

test('changed intrinsic surface keeps the eager graph rather than selecting zero-demand behavior',()=>{
 const original=Object.freeze;const run=lower=>{const program=parse('let n=1;n=n+2;');let calls=0;try{Object.freeze=value=>{calls++;return original(value);};const result=lower(program);return {result,calls};}finally{Object.freeze=original;}};
 const eager=run(lowerConsoleInspectValues),compiler=run(lowerConsoleInspectValuesForTranslation);assert.ok(eager.calls>1,'the real graph must reach its freeze operations');assert.equal(compiler.calls,eager.calls);assert.deepEqual(compiler.result,eager.result);assert.equal(Object.freeze,original);
 const iteratorPrototype=Object.getPrototypeOf([][Symbol.iterator]()),next=Object.getOwnPropertyDescriptor(iteratorPrototype,'next');
 const runIterator=lower=>{const program=parse('let n=1;n=n+2;');let calls=0;try{Object.defineProperty(iteratorPrototype,'next',{...next,value:function(...args){calls++;return Reflect.apply(next.value,this,args);}});assert.equal(observeLoweringInput(program),null,'actual native iterator descriptor change must retain eager work');return {result:lower(program),calls};}finally{Object.defineProperty(iteratorPrototype,'next',next);}};
 const oldIterator=runIterator(lowerConsoleInspectValues),newIterator=runIterator(lowerConsoleInspectValuesForTranslation);assert.ok(oldIterator.calls>0);assert.equal(newIterator.calls,oldIterator.calls);assert.deepEqual(newIterator.result,oldIterator.result);assert.equal(observeLoweringInput(parse('let n=1;')).current(),true);
 const originalSymbol=globalThis.Symbol,sentinel=Error('actual changed Symbol graph callback');
 const runSymbol=lower=>{const program=parse('let n=1;');let calls=0,actual;try{globalThis.Symbol=function(){calls++;throw sentinel;};assert.equal(observeLoweringInput(program),null);try{lower(program);}catch(error){actual=error;}return {calls,actual};}finally{globalThis.Symbol=originalSymbol;}};
 const oldSymbol=runSymbol(lowerConsoleInspectValues),newSymbol=runSymbol(lowerConsoleInspectValuesForTranslation);assert.ok(oldSymbol.calls>0);assert.equal(oldSymbol.actual,sentinel);assert.equal(newSymbol.actual,sentinel);assert.equal(newSymbol.calls,oldSymbol.calls);assert.equal(observeLoweringInput(parse('let n=1;')).current(),true);
});
