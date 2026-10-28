import test from 'node:test';
import assert from 'node:assert/strict';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {parseMakeCodeTs} from '../overlay/scratch-gui/src/lib/bw-makecode/ts-import.js';
import {prepareProcedureConstraintSource} from '../overlay/scratch-gui/src/lib/bw-makecode/procedure-constraint-source.js';
const option={procedureConstraintsPrototype:true};
test('ordinary declaration prefix is explicit and precedes local/body initialization',()=>{
 const source='function keep(value:number){let local=1;return value+local}let result=keep(20);';
 const ordinary=arcadeToPseudocode(source),explicitFalse=arcadeToPseudocode(source,{procedureConstraintsPrototype:false}),selected=arcadeToPseudocode(source,option);
 // Supported ordinary primitive constraints are default-on (8da5bc23b).
 assert.deepEqual(ordinary,explicitFalse);assert.match(ordinary.code,/declare arcade procedure "keep %s" parameter "value" as Number/);assert.deepEqual(selected.unsupported,[]);
 assert.match(selected.code,/DEFINE keep \(value\):\n  declare arcade procedure "keep %s" parameter "value" as Number\n/);
 assert.ok(selected.code.indexOf('parameter "value"')<selected.code.indexOf('arcade set local local'));
});
test('unused String helper and namespace formals retain real source catalogue identity',()=>{
 for(const source of ['function holdText(thisText:string){game.showLongText(thisText,DialogLayout.Full)}let ready=true;','namespace TextHelpers{export function hold(answer:string){game.showLongText(answer,DialogLayout.Full)}}let ready=true;']){
  const result=arcadeToPseudocode(source,option);assert.deepEqual(result.unsupported,[],source);assert.match(result.code,/declare arcade procedure .* parameter .* as String/);assert.match(result.code,/arcade long text/);
 }
 const renamed=arcadeToPseudocode('function hold(answer:string){game.showLongText(answer,DialogLayout.Full)}',option);assert.deepEqual(renamed.unsupported,[]);assert.match(renamed.code,/DEFINE hold \(answer_\):\n  declare arcade procedure "hold %s" parameter "answer_" as String/);
});
test('primitive obligations reject incompatible actual incoming/formal/captured writers without producer seeds',()=>{
 for(const source of ['function hold(value:number){return value}let result=hold("bad");','function hold(value:string){value=20}hold("ok");','function hold(value:number){game.onUpdate(()=>{value="bad"})}hold(20);'])assert.ok(arcadeToPseudocode(source,option).unsupported.some(message=>/Procedure parameter constraint/.test(message)),source);
 const good=arcadeToPseudocode('function keep(value:number){return value}let result=keep(20);',option);assert.deepEqual(good.unsupported,[]);
});
test('existing independent optional/reference/class and escaped function paths gain no ordinary declaration',()=>{
 for(const source of ['function keep(value:number=1){return value}let result=keep();','function keep<T>(value:number){return value}let result=keep(1);','function width(value:Image){return value.width}let result=width(image.create(1,1));','function keep(value:number){return value}let alias=keep;','class Box{value:number;constructor(value:number){this.value=value}read(value:number){return this.value+value}}let box=new Box(1);let result=box.read(2);']){
  const result=arcadeToPseudocode(source,option);assert.doesNotMatch(result.code,/declare arcade procedure/);
 }
});
test('explicit Throw and parameter protocols compose without annotation producer grants',()=>{
 const result=arcadeToPseudocode('function fail(value:number){throw value}fail(20);',{...option,throwPrototype:true});assert.deepEqual(result.unsupported,[]);assert.match(result.code,/DEFINE fail \(value\):\n  declare arcade procedure "fail %s" parameter "value" as Number\n  arcade throw/);
 const bad=arcadeToPseudocode('function fail(value:number){throw value}fail("20");',{...option,throwPrototype:true});assert.ok(bad.unsupported.some(message=>/Procedure parameter constraint/.test(message)));
});

