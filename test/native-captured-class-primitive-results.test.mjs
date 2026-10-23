import test from 'node:test';
import assert from 'node:assert/strict';
import {parseMakeCodeTs} from '../overlay/scratch-gui/src/lib/bw-makecode/ts-import.js';
import {GENERATED_HELPER_PROFILES} from '../overlay/scratch-gui/src/lib/bw-makecode/generated-helper-recognition.js';
import {analyseSourceValueProducers} from '../overlay/scratch-gui/src/lib/bw-makecode/source-value-producers.js';
import {nativeArrayAddHelperSource} from '../overlay/scratch-gui/src/lib/bw-makecode/native-array-binary-helper-source.js';
import {nativeClassScalarView} from '../overlay/scratch-gui/src/lib/bw-makecode/native-class-scalar-view.js';
import {inspectNativeArrayBinaryDomains} from '../overlay/scratch-gui/src/lib/bw-makecode/native-array-binary-domain.js';

const profile=GENERATED_HELPER_PROFILES.ordinary;
const header=nativeArrayAddHelperSource('__bwBinaryAdd',true,true);
const parse=source=>parseMakeCodeTs(source,profile);
const graphOptions={arrayValues:true,arrayEffectSites:true,parenthesized:true,unboundIsOpaque:true,
    uninitializedLocalsAreOpaque:true,declaredLocalUndefined:true,initializationEntries:true,
    ordinaryPrimitiveSdkNumbers:true,sceneClockNumbers:true};
const box='class Box {constructor(public n:any){} get value():any{return this.n} set value(v:any){this.n=v} sample(){return this.n}}';
const basic='class Counter {value=3};let counter=new Counter();function read(){return __bwBinaryAdd(counter.value,1)}read();';
const program=source=>parse(header+';'+source);
const inspect=ast=>inspectNativeArrayBinaryDomains(ast,profile);
const accept=ast=>{const proof=inspect(ast);assert.equal(proof.reason,null);assert.equal(proof.helpers.size,1);
    assert.equal(proof.current(),true);assert.equal(proof.arrayHelpers.size,0,'class primitive result cannot grant an Array join position');return proof;};
const refuse=ast=>{const proof=inspect(ast);assert.equal(proof.helpers.size,0,'unproved class result cannot authorize native addition');return proof;};
const metadata=new Set(['originalBody','parameterDefaults','paramTypes','returnType','typeParameters','ordinaryParameterDefaultNames']);
const walk=(value,out=[],seen=new Set())=>{
    if(!value||typeof value!=='object'||seen.has(value))return out;seen.add(value);
    if(!Array.isArray(value))out.push(value);
    for(const [key,child]of Object.entries(value))if(!metadata.has(key))walk(child,out,seen);return out;
};
const member=(ast,name='value',object='counter')=>{const value=walk(ast).find(node=>node.type==='Member'&&node.name===name&&node.object?.type==='Identifier'&&node.object.name===object);assert.ok(value,name);return value;};
const carrier=(view,name='value',object='counter')=>{const value=walk(view.program).find(node=>node.type==='Conditional'&&
    (node.test?.type==='Member'?node.test:node.test?.type==='Call'?node.test.callee:null)?.name===name&&
    (node.test.type==='Member'?node.test.object:node.test.callee.object)?.name===object);assert.ok(value,'actual issued carrier for '+object+'.'+name);return value;};
const has=(view,node)=>view.hasNormalPrimitiveResult?.(node)??false;
const issued=source=>{const ast=parse(source),view=nativeClassScalarView(ast,profile),result=carrier(view);
    assert.equal(typeof view.hasNormalPrimitiveResult,'function');assert.equal(has(view,result),true);assert.equal(view.current(),true);return {ast,view,result};};

test('captured actual field getter and owned method results compose without initializing the receiver',()=>{
    for(const source of [basic,
        'class Counter {get value(){return 3}};let counter=new Counter();function read(){return __bwBinaryAdd(counter.value,1)}read();',
        'class Counter {sample(){return 3}};let counter=new Counter();function read(){return __bwBinaryAdd(counter.sample(),1)}read();'
    ]){
        const ast=program(source),receiver=member(ast,source.includes('counter.sample')?'sample':'value').object;
        const before=analyseSourceValueProducers(ast,graphOptions);assert.equal(before.isInitializedAt(receiver),false);
        const proof=accept(ast),after=analyseSourceValueProducers(ast,graphOptions);
        assert.equal(after.isInitializedAt(receiver),false,'result eligibility does not initialize the captured constructor binding');
        assert.deepEqual(after.bindingTypesAt(receiver),before.bindingTypesAt(receiver));assert.equal(proof.current(),true);
    }
});

