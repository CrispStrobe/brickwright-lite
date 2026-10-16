import test from 'node:test';
import assert from 'node:assert/strict';
import {pathToFileURL,fileURLToPath} from 'node:url';
import path from 'node:path';
import {BUTTON_REGISTRATION_SOURCE} from './fixtures/arcade-button-registration.mjs';
// A finite reviewed baseline/candidate packet may select an exact source tree.
// Normal CI always uses this checkout; this test option changes no product proof.
const root=process.env.BW_BUTTON_EVENT_SOURCE_ROOT || fileURLToPath(new URL('../',import.meta.url));
const module=relative=>import(pathToFileURL(path.join(root,relative)));
const {parseMakeCodeTs}=await module('overlay/scratch-gui/src/lib/bw-makecode/ts-import.js');
const {analyseSourceValueProducers}=await module('overlay/scratch-gui/src/lib/bw-makecode/source-value-producers.js');
const {validateProcedureConstraintSource}=await module('overlay/scratch-gui/src/lib/bw-makecode/procedure-constraint-source.js');
const {arcadeToPseudocode}=await module('overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js');
const parse=source=>parseMakeCodeTs(source,{parameterDefaults:true,retainCallableMetadata:true});
const options={unboundIsOpaque:true,opaqueDeclarationValues:true,ordinaryPrimitiveSdkNumbers:true};
const call=(program,name='accept')=>program.body.find(node=>node.type==='ExpressionStatement'&&node.expr?.type==='Call'&&node.expr.callee?.name===name).expr;
const wrap=(prefix='',suffix='',argument='ControllerButtonEvent.Released')=>`function accept(event:number){return event}\n${prefix}\naccept(${argument});\n${suffix}`;
const argumentTypes=source=>{const ast=parse(source);return [...analyseSourceValueProducers(ast,options).typesAt(call(ast).args[0])];};
const refuses=source=>assert.ok(validateProcedureConstraintSource(parse(source),{ordinaryPrimitiveSdkNumbers:true}).some(message=>message.includes('accept.event requires Number')),source);

test('unchanged real registration fixture retains all typed calls and Released numeric payload',()=>{
 const imported=arcadeToPseudocode(BUTTON_REGISTRATION_SOURCE);
 assert.deepEqual(imported.unsupported,[]);assert.ok(imported.code.includes('2048'));assert.ok(imported.code.includes('arcade register button'));
});
test('only the three actual builtin event leaves produce their existing Number payloads',()=>{
 for(const [name,value]of [['Pressed',2049],['Released',2048],['Repeated',2054]]){
  const source=wrap('','',`ControllerButtonEvent.${name}`);assert.deepEqual(argumentTypes(source),['Number']);
  assert.deepEqual(validateProcedureConstraintSource(parse(source),{ordinaryPrimitiveSdkNumbers:true}),[]);
  const imported=arcadeToPseudocode(source);assert.deepEqual(imported.unsupported,[]);assert.ok(imported.code.includes(String(value)));
 }
});
test('default producer analysis remains unchanged and an annotation never supplies a value',()=>{
 const ast=parse(wrap());assert.deepEqual([...analyseSourceValueProducers(ast,{unboundIsOpaque:true,opaqueDeclarationValues:true}).typesAt(call(ast).args[0])],['Opaque']);
 const unused=parse('function accept(event:number){return event}'),read=unused.body[0].body[0].value;
 assert.deepEqual([...analyseSourceValueProducers(unused,options).typesAt(read)],[]);
 refuses(wrap('let event:number;','','event'));
});
test('actual scalar aliases qualify but all bad later writers and mixed callers still refuse',()=>{
 assert.deepEqual(argumentTypes(wrap('let event=ControllerButtonEvent.Released;','','event')),['Number']);
 refuses(wrap('let event:any=ControllerButtonEvent.Released;','event="wrong";','event'));
 refuses(wrap('','accept("2048");'));
});
test('unknown member and fake object spelling cannot seed a builtin event Number',()=>{
 refuses(wrap('','','ControllerButtonEvent.Unknown'));
 refuses(wrap('let ControllerButtonEvent:any={Released:2048};'));
});
test('actual namespace parameter and block or function local shadowing refuse',()=>{
 for(const source of [
  'function accept(event:number){} function use(ControllerButtonEvent:any){accept(ControllerButtonEvent.Released)} use(1)',
  'function accept(event:number){} {let ControllerButtonEvent:any=1;accept(ControllerButtonEvent.Released)}',
  'function accept(event:number){} function use(){var ControllerButtonEvent:any=1;accept(ControllerButtonEvent.Released)} use()'
 ])assert.ok(validateProcedureConstraintSource(parse(source),{ordinaryPrimitiveSdkNumbers:true}).length,source);
});
test('declarations named like the enum do not become builtin namespace authority',()=>{
 for(const prefix of ['function ControllerButtonEvent(){}','class ControllerButtonEvent{}','enum ControllerButtonEvent{Released=2048}'])refuses(wrap(prefix));
});
test('a separate shadowed local name without receiver effects does not poison the genuine outer leaf',()=>{
 assert.deepEqual(argumentTypes(wrap('function unused(ControllerButtonEvent:any){let local=ControllerButtonEvent;}')),['Number']);
});
test('direct root and member writes before or after a read invalidate readonly authority',()=>{
 for(const writer of ['ControllerButtonEvent=other','ControllerButtonEvent.Released=2048','ControllerButtonEvent.Released+=1','ControllerButtonEvent.Released++','delete ControllerButtonEvent.Released']){
  refuses(wrap(writer+';'));refuses(wrap('',writer+';'));
 }
});
test('configured unused functions and controller registration mutations remain in the writer census',()=>{
 refuses(wrap('function unused(){ControllerButtonEvent.Released=2048;}'));
 refuses(wrap('controller.A.onEvent=other;'));
});
test('namespace object escapes and reflective mutation are never readonly leaf proof',()=>{
 for(const prefix of ['let alias=ControllerButtonEvent;','Object.defineProperty(ControllerButtonEvent,"Released",other);','Reflect.set(ControllerButtonEvent,"Released",2048);'])refuses(wrap(prefix));
});
test('computed member and constructor-key aliases retain the conservative refusal',()=>{
 refuses(wrap('','','ControllerButtonEvent["Released"]'));
 refuses(wrap('let fn:any=()=>0;let build=fn["con"+"structor"];build("ControllerButtonEvent.Released=99")();'));
 refuses(wrap('let key="constructor";let fn:any=()=>0;fn[key]("ControllerButtonEvent.Released=99")();'));
});
test('ambient handles dynamic code and unresolved receiver effects cannot certify a leaf',()=>{
 for(const prefix of ['let g=globalThis;','let g=window;','let g=self;','eval("ControllerButtonEvent.Released=99");','Function("ControllerButtonEvent.Released=99")();','let g=this;'])refuses(wrap(prefix));
});
test('actual unknown callees and escaped or reassigned ordinary functions are not closed effects',()=>{
 refuses(wrap('unknown();'));
 refuses(wrap('function effect(){} let alias=effect;'));
 refuses(wrap('function effect(){} effect=other;effect();'));
});
test('known unique ordinary call bodies stay closed while duplicate declarations do not',()=>{
 assert.deepEqual(argumentTypes(wrap('function effect(){let n=1;} effect();')),['Number']);
 refuses(wrap('function effect(){} function effect(){} effect();'));
 refuses(wrap('function effect(){} let effect:any=other;effect();'));
});
test('Unknown source stays present and unadmitted rather than granting a Number',()=>{
 const ast=parse(wrap());ast.body.push({type:'Unknown',raw:'retained unsupported source'});
 assert.deepEqual([...analyseSourceValueProducers(ast,options).typesAt(call(ast).args[0])],['Opaque']);
 assert.ok(validateProcedureConstraintSource(ast,{ordinaryPrimitiveSdkNumbers:true}).some(message=>message.includes('accept.event requires Number')));
 assert.equal(ast.body.at(-1).raw,'retained unsupported source');
});

