import test from 'node:test';
import assert from 'node:assert/strict';
import {parseMakeCodeTs} from '../overlay/scratch-gui/src/lib/bw-makecode/ts-import.js';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {analyseSourceValueProducers,validateCompilerOwnedProcedureConstraintSource as complete,
    validateProcedureConstraintSource as directPublic} from '../overlay/scratch-gui/src/lib/bw-makecode/source-value-producers.js';
import {validateProcedureConstraintSource as publicValidate,prepareProcedureConstraintSource,
    prepareProcedureConstraintSourceForTranslation} from '../overlay/scratch-gui/src/lib/bw-makecode/procedure-constraint-source.js';
import {CAMERA_SOURCE} from './fixtures/arcade-camera.mjs';
const parse=source=>parseMakeCodeTs(source,{parameterDefaults:true,retainCallableMetadata:true});
const options={ordinaryPrimitiveSdkNumbers:true,sceneClockNumbers:true};
const wrap=(before='',after='',argument='CameraProperty.X')=>`function accept(property:number){return property}\n${before}\nlet result=accept(${argument});\n${after}`;
const diagnostic=messages=>messages.some(message=>message.includes('accept.property requires Number from actual producers'));
const refuse=source=>assert.ok(diagnostic(complete(parse(source),options)),source);
const apply=Reflect.apply,descriptor=Object.getOwnPropertyDescriptor,define=Object.defineProperty;
function using(target,key,change,operation){const before=descriptor(target,key);try{define(target,key,change(before));return operation();}finally{define(target,key,before);}}
const argument=ast=>ast.body.find(node=>node.type==='Declaration'&&node.decls.some(d=>d.name==='result')).decls.find(d=>d.name==='result').init.args[0];
const outcome=operation=>{try{return{kind:'return',value:operation()};}catch(error){return{kind:'throw',error};}};

