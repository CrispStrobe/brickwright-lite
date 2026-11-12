import test from 'node:test';
import assert from 'node:assert/strict';
import {parseMakeCodeTs} from '../overlay/scratch-gui/src/lib/bw-makecode/ts-import.js';
import {analyseSourceValueProducers} from '../overlay/scratch-gui/src/lib/bw-makecode/source-value-producers.js';
import {GENERATED_HELPER_PROFILES} from '../overlay/scratch-gui/src/lib/bw-makecode/generated-helper-recognition.js';
import {nativeArrayAddHelperSource,inspectNativeArrayAddHelpers} from '../overlay/scratch-gui/src/lib/bw-makecode/native-array-binary-helper-source.js';
import {inspectNativeArrayBinaryDomains} from '../overlay/scratch-gui/src/lib/bw-makecode/native-array-binary-domain.js';
const options={arrayValues:true,arrayEffectSites:true,parenthesized:true,unboundIsOpaque:true,
    uninitializedLocalsAreOpaque:true,declaredLocalUndefined:true,initializationEntries:true};
const parse=source=>parseMakeCodeTs(source,GENERATED_HELPER_PROFILES.ordinary);
const lengthOf=ast=>{
    let found;
    const visit=node=>{if(!node||typeof node!=='object')return;if(Array.isArray(node)){node.forEach(visit);return;}
        if(node.type==='Member'&&node.name==='length')found=node;
        for(const [key,value]of Object.entries(node))if(!['originalBody','paramTypes','parameterDefaults'].includes(key))visit(value);
    };visit(ast);assert.ok(found);return found;
};
const analyse=source=>{const ast=parse(source),length=lengthOf(ast),graph=analyseSourceValueProducers(ast,options);return {ast,length,graph};};
const number=source=>{const row=analyse(source);assert.deepEqual([...row.graph.typesAt(row.length)],['Number'],source);return row;};
const refused=source=>{const row=analyse(source);assert.notDeepEqual([...row.graph.typesAt(row.length)],['Number'],source);return row;};
const helper=nativeArrayAddHelperSource('__bwBinaryAdd',true,true);
const domain=source=>inspectNativeArrayBinaryDomains(parse(helper+';'+source),GENERATED_HELPER_PROFILES.ordinary);
const candidate=source=>inspectNativeArrayAddHelpers(parse(helper+';'+source),GENERATED_HELPER_PROFILES.ordinary);
const inheritedWriter=(kind,withHelper=false)=>{
    // The explicit second null write keeps the target on the NEW mixed route
    // even when a missing initializer is supplied by Object.prototype.
    const source='let frames=null;frames=null;0;let count=frames.length;'+(withHelper?'let out=__bwBinaryAdd(count,0);':'');
    const ast=parse((withHelper?helper+';':'')+source),length=lengthOf(ast);
    const prototype=kind==='body'?Array.prototype:Object.prototype;
    const anchor=ast.body.findIndex(node=>node.type==='ExpressionStatement'&&node.expr?.type==='Number');
    const key=kind==='body'?String(anchor):'init';
    const saved=Object.getOwnPropertyDescriptor(prototype,key),savedLength=Object.getOwnPropertyDescriptor(Array.prototype,'length');
    if(kind==='body')delete ast.body[anchor];
    else delete ast.body.find(node=>node.type==='Declaration'&&node.decls[0].name==='frames').decls[0].init;
    const allocation={type:'Array',items:[]};
    const value=kind==='body'?{type:'Declaration',kind:'let',decls:[{name:'frames',init:allocation}]}:allocation;
    let result;
    try {
        Object.defineProperty(prototype,key,{value,writable:true,configurable:true,enumerable:false});
        if(withHelper){
            const syntax=inspectNativeArrayAddHelpers(ast,GENERATED_HELPER_PROFILES.ordinary);
            result={proof:inspectNativeArrayBinaryDomains(ast,GENERATED_HELPER_PROFILES.ordinary),syntaxCount:syntax.helpers.size};
        }
        else result=analyseSourceValueProducers(ast,options);
    }finally{
        if(saved)Object.defineProperty(prototype,key,saved);else delete prototype[key];
        Object.defineProperty(Array.prototype,'length',savedLength);
    }
    return {ast,length,result};
};
const fakeWriter=(ast,genuine)=>{
    const anchor=ast.body.find(node=>node.type==='ExpressionStatement'&&node.expr?.type==='Number');
    assert.ok(anchor,'counterfeit record is attached outside a genuine executable edge');
    anchor.fakeDeclaration={type:'Declaration',kind:'let',decls:[{name:'frames',init:genuine?
        {type:'Identifier',name:'actual'}:{type:'Array',items:[]}}]};
};