test('constructor aliases and actual startup entry retain receiver declaration readiness',()=>{
    accept(program('class Counter {value="first"};let counter=new Counter();let alias=counter;function read(){return __bwBinaryAdd(alias.value,"!")}alias.value="next";read();'));
    const eof=program('class Counter {value=3};function start(){counter=new Counter();read()}function read(){return __bwBinaryAdd(counter.value,1)}let counter:any;start();');
    const receiver=member(eof).object,graph=analyseSourceValueProducers(eof,graphOptions);
    assert.equal(graph.isInitializedAt(receiver),false);
    const canonical=eof.body.find(node=>node.type==='FunctionDeclaration'&&node.name==='__bwBinaryAdd');
    assert.ok(canonical);const branches=canonical.body.filter(node=>node.type==='If');assert.equal(branches.length,2);
    for(const branch of branches){assert.equal(Object.hasOwn(branch,'alternate'),true);assert.equal(branch.alternate,null);}
    assert.equal(graph.isCapturedLexicalDeclarationReadyAt(receiver),false,
        'raw whole-program frontier rejects the canonical helper null-else shape; the consumer removes only this proved helper before its graph');
    const frontier=parse('class Counter {value=3};function start(){counter=new Counter();read()}function read(){return counter.value+1}let counter:any;start();');
    const frontierReceiver=member(frontier).object,frontierGraph=analyseSourceValueProducers(frontier,graphOptions);
    assert.equal(frontierGraph.isInitializedAt(frontierReceiver),false);
    assert.equal(frontierGraph.isCapturedLexicalDeclarationReadyAt(frontierReceiver),true,'actual root declaration executes before the closed startup entry in the independent helper-free graph');
    accept(eof);
    accept(program('class Counter {value=3};function outer(){let counter=new Counter();function read(){return __bwBinaryAdd(counter.value,1)}return read()}outer();'));
});

test('issuer membership binds only exact owned primitive carriers and preserves Boolean versus Number domains',()=>{
    for(const value of ['3','"text"','true','null','undefined']){
        const source=box+';let counter=new Box('+value+');let observed=counter.value;',out=issued(source);
        assert.equal(has(out.view,{...out.result}),false,'a shape copy is not issued');
        assert.equal(has(out.view,{...out.result,nativeClassNormalResult:true}),false,'a supplied tag is not authority');
        assert.equal(has(out.view,out.result.test),false,'the original receiver read is not a normal-result certificate');
        const foreign=nativeClassScalarView(parse(source),profile);assert.equal(has(foreign,out.result),false,'another view cannot borrow a result node');
        const graph=analyseSourceValueProducers(out.view.program,graphOptions),types=graph.typesAt(out.result);
        if(value==='true'){assert.ok(types.has('Boolean'));assert.equal(types.has('Number'),false);}
        if(value==='"text"'){assert.ok(types.has('String'));assert.equal(types.has('Number'),false);}
        if(value==='null')assert.ok(types.has('Null'));
        if(value==='undefined')assert.ok(types.has('Undefined'));
    }
    // Primitive unions are issuer facts; this does not demand that an existing
    // lexical frontier accept any synthetic Boolean marker it cannot parse.
    const union=issued(box+';let counter=new Box(3);counter.value="text";counter.value=null;let observed=counter.value;');
    const types=analyseSourceValueProducers(union.view.program,graphOptions).typesAt(union.result);
    assert.ok(types.has('Number'));assert.ok(types.has('String'));assert.ok(types.has('Null'));
});

test('the private result carrier preserves the original source and getter or method test exactly once',()=>{
    for(const [source,name]of [
        [box+';let counter=new Box(3);let observed=counter.value;','value'],
        [box+';let counter=new Box(3);let observed=counter.sample();','sample']
    ]){
        const ast=parse(source),before=structuredClone(ast),original=member(ast,name),view=nativeClassScalarView(ast,profile),result=carrier(view,name);
        assert.deepEqual(ast,before,'issuer does not edit constructor field accessor or method source');
        assert.equal(has(view,result),true);
        if(name==='value')assert.strictEqual(result.test,original);
        else {assert.equal(result.test.type,'Call');assert.strictEqual(result.test.callee,original);}
        let occurrences=0;
        const count=value=>{if(!value||typeof value!=='object')return;if(value===result.test)occurrences++;
            for(const [key,child]of Object.entries(value))if(!metadata.has(key))count(child);};
        count(result);assert.equal(occurrences,1,'the actual original access/call stays in one executable test position');
    }
});