test('a genuine parsed leaf reused as an earlier writer cannot borrow its later call parent',()=>{
 const ast=parse(wrap()),leaf=call(ast).args[0];
 const writer=parse('ControllerButtonEvent.Released=9;').body[0];writer.expr.left=leaf;
 ast.body.splice(1,0,writer);
 assert.ok(validateProcedureConstraintSource(ast,{ordinaryPrimitiveSdkNumbers:true}).some(message=>message.includes('accept.event requires Number')));
 assert.notDeepEqual([...analyseSourceValueProducers(ast,options).typesAt(leaf)],['Number']);
});

// The surrounding graph has its own pre-existing AST domain; this control
// checks this helper's refusal before its recursive proof dependencies run.
test('the enum helper refuses cyclic or shared executable containers before lexical traversal',async()=>{
 const {controllerButtonEventNumberLeaves}=await module('overlay/scratch-gui/src/lib/bw-makecode/controller-button-event-number-source.js');
 const ast=parse(wrap()),leaf=call(ast).args[0];ast.body.push(ast);
 assert.equal(controllerButtonEventNumberLeaves(ast).has(leaf),false);
 const container=parse(wrap()),other=call(container).args[0];container.body.push(container.body);
 assert.equal(controllerButtonEventNumberLeaves(container).has(other),false);
 const shared=parse(wrap()),actual=call(shared).args[0];shared.body.push(shared.body[0]);
 assert.equal(controllerButtonEventNumberLeaves(shared).has(actual),false);
});

test('delete source grammar remains an explicit refusal and a real Unary operand cannot be readonly',async()=>{
 const {controllerButtonEventNumberLeaves}=await module('overlay/scratch-gui/src/lib/bw-makecode/controller-button-event-number-source.js');
 const source=parse(wrap('delete ControllerButtonEvent.Released;'));
 // The current parser retains delete as an unresolved Identifier statement,
 // not a supported deletion operation. It must invalidate the closed proof.
 assert.ok(source.body.some(node=>node.type==='ExpressionStatement'&&node.expr?.type==='Identifier'&&node.expr.name==='delete'));
 assert.equal(controllerButtonEventNumberLeaves(source).has(call(source).args[0]),false);
 const ast=parse(wrap()),read=call(ast).args[0],target=parse('ControllerButtonEvent.Released;').body[0].expr;
 ast.body.splice(1,0,{type:'ExpressionStatement',expr:{type:'Unary',op:'delete',argument:target}});
 assert.equal(controllerButtonEventNumberLeaves(ast).has(read),false);
});

test('unresolved identifier reads anywhere refuse closed effects while real lexical reads remain closed',()=>{
 refuses(wrap('unresolved;'));
 refuses(wrap('function unused(){unresolved;}'));
 refuses(wrap('let value=unresolved;'));
 assert.deepEqual(argumentTypes(wrap('let unresolved=1;unresolved;function unused(){let local=unresolved;}')),['Number']);
});
