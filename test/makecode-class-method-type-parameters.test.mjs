import test from 'node:test';
import assert from 'node:assert/strict';
import {parseMakeCodeTs} from '../overlay/scratch-gui/src/lib/bw-makecode/ts-import.js';
import {lowerObjectClasses} from '../overlay/scratch-gui/src/lib/bw-makecode/lower-object-classes.js';

const parse=source=>parseMakeCodeTs(source,{retainClassHeritage:true,parameterDefaults:true});

test('generic class method preserves its name, signature and body without phantom fields',()=>{
    const cls=parse('class Holder {value:number;constructor(){this.value=3}applyChange<T>(action:(sb:Holder)=>T):T{return action(this)}}').body[0];
    assert.deepEqual(cls.fields.map(field=>field.name),['value']);
    assert.deepEqual(cls.methods.map(method=>method.name),['applyChange']);
    const method=cls.methods[0];
    assert.deepEqual(method.typeParameters,[{name:'T',constraint:'',defaultType:''}]);
    assert.deepEqual(method.params,['action']);
    assert.equal(method.paramTypes.action.text,'(sb:Holder)=>T');
    assert.equal(method.returnType,'T');
    assert.equal(method.body[0].value.callee.name,'action');
    assert.equal(method.body[0].value.args[0].name,'this');
    assert.deepEqual(cls.unsupported,['generic class methods']);
});

test('nested method constraints and defaults retain their exact type structure',()=>{
    const cls=parse('class Holder {protected static choose<T extends Box<Box<number>>=Box<Box<number>>, U=number[]>(value:T):U{return undefined}}').body[0];
    const method=cls.methods[0];
    assert.equal(method.name,'choose');
    assert.deepEqual(method.typeParameters,[
        {name:'T',constraint:'Box<Box<number>>',defaultType:'Box<Box<number>>'},
        {name:'U',constraint:'',defaultType:'number[]'}
    ]);
    assert.equal(method.isStatic,true);
    assert.deepEqual(method.modifiers,['protected']);
    assert.deepEqual(cls.fields,[]);
});

test('generic method metadata does not admit runtime class construction',()=>{
    const program=parse('class Holder {constructor(){}identity<T>(value:T):T{return value}}let holder=new Holder();let value=holder.identity(2)');
    assert.ok(lowerObjectClasses(program).unsupported.some(reason=>reason.includes('generic class methods')));
});

test('ordinary methods, accessors, defaults and constructor parameter properties remain intact',()=>{
    const cls=parse('class Holder {constructor(public value:number=2){}get current():number{return this.value}set current(next:number){this.value=next}run(step:number=1):number{return this.value+step}}').body[0];
    assert.deepEqual(cls.unsupported,[]);
    assert.deepEqual(cls.methods.map(method=>[method.name,method.kind]),[['current','get'],['current','set'],['run','method']]);
    assert.deepEqual(cls.methods[2].typeParameters,[]);
    assert.deepEqual(cls.methods[2].parameterDefaults.map(value=>value.name),['step']);
    assert.equal(cls.ctor.parameterProperties[0].name,'value');
    assert.equal(cls.ctor.originalBody.length,0);
    assert.equal(cls.fields[0].parameterProperty,true);
});

test('malformed generic members refuse parsing instead of creating bogus fields',()=>{
    for(const [source,reason] of [
        ['class Holder {broken<T>:number}',/class method type parameters/],
        ['class Holder {broken<T extends>(value:T){}}',/generic constraint/],
        ['class Holder {broken<T= >(value:T){}}',/generic default/],
        ['class Holder {broken<T=>(value:T){}}',/expected > but found "=>"/]
    ]) assert.throws(()=>parse(source),reason);
    const cls=parse('class Holder {constructor<T>(){}}').body[0];
    assert.deepEqual(cls.unsupported,['generic class constructors']);
});

test('method type delimiters do not change ordinary shift assignment parsing',()=>{
    const program=parse('function choose<T extends Box<number>=Box<number>>(value:T):T{return value}let mask=8;mask>>=1;');
    assert.deepEqual(program.body[0].typeParameters,[{name:'T',constraint:'Box<number>',defaultType:'Box<number>'}]);
    assert.equal(program.body[2].expr.op,'>>=');
    assert.equal(program.body[2].expr.right.value,'1');
});