test('initial later aliased and other-instance opaque or reference writers remain refused',()=>{
    accept(program(basic));
    for(const value of ['{}','[1]','[[1]]','foreign()','image.create(1,1)']){
        refuse(program('class Counter {value='+value+'};let counter=new Counter();function read(){return __bwBinaryAdd(counter.value,1)}read();'));
        refuse(program(basic+'let alias=counter;alias.value='+value+';'));
        refuse(program('class Counter {value=3};let counter=new Counter();function read(){return __bwBinaryAdd(counter.value,1)}counter.value='+value+';read();'));
    }
    refuse(program(basic+'let other=new Counter();other.value={};'));
    const reference=parse('class Counter {value=[1]};let counter=new Counter();let observed=counter.value;'),view=nativeClassScalarView(reference,profile);
    assert.equal(has(view,member(reference)),false,'a reference-producing source member never becomes a primitive result');
});

test('foreign getter effects escaped receivers methods callbacks and prototype storage cannot gain result authority',()=>{
    const declarations='class Counter {value=3;sample(){return 3}}let counter=new Counter();';
    accept(program(declarations+'function read(){return __bwBinaryAdd(counter.value,1)}read();'));
    for(const effect of ['foreign(counter)','let method=counter.sample;method()','let saved={counter:counter}',
        'Object.defineProperty(counter,"value",{value:{}})','counter["value"]={}','delete counter.value',
        'foreign(function(value:any){counter.value=value})','let Constructor=Counter','Counter=foreign']){
        refuse(program(declarations+effect+';function read(){return __bwBinaryAdd(counter.value,1)}read();'));
    }
    refuse(program('let values=[1];class Counter {value=3;get result(){foreign();return 3}}let counter=new Counter();function read(){return __bwBinaryAdd(values,counter.result)}read();'));
    refuse(program('class Counter {value=3;constructor(){return {} as any}}let counter=new Counter();function read(){return __bwBinaryAdd(counter.value,1)}read();'));
    // Existing issuer semantics can prove this-based results, while the
    // unchanged declaration frontier intentionally cannot qualify their whole
    // source. Preserve that named limit rather than bypassing its guard.
    for(const expression of ['counter.value','counter.sample()']){
        const source=box+';let counter=new Box(3);function read(){return __bwBinaryAdd('+expression+',1)}read();';
        const view=nativeClassScalarView(parse(box+';let counter=new Box(3);let observed='+expression+';'),profile);
        assert.equal(has(view,carrier(view,expression.includes('sample')?'sample':'value')),true,'issuer alone still knows its exact primitive normal result');
        refuse(program(source));
    }
    refuse(program('class Base {constructor(){this.sample()}sample(){return 1}}class Counter extends Base {value:any={};sample(){return this.value}}let counter=new Counter();function read(){return __bwBinaryAdd(counter.sample(),1)}read();'));
});

test('receiver and actual method arguments retain TDZ declaration entry and missing-default obligations',()=>{
    for(const source of [
        'class Counter {value=3};function read(){return __bwBinaryAdd(counter.value,1)}read();let counter=new Counter();',
        'class Counter {value=3};function run(){let result=__bwBinaryAdd(counter.value,1);let counter=new Counter();return result}run();',
        'class Counter {value=3};function read(){return __bwBinaryAdd(counter.value,1)}let counter=read();',
        'class Counter {value=3};let callback=function(){return __bwBinaryAdd(counter.value,1)};let counter=new Counter();callback();',
        'class Counter {value=3};let counter=new Counter();function read(){return __bwBinaryAdd(counter.value,1)}let escaped=read;foreign(escaped);',
        'class Counter {echo(value:any){return value}}let counter=new Counter();function read(){return __bwBinaryAdd(counter.echo(argument),1)}read();let argument=3;',
        'class Counter {echo(value:any=3){return value}}let counter=new Counter();function read(){return __bwBinaryAdd(counter.echo(),1)}read();',
        'class Counter {echo(value:any){return value}}let counter=new Counter();function read(){return __bwBinaryAdd(counter.echo(),1)}read();'
    ])refuse(program(source));
    const generic=program('class Counter {sample(){return 3}}let counter=new Counter();function read(){return __bwBinaryAdd(counter.sample(),1)}read();');
    const call=walk(generic).find(node=>node.type==='Call'&&node.callee?.type==='Member'&&node.callee.name==='sample');assert.ok(call);
    call.typeArguments=['number'];refuse(generic);
});