test('nullable genuine Image Array length has only a Number normal result without changing receiver facts',()=>{
    const row=number('let frames:Image[]=null;frames=[img`1`,img`2`];frames=undefined;let count=frames.length;');
    const types=row.graph.typesAt(row.length.object);
    assert.ok(types.has('Null'));assert.ok(types.has('Undefined'));
    assert.equal([...types].filter(type=>type?.kind==='Array').length,1);
    assert.equal(row.graph.arrayAllocationsAt(row.length.object).length,0,'strict all-Array authority is unchanged');
    assert.equal(row.graph.possibleArrayAllocationsAt(row.length.object).length,1);
    assert.equal(row.graph.isInitializedAt(row.length.object),true,'actual assignments still establish initialization');
});

test('closed actual factory returns and aliases preserve nullish alternatives and genuine allocation provenance',()=>{
    const schema=parse('function fresh(flag:boolean){if(flag)return [img`1`];return undefined}');
    const branch=schema.body[0].body[0];
    assert.equal(branch.type,'If');assert.equal(Object.hasOwn(branch,'alternate'),true);
    assert.equal(branch.alternate,null,'parser represents no else by an own null child');
    const row=number('function fresh(flag:boolean){if(flag)return [img`1`];return undefined}let frames:Image[]=null;let temporary:Image[]=null;temporary=fresh(true);frames=temporary;let alias=frames;let count=alias.length;');
    const receiver=row.graph.typesAt(row.length.object);
    assert.ok(receiver.has('Null'));assert.ok(receiver.has('Undefined'));
    assert.equal([...receiver].filter(type=>type?.kind==='Array').length,1);
    assert.equal(row.graph.arrayMapReceiverSafeAt(row.length.object),false);
});

test('Array element Image object and nullish values do not become flat primitive or element authority',()=>{
    const row=number('let frames:any[]=null;frames=[img`1`,{},null,undefined];let count=frames.length;');
    assert.equal(row.graph.arrayElementTypesAt(row.length.object).size,0,'strict element facade stays unavailable on mixed receiver');
    assert.equal(candidate('let frames:any[]=null;frames=[img`1`,{}];let text=__bwBinaryAdd(frames,"!");').helpers.size,1,'flat-coercion negative reaches a genuine canonical helper');
    const proof=domain('let frames:any[]=null;frames=[img`1`,{}];let text=__bwBinaryAdd(frames,"!");');
    assert.equal(proof.helpers.size,0,'Image/object Array does not gain native join/coercion proof');
    number('let frames=null;frames=[];let count=frames.length;');
});

test('nullish-only foreign unknown annotated and non-Array length receivers never gain the nullable theorem',()=>{
    refused('let other={};let frames=null;frames=[1];other.length;let count=frames.length;');
    number('let other=[];let frames=null;frames=[1];other.length;let count=frames.length;');
    for(const genuine of [false,true]){
        const ast=parse((genuine?'let actual=[];':'')+'let frames=null;0;let count=frames.length;');
        fakeWriter(ast,genuine);
        const length=lengthOf(ast),graph=analyseSourceValueProducers(ast,options);
        assert.equal(graph.possibleArrayAllocationsAt(length.object).length,1,'the older general traversal observes the counterfeit flow');
        assert.notDeepEqual([...graph.typesAt(length)],['Number'],'new authority requires every contributing executable edge, not just a genuine allocation token');
    }
    for(const kind of ['body','initializer']){
        const row=inheritedWriter(kind);
        assert.equal(row.result.possibleArrayAllocationsAt(row.length.object).length,1,'older traversal observes the inherited writer');
        assert.notDeepEqual([...row.result.typesAt(row.length)],['Number'],'only dense own grammar edges can supply NEW authority');
    }
    for(const source of [
        'let frames:Image[]=null;frames=undefined;let count=frames.length;',
        'let frames:Image[];let count=frames.length;',
        'let frames=null;frames={length:"wrong"};let count=frames.length;',
        'let frames=null;frames=[1];frames=foreign;let count=frames.length;',
        'let frames=null;frames=foreign();let count=frames.length;',
        'let frames=null;frames="text";let count=frames.length;'
    ])refused(source);
});

test('additional nullable route refuses reflection defaults callbacks foreign calls and possible-token method escapes',()=>{
    for(const effect of ['foreign','foreign(frames)','foreign()','eval("frames = {}")','let run=eval;run("frames = {}")',
        'let proxy=new Proxy(frames,{})','frames.push(2)','frames[0]=2','frames.join=function(){return "x"}',
        'function use(arg=foreign()){return 0}use()','register(function(){frames={length:"x"}})',
        'function take(value:any){return value}let escaped=take;']){
        refused('let frames=null;frames=[1];'+effect+';let count=frames.length;');
    }
    const old=analyse('let frames=[1];foreign(frames);let count=frames.length;');
    assert.deepEqual([...old.graph.typesAt(old.length)],['Number'],'this theorem does not pretend to repair the older exact-Array route');
});

