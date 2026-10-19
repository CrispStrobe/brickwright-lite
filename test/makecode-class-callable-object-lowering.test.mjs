import test from 'node:test';
import assert from 'node:assert/strict';
import {parseMakeCodeTs} from '../overlay/scratch-gui/src/lib/bw-makecode/ts-import.js';
import {lowerCallableValues} from '../overlay/scratch-gui/src/lib/bw-makecode/lower-callable-values.js';
import {lowerObjectClasses} from '../overlay/scratch-gui/src/lib/bw-makecode/lower-object-classes.js';
const source='class State {value:number;constructor(){this.value=1}}class Holder {read:()=>number;state:State;constructor(state:State){this.state=state;this.read=()=>this.state.value}apply<T>(action:(s:State)=>T):T{return action(this.state)}}let state=new State();let holder=new Holder(state);let n=holder.apply((s:State)=>s.value);let text=holder.apply((s:State)=>"ok");';
const lowered=()=>lowerCallableValues(parseMakeCodeTs(source,{retainCallableMetadata:true,retainClassHeritage:true,parameterDefaults:true}),{classPrototype:true});
test('class callback lowering emits exact explicit field and method descriptors only in the prototype',()=>{
    const input=lowered();assert.deepEqual(input.unsupported,[]);
    assert.ok(lowerObjectClasses(input.program).unsupported.length);
    const result=lowerObjectClasses(input.program,{classCallablePrototype:true});assert.deepEqual(result.unsupported,[]);
    const declaration=result.program.body.find(node=>node.expr?.callee?.name==='declare'&&node.expr.args[0].value==='Holder').expr;
    const fields=JSON.parse(declaration.args[1].value),methods=JSON.parse(declaration.args[5].value);
    const read=fields.find(field=>field.name==='read');assert.equal(read.valueKind,'callable');assert.equal(read.type,'callable');assert.equal(read.callableSignature.result.name,'number');
    const apply=methods.find(method=>method.name==='apply');assert.equal(apply.typeParameters[0].name,'T');assert.equal(apply.returnType,'T');assert.equal(apply.parameters[0].type,'callable');assert.deepEqual(apply.parameters[0].callableSignature,apply.callableSignature.parameters[0].type);
    const plan=input.finishClassPlan(result.program.bwClassCallableProcedures);assert.equal(plan.version,2);assert.ok(plan.owners.some(owner=>owner.kind==='constructor'&&owner.receiverParameter==='__bwSelf'));
});
test('class callback lowering refuses edited descriptor authority and non-Boolean activation',()=>{
    const input=lowered();input.program.bwClassCallableDescriptors.classes.find(row=>row.name==='Holder').fields[0].type.result.name='string';
    assert.match(lowerObjectClasses(input.program,{classCallablePrototype:true}).unsupported[0],/differ from actual source/);
    assert.match(lowerObjectClasses(lowered().program,{classCallablePrototype:'true'}).unsupported[0],/explicit Boolean/);
});