test('issued carrier shape test branch prototype and absence edits permanently revoke membership after observation',()=>{
    for(const mode of ['test','branch','value','prototype','absent']){
        const out=issued('class Counter {value=3};let counter=new Counter();let observed=counter.value;');let restore;
        if(mode==='test'){const saved=out.result.test;out.result.test={type:'Number',value:'7'};restore=()=>{out.result.test=saved;};}
        else if(mode==='branch'){const saved=out.result.consequent;out.result.consequent={type:'Object',props:[]};restore=()=>{out.result.consequent=saved;};}
        else if(mode==='value'){const saved=out.result.consequent.value;out.result.consequent.value='4';restore=()=>{out.result.consequent.value=saved;};}
        else if(mode==='prototype'){const saved=Object.getPrototypeOf(out.result);Object.setPrototypeOf(out.result,Object.create(saved));restore=()=>Object.setPrototypeOf(out.result,saved);}
        else {out.result.parenthesized=true;restore=()=>{delete out.result.parenthesized;};}
        assert.equal(out.view.current(),false,mode);assert.equal(has(out.view,out.result),false);restore();
        assert.equal(out.view.current(),false,'observed carrier restoration cannot revive '+mode);assert.equal(has(out.view,out.result),false);
        const fresh=nativeClassScalarView(out.ast,profile);assert.equal(has(fresh,carrier(fresh)),true,'fresh valid carrier is independently issued');
    }
});

test('used consumer facts remain revoked when an earlier source guard short-circuits the issuer before restore',()=>{
    for(const mode of ['field','receiver','argument']){
        const ast=program(basic),proof=accept(ast);let restore;
        if(mode==='field'){
            const field=ast.body.find(node=>node.type==='Class'&&node.name==='Counter').fields[0],saved=field.init;
            field.init={type:'Object',props:[]};restore=()=>{field.init=saved;};
        }else if(mode==='receiver'){
            const access=member(ast),saved=access.object;access.object={type:'Identifier',name:'foreign'};restore=()=>{access.object=saved;};
        }else{
            const read=ast.body.find(node=>node.type==='FunctionDeclaration'&&node.name==='read'),call=read.body[0].value,saved=call.args[0];
            call.args[0]={type:'Object',props:[]};restore=()=>{call.args[0]=saved;};
        }
        assert.equal(proof.current(),false,mode);restore();assert.equal(proof.current(),false,'old consumer stays expired after '+mode+' ABA');
        accept(ast);
    }
});

test('issued-result reflection errors keep original identity then refuse without rereading source',()=>{
    for(const consumer of [false,true]){
        const ast=consumer?program(basic):parse('class Counter {value=3};let counter=new Counter();let observed=counter.value;');
        const access=member(ast),saved=access.object,failure=new Error('class source descriptor failed');let armed=false,reads=0;
        access.object=new Proxy(saved,{getOwnPropertyDescriptor(target,key){reads++;if(armed)throw failure;return Reflect.getOwnPropertyDescriptor(target,key);}});
        const view=consumer?null:nativeClassScalarView(ast,profile),result=consumer?null:carrier(view);
        if(!consumer)assert.equal(has(view,result),true);
        const proof=consumer?accept(ast):view;assert.equal(proof.current(),true);armed=true;
        try{assert.throws(()=>proof.current(),error=>error===failure,'preserve first exact reflection Error');}finally{armed=false;}
        const observed=reads;assert.equal(proof.current(),false);assert.equal(reads,observed,'revoked currentness must not reflect again');
        if(!consumer){assert.equal(has(view,result),false);assert.equal(reads,observed);}
        access.object=saved;assert.equal(proof.current(),false);
        if(consumer)accept(ast);else {const fresh=nativeClassScalarView(ast,profile);assert.equal(has(fresh,carrier(fresh)),true);}
    }
});