test('explicit excluded selections and competing actual bindings are named rather than silently preserved',()=>{
 for(const source of [
  'function keep(value:number=1){return value}let result=keep();',
  'function keep(value?:number){return value}let result=keep(1);',
  'function keep<T>(value:number){return value}let result=keep(1);',
  'function keep(value:number,picture:Image){return value}let result=keep(1,image.create(1,1));',
  'function keep(value:number){return value}let alias=keep;',
  'function keep(value:number){return value}let result=new keep(1);',
  'function keep(value:number){return value}keep=other;keep(20);',
  'function keep(value:number){return value}function keep(value:number){return value+1}keep(20);',
  'class keep{}function keep(value:number){return value}keep(20);',
  'function keep(value:number,value:number){return value}keep(1,2);'
 ])assert.ok(arcadeToPseudocode(source,option).unsupported.some(message=>/Procedure parameter constraint:/.test(message)),source);
});
test('retained constraints never seed Number intrinsic operand producers',()=>{
 const result=arcadeToPseudocode('function format(value:number){return value.toString()}',option);
 assert.ok(result.unsupported.some(message=>/toString|Number/.test(message)),JSON.stringify(result.unsupported));
});

test('only fully certified existing callable factories report an independent route without a new prefix',()=>{
 const source='function make(seed:number){let value=seed;return ()=>{value+=1;return value}}let callback=make(20);let result=callback();';
 const parse=text=>parseMakeCodeTs(text,{parameterDefaults:true,retainCallableMetadata:true});
 const ast=parse(source),prepared=prepareProcedureConstraintSource(ast);
 assert.deepEqual(prepared.diagnostics,[]);assert.deepEqual(prepared.independentRoutes,[{name:'make',protocol:'existing-numeric-callable'}]);
 assert.equal(Object.isFrozen(prepared.independentRoutes),true);assert.equal(Object.isFrozen(prepared.independentRoutes[0]),true);
 assert.deepEqual(prepared.prefix(ast.body[0],'make %s'),[]);
 for(const invalid of [source.replace('make(20)','make(image.create(1,1) as any)'),source+'make=image.create(1,1) as any;']){
  assert.deepEqual(prepareProcedureConstraintSource(parse(invalid)).independentRoutes,[]);
  assert.ok(arcadeToPseudocode(invalid,option).unsupported.length>0);
 }
});

test('Number compound writers require actual Number RHS producers, including captured writers',()=>{
 const operators=['+=','-=','*=','/=','%=','|=','&=','^=','<<=','>>=','>>>='];assert.equal(operators.length,11);
 for(const op of operators)for(const rhs of ['"bad"','image.create(1,1) as any','undefined','unknown','true']){
  const source=`function hold(value:number){value${op}${rhs};return value}hold(20);`;
  assert.ok(arcadeToPseudocode(source,option).unsupported.some(message=>/Procedure parameter constraint:.*compound writer.*Number/.test(message)),source);
 }
 for(const source of [
  'function hold(value:number){game.onUpdate(()=>{value+="bad"})}hold(20);',
  'function hold(value:number){let rhs=1;rhs=image.create(1,1) as any;value+=rhs}hold(20);',
  'function hold(value:string){value+="ok"}hold("20");',
  'function hold(value:string){value++}hold("20");'
 ])assert.ok(arcadeToPseudocode(source,option).unsupported.some(message=>/Procedure parameter constraint:/.test(message)),source);
 for(const source of [
  'function hold(value:number){value+=2;value-=1;return value}let result=hold(20);',
  'function amount(){return 2}function hold(value:number){value+=amount();return value}let result=hold(20);',
  'function hold(value:number){game.onUpdate(()=>{value+=2})}hold(20);',
  'function hold(value:number){value++;--value;return value}let result=hold(20);'
 ])assert.deepEqual(arcadeToPseudocode(source,option).unsupported,[],source);
});