test('later actual writers returns and formals revoke provisional Number rather than removing unknown alternatives',()=>{
    for(const source of [
        'let frames=null;frames=[1];let count=frames.length;frames={length:"x"};',
        'function select(flag:boolean){if(flag)return [1];return {length:"x"}}let frames=null;frames=select(true);let count=frames.length;',
        'function same(input:any){return input}let frames=null;frames=same([1]);frames=same({length:"x"});let count=frames.length;',
        'let frames=null;frames=[1];function change(){frames={length:"x"}}change();let count=frames.length;'
    ]){
        const row=refused(source);
        assert.ok(row.graph.typesAt(row.length.object).has('Opaque'),'all real foreign writers remain visible');
    }
});

test('native scalar-only helper consumers retain length effect obligations without activating flat Array operand gates',()=>{
    assert.equal(candidate('let other={};let frames=null;frames=[1];other.length;let count=frames.length;let out=__bwBinaryAdd(count,0);').helpers.size,1,'unrelated getter negative has a genuine syntax candidate');
    const unrelated=domain('let other={};let frames=null;frames=[1];other.length;let count=frames.length;let out=__bwBinaryAdd(count,0);');
    assert.equal(unrelated.helpers.size,0,'unproved unrelated length can execute an inherited getter');
    for(const genuine of [false,true]){
        const ast=parse(helper+';'+(genuine?'let actual=[];':'')+'let frames=null;0;let count=frames.length;let out=__bwBinaryAdd(count,0);');
        fakeWriter(ast,genuine);
        assert.equal(inspectNativeArrayAddHelpers(ast,GENERATED_HELPER_PROFILES.ordinary).helpers.size,1,'counterfeit-flow negative reaches canonical helper selection');
        assert.equal(inspectNativeArrayBinaryDomains(ast,GENERATED_HELPER_PROFILES.ordinary).helpers.size,0,'scalar-only helper cannot borrow counterfeit declaration/alias edges');
    }
    for(const kind of ['body','initializer']){
        const row=inheritedWriter(kind,true);
        assert.equal(row.result.syntaxCount,1,'inherited-edge negative retains a genuine canonical helper');
        assert.equal(row.result.proof.helpers.size,0,'inherited executable input cannot supply scalar-only length authority');
    }
    number('let frames=null;frames=[img`1`];let count=0;count=frames.length;');
    assert.equal(candidate('let frames=null;frames=[img`1`];let out=__bwBinaryAdd(frames.length,0);').helpers.size,1,'positive selects the exact canonical body and complete calls');
    const direct=domain('let frames=null;frames=[img`1`];let out=__bwBinaryAdd(frames.length,0);');
    assert.equal(direct.reason,null);assert.equal(direct.helpers.size,1,'actual nullable length, not an earlier count initializer, supplies this operand');
    const good=domain('let frames=null;frames=[img`1`];let count=0;count=frames.length;let out=__bwBinaryAdd(count,0);');
    assert.equal(good.reason,null);assert.equal(good.helpers.size,1);assert.equal(good.current(),true);
    for(const effect of ['foreign','foreign(frames)','foreign()','eval("frames={}")','register(function(){frames={}})',
        'frames.push(2)','function use(value=foreign()){return 0}use()']){
        const source='let frames=null;frames=[img`1`];'+effect+';let count=frames.length;let out=__bwBinaryAdd(count,0);';
        const syntax=candidate(source);
        assert.equal(syntax.helpers.size,effect.startsWith('eval(')?0:1,'distinguish existing reflection syntax refusal from a genuine helper domain obligation');
        refused('let frames=null;frames=[img`1`];'+effect+';let count=frames.length;');
        const result=domain(source);
        assert.equal(result.helpers.size,0,'no direct Array helper operand can accidentally activate old flat-domain gates: '+effect);
    }
});

test('pre-query source mutation and observed physical ABA sticky-revoke every additional length-derived result',()=>{
    const source='let frames=null;frames=[img`1`];let count=frames.length;';
    const row=number(source),saved=row.ast.body[1].expr.right;
    row.ast.body[1].expr.right={type:'Object',props:[],calls:[]};
    assert.equal(row.graph.nullableArrayLengthCurrent(),false);
    assert.equal(row.graph.typesAt(row.length).size,0);
    row.ast.body[1].expr.right=saved;
    assert.equal(row.graph.typesAt(row.length).size,0,'observed ABA cannot revive this graph');
    const before=analyse(source);before.ast.body.push({type:'ExpressionStatement',expr:{type:'Call',callee:{type:'Identifier',name:'foreign'},args:[]}});
    assert.equal(before.graph.typesAt(before.length).size,0,'first type query still uses the original pre-analysis physical baseline');
});
