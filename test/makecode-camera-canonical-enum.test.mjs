import test from 'node:test';
import assert from 'node:assert/strict';
import {parseMakeCodeTs} from '../overlay/scratch-gui/src/lib/bw-makecode/ts-import.js';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {validateCompilerOwnedProcedureConstraintSource as complete,
    validateProcedureConstraintSource as original,analyseSourceValueProducers} from '../overlay/scratch-gui/src/lib/bw-makecode/source-value-producers.js';
import {prepareProcedureConstraintSourceForTranslation as prepare} from '../overlay/scratch-gui/src/lib/bw-makecode/procedure-constraint-source.js';
import {ordinaryCameraPropertyNumberLeaves} from '../overlay/scratch-gui/src/lib/bw-makecode/ordinary-primitive-sdk-number-source.js';
import {CAMERA_SOURCE} from './fixtures/arcade-camera.mjs';
const parse=text=>parseMakeCodeTs(text,{parameterDefaults:true,retainCallableMetadata:true});
const opts={ordinaryPrimitiveSdkNumbers:true,sceneClockNumbers:true};
const source=(before='',after='')=>`function accept(property:number){return property}\n${before}\nlet result=accept(CameraProperty.X);\n${after}`;
const numberIssue=messages=>messages.some(message=>message.includes('accept.property requires Number from actual producers'));
const leaf=ast=>ast.body.find(n=>n.type==='Declaration'&&n.decls.some(d=>d.name==='result')).decls.find(d=>d.name==='result').init.args[0];

