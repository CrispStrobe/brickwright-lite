import test from 'node:test';
import assert from 'node:assert/strict';
import {parseMakeCodeTs} from '../overlay/scratch-gui/src/lib/bw-makecode/ts-import.js';
import {GENERATED_HELPER_PROFILES as profiles,inspectGeneratedHelperBindings,
    normalizeCompilerOwnedLegacyArrayHelpers as normalize} from '../overlay/scratch-gui/src/lib/bw-makecode/generated-helper-recognition.js';
import {LEGACY_PARSE_SOURCE,LEGACY_JSON_SOURCE,ARRAY_ACCESS_SOURCE} from '../overlay/scratch-gui/src/lib/bw-makecode/legacy-array-values.js';
const apply=Reflect.apply,descriptor=Object.getOwnPropertyDescriptor,define=Object.defineProperty;
const parse=(source,profile=profiles.ordinary)=>parseMakeCodeTs(source,profile);
const arraySource=ARRAY_ACCESS_SOURCE+'\nlet values:any[]=[3,4];let answer=__bwArrayAccess(values)';
const nodes=value=>!value||typeof value!=='object'?[]:[value,...Object.values(value).flatMap(v=>Array.isArray(v)?v.flatMap(nodes):nodes(v))];
const using=(target,key,change,operation)=>{const before=descriptor(target,key);let result;
    try{define(target,key,change(before));result=operation();}finally{define(target,key,before);}return result;};
const transparent=(target,key,operation)=>{let calls=0;const result=using(target,key,d=>({...d,value:function(...args){calls++;return apply(d.value,this,args);}}),operation);return{result,calls};};
const helper=(ast,name='__bwArrayAccess')=>ast.body.find(n=>n.type==='FunctionDeclaration'&&n.name===name);
const normalizedArray=ast=>{const result=normalize(ast,profiles.ordinary);assert.equal(helper(result),undefined);
    assert.equal(nodes(result).filter(n=>n.type==='NativeArrayAccess').length,1);return result;};