test('actual camera fixture retains its typed helper and complete public import without source replacement',()=>{
    assert.match(CAMERA_SOURCE,/function cameraValue\(property:number\)/);
    assert.match(CAMERA_SOURCE,/cameraValue\(CameraProperty\.X\)/);
    assert.match(CAMERA_SOURCE,/cameraValue\(CameraProperty\.Y\)/);
    const actual=arcadeToPseudocode(CAMERA_SOURCE);
    assert.deepEqual(actual.unsupported,[]);assert.deepEqual(actual.warnings,[]);
    assert.equal(typeof actual.code,'string');assert.match(actual.code,/arcade camera property/);
    assert.match(actual.code,/cameraValue/);assert.match(actual.code,/declare arcade procedure/);
});
test('only compiler completed validation gains six canonical numeric leaves and actual scalar forwarding',()=>{
    assert.equal(publicValidate,directPublic,'one unchanged public validator binding');
    for(const name of ['X','Y','Left','Right','Top','Bottom']){
        const source=wrap('','',`CameraProperty.${name}`),ast=parse(source);
        assert.deepEqual(complete(ast,options),[]);
        assert.ok(diagnostic(publicValidate(ast,options)),'public validator remains on its original graph');
        assert.deepEqual([...analyseSourceValueProducers(ast,{unboundIsOpaque:true,opaqueDeclarationValues:true,ordinaryPrimitiveSdkNumbers:true}).typesAt(argument(ast))],['Opaque']);
        const imported=arcadeToPseudocode(source);assert.deepEqual(imported.unsupported,[]);assert.deepEqual(imported.warnings,[]);
    }
    assert.deepEqual(complete(parse(wrap('let picked=CameraProperty.Left;','','picked')),options),[]);
    refuse(wrap('let picked:any=CameraProperty.Left;','picked="wrong";','picked'));
    refuse(wrap('','accept("2");'));
    refuse(wrap('let picked:number;','','picked'));
});
test('per-use lexical identity refuses real shadows and uncertain forms without poisoning unrelated scopes',()=>{
    for(const prefix of ['let CameraProperty:any={X:0};','function CameraProperty(){}',
        'class CameraProperty{}','enum CameraProperty{X=0}'])refuse(wrap(prefix));
    // These old fixture-policy negatives are intentionally superseded: an
    // unrelated scope cannot change the actual SDK binding at the selected use.
    for(const prefix of ['function unused(CameraProperty:any){return CameraProperty.X}',
        '{let CameraProperty:any=0;}','function effect(){}function effect(){}effect();']){
        assert.deepEqual(complete(parse(wrap(prefix)),options),[]);
    }
    refuse(wrap('','','CameraProperty.Missing'));
    refuse(wrap('','','(CameraProperty as any).X'));
    refuse(wrap('','','CameraProperty["X"]'));
    const loop='function accept(property:number){return property}\nfor(let CameraProperty of [1]){accept(CameraProperty.X)}';
    assert.ok(complete(parse(loop),options).length);
    const local='function accept(property:number){return property}function shadow(CameraProperty:any){accept(CameraProperty.X)}';
    assert.ok(complete(parse(local),options).length);
});
test('enum root mutation escape and dynamic lexical effects refuse while unrelated effects retain canonical Number',()=>{
    for(const effect of ['CameraProperty=other;','CameraProperty.X=0;','CameraProperty.X+=1;',
        'CameraProperty.X++;','delete CameraProperty.X;','let alias=CameraProperty;',
        'unknown(CameraProperty);','eval("CameraProperty.X=9");',
        'Function("CameraProperty.X=9")();','Object.defineProperty(CameraProperty,"X",other);',
        'Reflect.set(CameraProperty,"X",9);']){
        refuse(wrap(effect));refuse(wrap('',effect));
    }
    const safe='let art=image.create(2,2);art.fill(3);let hero=sprites.create(art,SpriteKind.Player);hero.setPosition(1,2);';
    const unrelated=['unknown();','let ambient=globalThis;',
        'function effect(){}let alias=effect;','let fake:any=other;fake.setPosition(1,2);',
        safe,safe+'hero=other;',safe.replace('sprites.create(art,SpriteKind.Player)','other()'),
        safe.replace('hero.setPosition(1,2)','hero.missing(1,2)')];
    for(const effect of unrelated){
        assert.deepEqual(complete(parse(wrap(effect)),options),[]);
        assert.deepEqual(complete(parse(wrap('',effect)),options),[]);
    }
    // No Image/Sprite operation is certified by the enum fact. Existing public
    // translation still reports an unknown source operation independently.
    const unknown=arcadeToPseudocode(wrap('unknown();'));
    assert.ok(unknown.unsupported.length>0);
    assert.equal(unknown.unsupported.some(message=>message.includes('accept.property requires Number')),false);
});
test('fresh completion observes physical argument declaration metadata and unknown source changes',()=>{
    const ast=parse(wrap());assert.deepEqual(complete(ast,options),[]);
    const leaf=argument(ast),originalName=leaf.name;leaf.name='Missing';
    assert.ok(diagnostic(complete(ast,options)));leaf.name=originalName;
    assert.deepEqual(complete(ast,options),[],'a new complete derivation can qualify restored actual source');
    const owner=leaf.object;leaf.object={type:'Identifier',name:'other'};
    assert.ok(diagnostic(complete(ast,options)));leaf.object=owner;
    leaf.assertedType={text:'number'};assert.ok(diagnostic(complete(ast,options)));delete leaf.assertedType;
    ast.body.push({type:'Unknown',raw:'retained unproved effect'});assert.ok(diagnostic(complete(ast,options)));
    ast.body.pop();assert.deepEqual(complete(ast,options),[]);
    const replacement=structuredClone(leaf);const decl=ast.body.find(n=>n.type==='Declaration').decls[0];decl.init.args[0]=replacement;
    assert.deepEqual(complete(ast,options),[],'fresh complete derivation checks actual replacement rather than old node identity');
    assert.equal(Object.hasOwn(ast,'cameraNumberInput'),false,'no certificate is attached to caller AST');
});
test('changed constructors prototypes iterator JSON and global alias choose original fallback without getters',()=>{
    const originalGlobal=globalThis;
    for(const[target,key]of [[Array.prototype,'every'],[Array.prototype,'some'],[Map.prototype,'get'],[Set.prototype,'has'],
        [Object.getPrototypeOf(new Map().entries()),'next'],[Object.getPrototypeOf(new Set().values()),'next'],
        [JSON,'stringify']]){
        const ast=parse(wrap());let calls=0;
        const result=using(target,key,d=>({...d,value:function(...args){calls++;return apply(d.value,this,args);}}),()=>complete(ast,options));
        assert.ok(diagnostic(result),'changed intrinsic cannot retain new Camera fact: '+String(key));
        assert.deepEqual(complete(parse(wrap()),options),[],'fresh initial-realm derivation after restoration');
        if(key==='get'||key==='has')assert.ok(calls>0,'old original analysis still observes altered intrinsic');
    }
    let globalReads=0;const ast=parse(wrap());
    const result=using(originalGlobal,'globalThis',d=>({enumerable:d.enumerable,configurable:d.configurable,get(){globalReads++;throw Error('unexpected global alias getter');}}),()=>complete(ast,options));
    assert.equal(globalReads,0);assert.ok(diagnostic(result));
    const alias=using(originalGlobal,'globalThis',d=>({...d,value:{}}),()=>complete(parse(wrap()),options));assert.ok(diagnostic(alias));
    const withToJSON=parse(wrap()),before=descriptor(Object.prototype,'toJSON');let serialized=0;let observed;
    try{define(Object.prototype,'toJSON',{configurable:true,value(){serialized++;return this;}});observed=complete(withToJSON,options);}
    finally{if(before)define(Object.prototype,'toJSON',before);else delete Object.prototype.toJSON;}
    assert.ok(diagnostic(observed));assert.ok(serialized>0,'existing original serializers remain observable on fallback');
});
test('foreign Set and getter errors retain exact single original observations and cannot revive in one completion',()=>{
    const marker=new Error('actual caller membership error');let hasCalls=0;
    assert.throws(()=>complete(parse(wrap()),{...options,onlyFunctions:{has(){hasCalls++;throw marker;}}}),error=>error===marker);
    assert.equal(hasCalls,1,'observer fallback never catches and retries original error');
    for(const validate of [publicValidate,complete]){
        const ast=parse(wrap());let reads=0;const error=new Error('actual source getter error');
        define(ast,'foreign',{enumerable:true,get(){reads++;throw error;}});
        assert.throws(()=>validate(ast,options),value=>value===error);assert.equal(reads,1);
    }
    const ast=parse(wrap()),leaf=argument(ast),before=leaf.name;let changed=0;let result;
    result=using(Set.prototype,'has',d=>({...d,value:function(value){
        if(value==='accept'){changed++;leaf.name=changed===1?'Missing':before;}
        return apply(d.value,this,[value]);
    }}),()=>complete(ast,{...options,onlyFunctions:new Set(['accept'])}));
    leaf.name=before;assert.ok(diagnostic(result),'fallback cannot reopen private Camera derivation after a later restoration');
    assert.ok(changed>0);assert.deepEqual(complete(ast,options),[],'later invocation performs a fresh complete derivation');
});
test('absence public eager Throw defaults and original error options preserve complete validation passes',()=>{
    for(const source of ['function accept(value:number){return value}let result=accept(3);',
        'function accept(value:number){return value}let result=accept("wrong");',
        'function accept(value:number){if(value<0)throw 1;return value}let result=accept(3);',
        'function accept(value:any=3){return value}let result=accept();',
        'function accept(value:any=3){return value}let result=accept(CameraProperty.X);']){
        const a=outcome(()=>publicValidate(parse(source),options)),b=outcome(()=>complete(parse(source),options));
        assert.equal(b.kind,a.kind);if(a.kind==='return')assert.deepEqual(b.value,a.value);else assert.equal(b.error.message,a.error.message);
        const old=prepareProcedureConstraintSource(parse(source),{mode:'supported-default'}),owned=prepareProcedureConstraintSourceForTranslation(parse(source),{mode:'supported-default'});
        assert.deepEqual(owned.diagnostics,old.diagnostics);assert.deepEqual(owned.program,old.program);
    }
    for(const validate of [publicValidate,complete]){
        const log=[],ast=parse('function accept(value:number){return value}let result=accept(3);');
        const opts=Object.fromEntries(['onlyFunctions','ordinaryPrimitiveSdkNumbers','sceneClockNumbers'].map(key=>[key,{get(){log.push(key);return key==='onlyFunctions'?null:true;},enumerable:true,configurable:true}]));
        const actual={};for(const[key,d]of Object.entries(opts))define(actual,key,d);
        assert.deepEqual(validate(ast,actual),[]);assert.deepEqual(log,['onlyFunctions','ordinaryPrimitiveSdkNumbers','sceneClockNumbers']);
    }
});