test('canonical enum Number survives genuine camera fixture plus unrelated supported game operation',()=>{
    const actual=arcadeToPseudocode(CAMERA_SOURCE+'\ngame.splash("Camera ready");');
    assert.deepEqual(actual.unsupported,[]);assert.deepEqual(actual.warnings,[]);
    assert.match(actual.code,/arcade camera property/);assert.match(actual.code,/cameraValue/);
    assert.match(actual.code,/splash/);
});
test('canonical enum fact is independent of ordinary calls callbacks arrays classes and local writes',()=>{
    const extras=['game.splash("ready");','let values=[1,2];values.push(3);',
        'game.onUpdate(function(){let frame=1;frame+=1;});',
        'class Box{value:number;constructor(){this.value=1}}let box=new Box();',
        'function operation(value:number){return value+1}let other=operation(2);other=3;'];
    for(const extra of extras){
        for(const text of [source(extra),source('',extra)])assert.deepEqual(complete(parse(text),opts),[],extra);
    }
});
test('per-use scope distinguishes harmless same-name bindings from actual parameter block and var shadows',()=>{
    for(const extra of ['function unrelated(CameraProperty:any){return CameraProperty.X}',
        '{let CameraProperty:any={X:9};}',
        'class Box{CameraProperty:number;constructor(){this.CameraProperty=2;}}']){
        assert.deepEqual(complete(parse(source(extra)),opts),[]);
    }
    for(const extra of ['namespace Other{export let value=1;}',
        'namespace Other{var CameraProperty:any={X:9};}',
        'namespace Other{for(var CameraProperty of [other]){}}',
        'function unrelated(){for(var CameraProperty of [1]){let value=CameraProperty;}}']){
        const ast=parse(source(extra));assert.deepEqual(original(ast,opts),[]);assert.deepEqual(complete(ast,opts),[]);
    }
    const shadows=[
        source('namespace CameraProperty{export let X=9;}'),
        source('namespace Other{var CameraProperty:any={X:9};accept(CameraProperty.X);}'),
        source('namespace Other{for(var CameraProperty of [other]){}accept(CameraProperty.X);}'),
        source('for(var CameraProperty of [other]){}'),
        'function accept(property:number){return property}function local(){accept(CameraProperty.X);for(var CameraProperty of [other]){}}local();',
        'function accept(property:number){return property}function local(){for(var CameraProperty of [other]){}accept(CameraProperty.X)}local();',
        'function accept(property:number){return property}function local(CameraProperty:any){accept(CameraProperty.X)}',
        'function accept(property:number){return property}{let CameraProperty:any={X:9};accept(CameraProperty.X)}',
        'function accept(property:number){return property}function local(){accept(CameraProperty.X);if(false){var CameraProperty:any;}}'
    ];
    for(const text of shadows){
        assert.ok(numberIssue(original(parse(text),opts)),text);assert.ok(numberIssue(complete(parse(text),opts)),text);
    }
});
test('uncertain residual bindings and Throw preserve original complete validation rather than granting a leaf',()=>{
    const uncertain=['let {other}=source;','let [other]=source;','namespace Other{export let value=1;}',
        'enum Other{Value=1}','for(let value of [1]){let ordinary=value;}'];
    for(const before of uncertain){
        const a=parse(source(before)),b=parse(source(before));
        assert.deepEqual(complete(a,opts),original(b,opts),'residual forms use actual full public validation');
    }
    const thrown=source('function uncertain(value:number){if(value<0)throw 1;return value}');
    assert.deepEqual(complete(parse(thrown),opts),original(parse(thrown),opts));
});
test('whole enum roots cannot escape mutate dynamically index or become a reflective namespace grant',()=>{
    for(const before of ['let {CameraProperty}=other;','let {value:CameraProperty}=other;','let [CameraProperty]=other;']){
        const ast=parse(source(before));assert.ok(numberIssue(original(ast,opts)));assert.ok(numberIssue(complete(ast,opts)));
    }
    for(const effect of ['let alias=CameraProperty;','send(CameraProperty);','CameraProperty=other;',
        'CameraProperty.X=3;','CameraProperty.X+=1;','CameraProperty.X++;','delete CameraProperty.X;',
        'let reflected=CameraProperty["X"];','let unknown=CameraProperty.Missing;',
        'Object.defineProperty(CameraProperty,"X",other);','Reflect.set(CameraProperty,"X",9);']){
        for(const text of [source(effect),source('',effect)]){
            assert.ok(numberIssue(original(parse(text),opts)),effect);
            assert.ok(numberIssue(complete(parse(text),opts)),effect);
        }
    }
});
test('physical candidate casts optional markers and source uncertainty never inherit canonical authority',()=>{
    const withAncestor=parse(source()),member=leaf(withAncestor),call=withAncestor.body.find(n=>n.type==='Declaration').decls[0].init;
    call.args[0]={type:'Binary',op:'+',left:member,right:{type:'Number',value:'0'},assertedType:{text:'any'}};
    const nativeBoolean=globalThis.Boolean;let foreignCalls=0;let selected;
    try{globalThis.Boolean=()=>{foreignCalls++;return false;};selected=ordinaryCameraPropertyNumberLeaves(withAncestor).has(member);}
    finally{globalThis.Boolean=nativeBoolean;}
    assert.equal(foreignCalls,0,'ancestor assertion census does not invoke a mutable global Boolean');
    assert.equal(selected,false);assert.ok(numberIssue(original(withAncestor,opts)));assert.ok(numberIssue(complete(withAncestor,opts)));

    for(const change of [n=>{n.optional=true;},n=>{n.computed=true;},n=>{n.assertedType={text:'number'};},
        n=>{n.object={type:'Identifier',name:'pretend'};},n=>{n.name='Missing';}]){
        const ast=parse(source());change(leaf(ast));
        assert.ok(numberIssue(original(ast,opts)));assert.ok(numberIssue(complete(ast,opts)));
    }
    const ast=parse(source());ast.body.push({type:'UnmodelledBinding',name:'CameraProperty'});
    assert.deepEqual(complete(ast,opts),original(ast,opts));
    assert.ok(numberIssue(original(ast,opts)));assert.ok(numberIssue(complete(ast,opts)));
});
test('canonical enum Number reaches both actual preparation validations without changing bad writers or defaults',()=>{
    const actual=prepare(parse('function accept(property:number,value:any=20){return property}let result=accept(CameraProperty.X);'),{mode:'supported-default'});
    assert.deepEqual(actual.diagnostics,[]);assert.match(JSON.stringify(actual.program),/__bwOmittedDefault/);
    const bad=prepare(parse('function accept(property:number,value:any=20){return property}let result=accept(CameraProperty.X);accept("wrong");'),{mode:'supported-default'});
    assert.ok(numberIssue(bad.diagnostics));
    const wrongWriter=source('let picked:any=CameraProperty.X;','picked="wrong";').replace('accept(CameraProperty.X)','accept(picked)');
    assert.ok(numberIssue(complete(parse(wrongWriter),opts)));
});
test('public SDK opt-in gains canonical Number while default opt-out no-Camera and original errors are unchanged',()=>{
    const ast=parse(source('game.splash("ready");'));
    assert.deepEqual(original(ast,opts),[]);
    assert.deepEqual([...analyseSourceValueProducers(ast,{unboundIsOpaque:true,opaqueDeclarationValues:true,ordinaryPrimitiveSdkNumbers:true}).typesAt(leaf(ast))],['Number']);
    for(const disabled of [{},{ordinaryPrimitiveSdkNumbers:false}]){
        assert.ok(numberIssue(original(ast,disabled)));
        assert.deepEqual([...analyseSourceValueProducers(ast,{unboundIsOpaque:true,opaqueDeclarationValues:true,...disabled}).typesAt(leaf(ast))],['Opaque']);
    }
    assert.deepEqual(complete(ast,{...opts,ordinaryPrimitiveSdkNumbers:false}),original(ast,{...opts,ordinaryPrimitiveSdkNumbers:false}));
    for(const text of ['function accept(value:number){return value}accept(2);',
        'function accept(value:number){return value}accept("wrong");']){
        assert.deepEqual(complete(parse(text),opts),original(parse(text),opts));
    }
    const marker=new Error('unchanged original option membership error');let calls=0;
    assert.throws(()=>complete(parse(source()),{...opts,onlyFunctions:{has(){calls++;throw marker;}}}),error=>error===marker);
    assert.equal(calls,1);
});