test('inherited carrier getters are not invoked and no-class or unselected views mint no authority',()=>{
    const out=issued('class Counter {value=3};let counter=new Counter();let observed=counter.value;');let reads=0;
    const previous=Object.getPrototypeOf(out.result),prototype=Object.create(previous);
    Object.defineProperty(prototype,'constructorCall',{get(){reads++;throw new Error('inherited carrier metadata must not execute');}});
    Object.setPrototypeOf(out.result,prototype);
    try{assert.equal(out.view.current(),false);assert.equal(has(out.view,out.result),false);assert.equal(reads,0);}
    finally{Object.setPrototypeOf(out.result,previous);}
    assert.equal(out.view.current(),false);assert.equal(reads,0);
    for(const source of ['let value=3;','class Counter {value=[1]};let counter=new Counter();let observed=counter.value;']){
        const ast=parse(source),view=nativeClassScalarView(ast,profile);
        assert.equal(view.current(),true);assert.equal(has(view,{type:'Conditional',test:{type:'Number',value:'1'},consequent:{type:'Number',value:'0'},alternate:{type:'Number',value:'0'}}),false);
        assert.equal(view.current(),true,'no forged query activates a new proof dependency');
    }
});


test('post-issuance intrinsic forgeries cannot turn copied or changed carriers into owned current results',()=>{
    // Store restoration and observation primitives before each bounded attack.
    // Assertions run only after finally restores the actual intrinsic bytes.
    const descriptor=Object.getOwnPropertyDescriptor,define=Object.defineProperty,keys=Reflect.ownKeys;
    const realm=globalThis,originalObject=Object,originalReflect=Reflect,create=Object.create;
    for(const mode of ['WeakSet.has','Array.every','Object.descriptor','Reflect.keys','global Object','global Reflect']){
        const out=issued('class Counter {value=3};let counter=new Counter();let observed=counter.value;');
        let target,name,replacement,query,restoreSource=()=>{};
        if(mode==='WeakSet.has'){
            target=WeakSet.prototype;name='has';replacement=function(){return true;};
            const copied={...out.result};query=()=>has(out.view,copied);
        }else if(mode==='Array.every'){
            target=Array.prototype;name='every';replacement=function(){return true;};
            out.result.test={type:'Number',value:'7'};query=()=>out.view.current();
        }else if(mode==='Object.descriptor'){
            target=Object;name='getOwnPropertyDescriptor';const originalTest=descriptor(out.result,'test');
            out.result.test={type:'Number',value:'7'};
            replacement=function(object,key){return object===out.result&&key==='test'?originalTest:descriptor(object,key);};
            query=()=>out.view.current();
        }else if(mode==='Reflect.keys'){
            target=Reflect;name='ownKeys';const originalKeys=keys(out.result);
            out.result.forgedResult=true;
            replacement=function(object){return object===out.result?originalKeys:keys(object);};
            query=()=>out.view.current();
        }else{
            const field=out.ast.body.find(node=>node.type==='Class'&&node.name==='Counter').fields[0];
            target=realm;
            if(mode==='global Object'){
                name='Object';const saved=descriptor(field,'init');field.init={type:'Object',props:[]};
                replacement=create(originalObject);
                define(replacement,'prototype',{value:originalObject.prototype});
                define(replacement,'getOwnPropertyDescriptor',{value:function(object,key){
                    return object===field&&key==='init'?saved:descriptor(object,key);
                }});
                restoreSource=()=>define(field,'init',saved);
            }else{
                name='Reflect';const originalKeys=keys(field);field.forgedSource=true;
                replacement=create(originalReflect);
                define(replacement,'ownKeys',{value:function(object){return object===field?originalKeys:keys(object);}});
                restoreSource=()=>{delete field.forgedSource;};
            }
            // The old Object/Reflect objects and their prototypes remain intact;
            // a facade hides the original AST edit from dynamic metadata reads.
            query=()=>out.view.current();
        }
        const previous=descriptor(target,name);let result,failure;
        try{define(target,name,{...previous,value:replacement});result=query();}
        catch(error){failure=error;}
        finally{define(target,name,previous);restoreSource();}
        assert.equal(failure,undefined,mode+' must decline without replacing its ordinary query outcome');
        assert.equal(result,false,mode+' cannot manufacture membership or hide a changed carrier');
        assert.deepEqual(descriptor(target,name),previous,'original intrinsic descriptor is restored before assertions');
    }
});