test('compiler aggregate consumes actual canonical helpers in all parser profiles and retains defaults',()=>{
    for(const profile of Object.values(profiles))for(const [source,name,type]of[
        [LEGACY_PARSE_SOURCE,'__bwNamedParseValue','LegacyParsedValue'],
        [LEGACY_JSON_SOURCE,'__bwNamedJsonValue','LegacyJsonValue'],
        [ARRAY_ACCESS_SOURCE,'__bwArrayAccess','NativeArrayAccess']]){
        const ast=parse(source+'\nfunction companion(other:number=4){return other}\nlet answer='+name+'(7)',profile),fn=ast.body[0];
        const params=fn.params,defaults=descriptor(params,'parameterDefaults'),metadataBefore=JSON.stringify(defaults.value);
        const companion=ast.body.find(n=>n.name==='companion'),companionDefaults=descriptor(companion.params,'parameterDefaults');
        const result=normalize(ast,profile);
        assert.ok(!result.body.includes(fn));assert.equal(nodes(result).filter(n=>n.type===type).length,1);
        assert.equal(fn.params,params);assert.deepEqual(descriptor(params,'parameterDefaults'),defaults);assert.equal(JSON.stringify(defaults.value),metadataBefore);
        const kept=result.body.find(n=>n.name==='companion'),keptDefaults=descriptor(kept.params,'parameterDefaults');
        assert.deepEqual(keptDefaults,companionDefaults);assert.notEqual(keptDefaults.value,companionDefaults.value);
        if(name==='__bwNamedJsonValue'){assert.equal(params.length,2);assert.ok(defaults.value.length);}
    }
});
test('compiler aggregate retains full-body edits, escaped callers and serializer dependencies',()=>{
    const renamed=arraySource.replaceAll('__bwArrayAccess','ownedArray');
    assert.equal(normalize(parse(renamed),profiles.ordinary).body.some(n=>n.type==='FunctionDeclaration'&&n.name==='ownedArray'),false);
    for(const source of [ARRAY_ACCESS_SOURCE.replace('return array','game.splash("effect");return array')+'\nlet answer=__bwArrayAccess([1])',
        arraySource+'\nlet escaped=__bwArrayAccess',
        LEGACY_JSON_SOURCE+'\nlet keep=__bwNamedJsonValue;let answer=__bwNamedJsonValue(7)']){
        const ast=parse(source),before=ast.body.find(n=>n.type==='FunctionDeclaration');
        const result=normalize(ast,profiles.ordinary);assert.ok(result.body.includes(before));
    }
});
test('public proof keeps caller Set callbacks, mutation observation and thrown errors',()=>{
    const ast=parse('function owned(value:number){return value}\nlet answer=owned(3)'),proof=inspectGeneratedHelperBindings(ast,profiles.ordinary);
    const fn=ast.body[0],call=proof.nodes.find(n=>n.type==='Call'&&n.callee?.name==='owned'),parent=proof.parentOf(call),value=fn.body[0].value;
    let hits=0;const original=value.name;
    const internal={has(node){if(node===parent){hits++;value.name=hits===1?'changed':original;}return false;}};
    try{assert.equal(proof.ambient(internal),false);assert.equal(hits,1);assert.equal(proof.isCurrent(),false);}
    finally{value.name=original;}
    assert.equal(proof.isCurrent(),true);assert.equal(proof.root(fn),true);
    const marker=new Error('actual caller has error');assert.throws(()=>proof.ambient({has(){throw marker;}}),error=>error===marker);
    let reads=0;const own=new Set();define(own,'has',{get(){reads++;return()=>false;}});
    assert.equal(proof.ambient(own),true);assert.ok(reads>0);
});
test('changed Set membership selects original slow observation rather than bypassing AST mutation',()=>{
    const ast=parse(arraySource),fn=helper(ast),proof=inspectGeneratedHelperBindings(ast,profiles.ordinary);
    const call=proof.nodes.find(n=>n.type==='Call'&&n.callee?.name==='__bwArrayAccess'),parent=proof.parentOf(call);
    const returnNode=fn.body.find(n=>n.type==='Return').value,original=returnNode.name;let hits=0;
    let result;
    try{result=using(Set.prototype,'has',d=>({...d,value:function(value){
        if(value===parent){hits++;returnNode.name=hits===1?'changed':original;}
        return apply(d.value,this,[value]);
    }}),()=>normalize(ast,profiles.ordinary));}
    finally{returnNode.name=original;}
    assert.ok(hits>0,'actual old membership callback was invoked');assert.ok(result.body.includes(fn));
    normalizedArray(parse(arraySource));
});
test('array method and iterator replacements retain original aggregate output and observations',()=>{
    const expected=normalizedArray(parse(arraySource));
    for(const key of ['every','some','map','filter','flat','includes','push',Symbol.iterator]){
        const ast=parse(arraySource),{result,calls}=transparent(Array.prototype,key,()=>normalize(ast,profiles.ordinary));
        assert.deepEqual(result,expected);if(key!=='flat')assert.ok(calls>0,'actual replacement was observed: '+String(key));
    }
});
test('Map Set WeakMap and native iterator replacements fall back without private membership permission',()=>{
    const expected=normalizedArray(parse(arraySource));
    const rows=[[Map.prototype,'get'],[Map.prototype,'has'],[Set.prototype,'has'],[WeakMap.prototype,'get'],
        [Object.getPrototypeOf(new Set().values()),'next']];
    for(const[target,key]of rows){
        const ast=parse(arraySource),{result}=transparent(target,key,()=>normalize(ast,profiles.ordinary));assert.deepEqual(result,expected);
    }
    const ActualSet=Set;let constructed=0;class ChangedSet extends ActualSet{constructor(...args){super(...args);constructed++;}}
    const ast=parse(arraySource);const result=using(globalThis,'Set',d=>({...d,value:ChangedSet}),()=>normalize(ast,profiles.ordinary));
    assert.ok(constructed>0);assert.deepEqual(result,expected);
});
test('Object Reflect Number and RegExp replacements preserve actual parser metadata and slow behavior',()=>{
    const expected=normalizedArray(parse(arraySource));
    for(const[target,key]of [[Object,'getOwnPropertyDescriptor'],[Reflect,'ownKeys'],[Object,'is'],[Number,'isFinite'],[RegExp.prototype,'exec']]){
        const ast=parse(arraySource),{result}=transparent(target,key,()=>normalize(ast,profiles.ordinary));assert.deepEqual(result,expected);
    }
    const ast=parse(arraySource);let reads=0;define(ast,'foreign',{enumerable:true,get(){reads++;throw Error('must not evaluate foreign getter');}});
    assert.equal(inspectGeneratedHelperBindings(ast,profiles.ordinary).isCurrent(),false);assert.equal(reads,0);
});
test('each completed aggregate reanalyses actual edited defaults and fresh lexical use',()=>{
    const source=LEGACY_JSON_SOURCE+'\nlet answer=__bwNamedJsonValue(7)';
    const first=parse(source);assert.equal(normalize(first,profiles.ordinary).body.some(n=>n.type==='FunctionDeclaration'),false);
    const edited=parse(source),fn=edited.body[0];fn.params.parameterDefaults[0].value={type:'Number',value:'9'};
    assert.equal(inspectGeneratedHelperBindings(edited,profiles.ordinary).isCurrent(),false);
    assert.equal(normalize(edited,profiles.ordinary),edited);
    const escaped=parse(source+'\nlet alias=__bwNamedJsonValue');assert.ok(normalize(escaped,profiles.ordinary).body.includes(escaped.body[0]));
    const fresh=parse(source);assert.equal(normalize(fresh,profiles.ordinary).body.some(n=>n.type==='FunctionDeclaration'),false);
});
