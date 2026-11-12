import test from 'node:test';
import assert from 'node:assert/strict';
import {parseMakeCodeTs} from '../overlay/scratch-gui/src/lib/bw-makecode/ts-import.js';
import {GENERATED_HELPER_PROFILES} from '../overlay/scratch-gui/src/lib/bw-makecode/generated-helper-recognition.js';
import {analyseSourceValueProducers} from '../overlay/scratch-gui/src/lib/bw-makecode/source-value-producers.js';
import {nativeArrayAddHelperSource} from '../overlay/scratch-gui/src/lib/bw-makecode/native-array-binary-helper-source.js';
import {inspectNativeArrayBinaryDomains} from '../overlay/scratch-gui/src/lib/bw-makecode/native-array-binary-domain.js';

const profile=GENERATED_HELPER_PROFILES.ordinary;
const addition=nativeArrayAddHelperSource('__bwBinaryAdd',true,true);
const multiply='function multiply(left:any,right:any):number{return left*right}';
const graphOptions={arrayValues:true,arrayEffectSites:true,parenthesized:true,unboundIsOpaque:true,
    uninitializedLocalsAreOpaque:true,declaredLocalUndefined:true,initializationEntries:true,
    ordinaryPrimitiveSdkNumbers:true,sceneClockNumbers:true};
const parse=(source,selected=profile)=>parseMakeCodeTs(source,selected);
const program=(source,selected=profile)=>parse(addition+';'+source,selected);
const inspect=(ast,selected=profile)=>inspectNativeArrayBinaryDomains(ast,selected);
const accept=(ast,selected=profile)=>{
    const proof=inspect(ast,selected);assert.equal(proof.reason,null);assert.equal(proof.helpers.size,1);
    assert.equal(proof.current(),true);assert.equal(proof.arrayHelpers.size,0,'primitive result never acquires an Array helper position');return proof;
};
const refuse=ast=>{const proof=inspect(ast);assert.equal(proof.helpers.size,0,'unproved operation must not authorize native addition');return proof;};
const fn=(ast,name)=>{const value=ast.body.find(node=>node.type==='FunctionDeclaration'&&node.name===name);assert.ok(value,name);return value;};
const walk=(value,out=[],seen=new Set())=>{
    if(!value||typeof value!=='object'||seen.has(value))return out;seen.add(value);
    if(!Array.isArray(value))out.push(value);
    for(const [key,child]of Object.entries(value))if(!['originalBody','parameterDefaults','paramTypes','returnType','typeParameters'].includes(key))walk(child,out,seen);
    return out;
};
const invocation=(ast,name)=>{const value=walk(ast).find(node=>node.type==='Call'&&node.callee?.type==='Identifier'&&node.callee.name===name);assert.ok(value,name);return value;};
const capturedSource=(initializer='0',body='multiply(trace,10)')=>multiply+';let trace:any'+(initializer===null?'':'='+initializer)+';function tick(){return __bwBinaryAdd('+body+',1)}let result=tick();'+(initializer===null?'trace=7;':'');

test('actual captured arithmetic composes a normal Number result without initializing the original captured input',()=>{
    const ast=program(capturedSource()),call=invocation(ast,'multiply'),read=call.args[0];
    assert.equal(read.type,'Identifier');assert.equal(read.name,'trace');
    const before=analyseSourceValueProducers(ast,graphOptions);
    assert.equal(before.isInitializedAt(read),false,'captured occurrence has no generic initialization certificate');
    assert.ok(before.bindingTypesAt(read).has('Number'));
    const proof=accept(ast);
    const after=analyseSourceValueProducers(ast,graphOptions);
    assert.equal(after.isInitializedAt(read),false,'consumer proof cannot rewrite generic input initialization');
    assert.deepEqual(after.bindingTypesAt(read),before.bindingTypesAt(read));assert.equal(proof.current(),true);
});

test('coercing operations accept complete captured primitive writers without lending Number to their inputs',()=>{
    for(const initializer of ['7','"7"','true','null',null]){
        const ast=program(capturedSource(initializer)),read=invocation(ast,'multiply').args[0];
        const graph=analyseSourceValueProducers(ast,graphOptions),types=graph.bindingTypesAt(read);
        assert.equal(graph.isInitializedAt(read),false);accept(ast);
        if(initializer==='"7"'){assert.ok(types.has('String'));assert.equal(types.has('Number'),false);}
        if(initializer==='true'){assert.ok(types.has('Boolean'));assert.equal(types.has('Number'),false);}
        if(initializer==='null'){assert.ok(types.has('Null'));assert.equal(types.has('Number'),false);}
        if(initializer===null)assert.ok(graph.typesAt(read).has('Undefined'),'actual early Undefined remains represented');
    }
    const mixed=program(multiply+';let trace:any="7";function tick(){return __bwBinaryAdd(multiply(trace,10),1)}let first=tick();trace=true;let second=tick();trace=null;');
    accept(mixed);
});

test('alpha-renamed canonical nested binary unary and comparison results retain their separate domains in every existing profile',()=>{
    const helpers='function scale(item:any,factor:any):number{return item*factor};'+
        'function bits(operand:any):number{return ~operand};'+
        'function differs(a:any,b:any):boolean{return a!==b};';
    for(const selected of Object.values(GENERATED_HELPER_PROFILES)){
        const ast=program(helpers+'let trace:any="7";function tick(){return __bwBinaryAdd(scale(bits(trace),2),differs(trace,null))}let result=tick();',selected);
        const comparison=invocation(ast,'differs'),graph=analyseSourceValueProducers(ast,graphOptions);
        assert.ok(graph.typesAt(comparison).has('Boolean'));assert.equal(graph.typesAt(comparison).has('Number'),false);
        accept(ast,selected);
    }
    for(const op of ['-','/','%','**','&','|','^','<<','>>','>>>']){
        const helper='function operation(a:any,b:any):number{return a'+op+'b};';
        accept(program(helper+'let trace:any=7;function tick(){return __bwBinaryAdd(operation(trace,2),1)}let result=tick();'));
    }
    // Existing nested addition and unary conversion remain their own routes.
    accept(program('let trace="";function tick(){return __bwBinaryAdd(__bwBinaryAdd(trace,"a"),1)}tick();'));
    accept(program('function convert(value:any):number{return +value};let trace:any="7";function tick(){return __bwBinaryAdd(convert(trace),1)}tick();'));
});

// Exact current-export draft of the self-authored Math.idiv fixture. This is
// source input to the pure proof, not a receipt of SDK/native execution.
const actualDraft="function __bwBinaryBitOr(left: any, right: any): number { return left | right }\nfunction __bwBinaryDivide(left: any, right: any): number { return left / right }\nfunction __bwCompareLess(left: any, right: any): boolean { return left < right }\nfunction __bwCompareGreater(left: any, right: any): boolean { return left > right }\nfunction __bwBinaryAdd(left: any, right: any): any { let a: any = left; if (left !== null && typeof left === \"object\") { let array: any[] = left; a = array.join(\",\") }; let b: any = right; if (right !== null && typeof right === \"object\") { let array: any[] = right; b = array.join(\",\") }; return a + b }\nfunction __bwBinaryMultiply(left: any, right: any): number { return left * right }\nfunction __bwBinarySubtract(left: any, right: any): number { return left - right }\nfunction Game_left (): number {\n    idivTrace = __bwBinaryAdd(__bwBinaryMultiply(idivTrace, (0 + 10)), (0 + 1))\n    idivCalls = __bwBinaryAdd(idivCalls, (0 + 1))\n    return idivEarly\n}\nfunction Game_right (): number {\n    idivTrace = __bwBinaryAdd(__bwBinaryMultiply(idivTrace, (0 + 10)), (0 + 2))\n    idivCalls = __bwBinaryAdd(idivCalls, (0 + 1))\n    idivEarly = (0 + 3)\n    return (0 + 2)\n}\nfunction Game_change (): number {\n    idivEager = (0 + 3)\n    return (0 + 8)\n}\nfunction Game_pair (a: number, b: number): number {\n    return __bwBinaryAdd(__bwBinaryMultiply(a, (0 + 100)), b)\n}\nfunction Game_condition (): number {\n    idivIterations = __bwBinaryAdd(idivIterations, (0 + 1))\n    return __bwBinarySubtract((0 + 4), idivIterations)\n}\nfunction Game_local (value: number): number {\n    let __bwPxtValue37: number = 0\n    let __bwPxtValue38: number = 0\n    let quotient: number = 0\n    __bwPxtValue37 = value\n    __bwPxtValue38 = (0 + 2)\n    quotient = __bwBinaryBitOr(__bwBinaryDivide(__bwBinaryBitOr(__bwPxtValue37, (0 + 0)), __bwBinaryBitOr(__bwPxtValue38, (0 + 0))), (0 + 0))\n    if (__bwCompareGreater(value, (0 + 0))) {\n        Game_local(__bwBinarySubtract(value, (0 + 1)))\n    }\n    return quotient\n}\nfunction __bwStartup () {\n    let __bwPxtValue2: number = 0\n    let __bwPxtValue3: number = 0\n    let __bwPxtValue4: number = 0\n    let __bwPxtValue5: number = 0\n    let __bwPxtValue6: number = 0\n    let __bwPxtValue7: number = 0\n    let __bwPxtValue8: number = 0\n    let __bwPxtValue9: number = 0\n    let __bwPxtValue10: number = 0\n    let __bwPxtValue11: number = 0\n    let __bwPxtValue12: number = 0\n    let __bwPxtValue13: number = 0\n    let __bwPxtValue14: number = 0\n    let __bwPxtValue15: number = 0\n    let __bwPxtValue16: number = 0\n    let __bwPxtValue17: number = 0\n    let __bwPxtValue18: number = 0\n    let __bwPxtValue19: number = 0\n    let __bwPxtValue20: number = 0\n    let __bwPxtValue21: number = 0\n    let __bwPxtValue22: number = 0\n    let __bwPxtValue23: number = 0\n    let __bwPxtValue26: number = 0\n    let __bwPxtValue24: number = 0\n    let __bwPxtValue25: number = 0\n    let __bwPxtValue27: any = 0\n    let __bwPxtValue28: number = 0\n    let __bwPxtValue29: number = 0\n    let __bwPxtValue32: number = 0\n    let __bwPxtValue30: number = 0\n    let __bwPxtValue31: number = 0\n    let __bwPxtValue33: number = 0\n    let __bwPxtValue34: number = 0\n    let __bwPxtValue35: number = 0\n    let __bwPxtValue36: number = 0\n    let __bwPxtValue39: number = 0\n    let __bwPxtValue40: number = 0\n    __bwPxtValue1 = (0 + 99)\n    __bwPxtValue2 = (0 + 9)\n    __bwPxtValue3 = (0 + 2)\n    idivEditable = __bwBinaryBitOr(__bwBinaryDivide(__bwBinaryBitOr(__bwPxtValue2, (0 + 0)), __bwBinaryBitOr(__bwPxtValue3, (0 + 0))), (0 + 0))\n    __bwPxtValue4 = (0 + -7)\n    __bwPxtValue5 = (0 + 3)\n    idivNegative = __bwBinaryBitOr(__bwBinaryDivide(__bwBinaryBitOr(__bwPxtValue4, (0 + 0)), __bwBinaryBitOr(__bwPxtValue5, (0 + 0))), (0 + 0))\n    __bwPxtValue6 = (0 + -7)\n    __bwPxtValue7 = (0 + -3)\n    idivDenominator = __bwBinaryBitOr(__bwBinaryDivide(__bwBinaryBitOr(__bwPxtValue6, (0 + 0)), __bwBinaryBitOr(__bwPxtValue7, (0 + 0))), (0 + 0))\n    __bwPxtValue8 = (0 + 7.9)\n    __bwPxtValue9 = (0 + 2.9)\n    idivFraction = __bwBinaryBitOr(__bwBinaryDivide(__bwBinaryBitOr(__bwPxtValue8, (0 + 0)), __bwBinaryBitOr(__bwPxtValue9, (0 + 0))), (0 + 0))\n    __bwPxtValue10 = (0 + 4294967303)\n    __bwPxtValue11 = (0 + 2)\n    idivWrap = __bwBinaryBitOr(__bwBinaryDivide(__bwBinaryBitOr(__bwPxtValue10, (0 + 0)), __bwBinaryBitOr(__bwPxtValue11, (0 + 0))), (0 + 0))\n    __bwPxtValue12 = (0 + 7)\n    __bwPxtValue13 = (0 + 0.5)\n    idivFractionZero = __bwBinaryBitOr(__bwBinaryDivide(__bwBinaryBitOr(__bwPxtValue12, (0 + 0)), __bwBinaryBitOr(__bwPxtValue13, (0 + 0))), (0 + 0))\n    __bwPxtValue14 = (0 + 9)\n    __bwPxtValue15 = (0 + 0)\n    idivZero = __bwBinaryBitOr(__bwBinaryDivide(__bwBinaryBitOr(__bwPxtValue14, (0 + 0)), __bwBinaryBitOr(__bwPxtValue15, (0 + 0))), (0 + 0))\n    __bwPxtValue16 = (0 + -2147483648)\n    __bwPxtValue17 = (0 + -1)\n    idivOverflow = __bwBinaryBitOr(__bwBinaryDivide(__bwBinaryBitOr(__bwPxtValue16, (0 + 0)), __bwBinaryBitOr(__bwPxtValue17, (0 + 0))), (0 + 0))\n    __bwPxtValue18 = __bwBinaryDivide((0 + 1), (0 + 0))\n    __bwPxtValue19 = (0 + 2)\n    idivInfinity = __bwBinaryBitOr(__bwBinaryDivide(__bwBinaryBitOr(__bwPxtValue18, (0 + 0)), __bwBinaryBitOr(__bwPxtValue19, (0 + 0))), (0 + 0))\n    __bwPxtValue20 = __bwBinaryDivide((0 + 0), (0 + 0))\n    __bwPxtValue21 = (0 + 2)\n    idivNaN = __bwBinaryBitOr(__bwBinaryDivide(__bwBinaryBitOr(__bwPxtValue20, (0 + 0)), __bwBinaryBitOr(__bwPxtValue21, (0 + 0))), (0 + 0))\n    idivTrace = (0 + 0)\n    idivCalls = (0 + 0)\n    idivEarly = (0 + 9)\n    __bwPxtValue22 = Game_left()\n    __bwPxtValue23 = Game_right()\n    idivOrdered = __bwBinaryBitOr(__bwBinaryDivide(__bwBinaryBitOr(__bwPxtValue22, (0 + 0)), __bwBinaryBitOr(__bwPxtValue23, (0 + 0))), (0 + 0))\n    idivEager = (0 + 9)\n    __bwPxtValue26 = idivEager\n    __bwPxtValue24 = Game_change()\n    __bwPxtValue25 = (0 + 2)\n    idivPreceding = Game_pair(__bwPxtValue26, __bwBinaryBitOr(__bwBinaryDivide(__bwBinaryBitOr(__bwPxtValue24, (0 + 0)), __bwBinaryBitOr(__bwPxtValue25, (0 + 0))), (0 + 0)))\n    __bwPxtValue27 = __bwCompareLess(1, 0)\n    if (!!(__bwPxtValue27)) {\n        __bwPxtValue28 = Game_right()\n        __bwPxtValue29 = (0 + 2)\n        __bwPxtValue27 = __bwBinaryBitOr(__bwBinaryDivide(__bwBinaryBitOr(__bwPxtValue28, (0 + 0)), __bwBinaryBitOr(__bwPxtValue29, (0 + 0))), (0 + 0))\n    }\n    idivLazy = __bwPxtValue27\n    __bwPxtValue32 = undefined\n    if (__bwCompareLess(0, 1)) {\n        __bwPxtValue30 = (0 + 9)\n        __bwPxtValue31 = (0 + 2)\n        __bwPxtValue32 = __bwBinaryBitOr(__bwBinaryDivide(__bwBinaryBitOr(__bwPxtValue30, (0 + 0)), __bwBinaryBitOr(__bwPxtValue31, (0 + 0))), (0 + 0))\n    } else {\n        __bwPxtValue33 = Game_right()\n        __bwPxtValue34 = (0 + 2)\n        __bwPxtValue32 = __bwBinaryBitOr(__bwBinaryDivide(__bwBinaryBitOr(__bwPxtValue33, (0 + 0)), __bwBinaryBitOr(__bwPxtValue34, (0 + 0))), (0 + 0))\n    }\n    idivConditional = __bwPxtValue32\n    idivIterations = (0 + 0)\n    idivLoops = (0 + 0)\n    __bwPxtValue35 = Game_condition()\n    __bwPxtValue36 = (0 + 2)\n    while (__bwCompareGreater(__bwBinaryBitOr(__bwBinaryDivide(__bwBinaryBitOr(__bwPxtValue35, (0 + 0)), __bwBinaryBitOr(__bwPxtValue36, (0 + 0))), (0 + 0)), (0 + 0))) {\n        idivLoops = __bwBinaryAdd(idivLoops, (0 + 1))\n        __bwPxtValue35 = Game_condition()\n        __bwPxtValue36 = (0 + 2)\n    }\n    idivReentrant = Game_local((0 + 6))\n    __bwPxtValue39 = (0 + 7)\n    __bwPxtValue40 = (0 + 2)\n    idivText = (\"\" + __bwBinaryBitOr(__bwBinaryDivide(__bwBinaryBitOr(__bwPxtValue39, (0 + 0)), __bwBinaryBitOr(__bwPxtValue40, (0 + 0))), (0 + 0)) + \"\")\n    idivCompleted = __bwCompareLess(0, 1)\n}\nlet __bwPxtValue1: number\nlet idivEditable: number\nlet idivNegative: number\nlet idivDenominator: number\nlet idivFraction: number\nlet idivWrap: number\nlet idivFractionZero: number\nlet idivZero: number\nlet idivOverflow: number\nlet idivInfinity: number\nlet idivNaN: number\nlet idivTrace: number\nlet idivCalls: number\nlet idivEarly: number\nlet idivOrdered: number\nlet idivEager: number\nlet idivPreceding: number\nlet idivLazy: any\nlet idivConditional: number\nlet idivIterations: number\nlet idivLoops: number\nlet idivReentrant: number\nlet idivText: string\nlet idivCompleted: boolean\n__bwStartup()\n";

test('the complete retained self-authored Math.idiv current draft proves its actual captured helper result sites',()=>{
    assert.equal(Buffer.byteLength(actualDraft,'utf8'),8232);
    const ast=parse(actualDraft),left=fn(ast,'Game_left'),call=invocation(left,'__bwBinaryMultiply');
    assert.equal(call.args[0].name,'idivTrace');assert.equal(call.args[1].type,'Binary');assert.equal(call.args[1].op,'+');
    const graph=analyseSourceValueProducers(ast,graphOptions);assert.equal(graph.isInitializedAt(call.args[0]),false);
    const proof=accept(ast);assert.equal(proof.helpers.has('__bwBinaryAdd'),true);
    assert.equal(graph.isInitializedAt(call.args[0]),false,'whole-draft result cannot initialize captured input');
});

test('opaque reference and foreign-effect writers cannot borrow a canonical operation normal result',()=>{
    for(const writer of ['{}','[1]','[[1]]','foreign()','{valueOf:function(){return 7}}']){
        refuse(program(capturedSource()+'trace='+writer+';'));
    }
    refuse(program(multiply+';let trace:any=7;function tick(){return __bwBinaryAdd(multiply(trace,10),1)}foreign(function(){trace={}});tick();'));
    // A Number return does not erase coercion callbacks or their Array writes.
    refuse(program(multiply+';let values=[1];let trace={valueOf:function(){values.push({});return 7}};let n=multiply(trace,10);let result=__bwBinaryAdd(values,n);'));
});

test('declaration entry and same-function TDZ still refuse even when a canonical helper always returns Number',()=>{
    for(const source of [
        multiply+';function tick(){return __bwBinaryAdd(multiply(trace,10),1)}tick();let trace=7;',
        multiply+';let callback=function(){return __bwBinaryAdd(multiply(trace,10),1)};let trace:any;trace=7;callback();',
        multiply+';function tick(){let result=__bwBinaryAdd(multiply(trace,10),1);let trace=7;return result}tick();',
        multiply+';function outer(){function read(){return __bwBinaryAdd(multiply(trace,10),1)}let result=read();let trace=7;return result}outer();',
        multiply+';let result=__bwBinaryAdd(multiply(trace,10),1);let trace=7;'
    ])refuse(program(source));
});

test('actual call arity modifiers defaults rest and hidden metadata cannot counterfeit a canonical operation',()=>{
    for(const mutate of [
        ast=>invocation(ast,'multiply').args.pop(),
        ast=>invocation(ast,'multiply').args.push({type:'Number',value:'1'}),
        ast=>{invocation(ast,'multiply').isNew=true;},
        ast=>{invocation(ast,'multiply').constructorCall=true;},
        ast=>{invocation(ast,'multiply').typeArguments=['number'];},
        ast=>{fn(ast,'multiply').restParam='right';},
        ast=>{fn(ast,'multiply').async=true;},
        ast=>{fn(ast,'multiply').generator=true;},
        ast=>{fn(ast,'multiply').typeParameters=['T'];},
        ast=>{fn(ast,'multiply').optionalParams=['right'];},
        ast=>{fn(ast,'multiply').parameterDefaultPrologue=true;},
        ast=>{const defaults=fn(ast,'multiply').params.parameterDefaults;assert.ok(Array.isArray(defaults));defaults.push({name:'right',value:{type:'Number',value:'10'}});}
    ]){const ast=program(capturedSource());mutate(ast);refuse(ast);}
    const defaults=program('function multiply(left:any,right:any=10):number{return left*right};let trace:any=7;function tick(){return __bwBinaryAdd(multiply(trace,10),1)}tick();');
    assert.ok(fn(defaults,'multiply').parameterDefaults?.length||fn(defaults,'multiply').params.parameterDefaults?.length,'actual default metadata must be present');
    refuse(defaults);
    assert.throws(()=>parse('function multiply(...values:any[]){return 7}'),/expected ident but found "\.\.\."/,'actual rest syntax is refused before any helper proof');
});

test('complete helper body binding and every reference remain obligations instead of callee-name or annotation authority',()=>{
    for(const source of [
        'function multiply(left:any,right:any):number{return foreign(left)};',
        'function multiply(left:any,right:any):number{return left.value*right};',
        'function multiply(left:any,right:any):number{return "forged" as any};',
        'function multiply(left:any,right:any):number{return left+right};',
        'function multiply(left:any,right:any):number{foreign();return left*right};'
    ])refuse(program(source+'let trace:any=7;function tick(){return __bwBinaryAdd(multiply(trace,10),1)}tick();'));
    for(const suffix of ['let escaped=multiply;','multiply=foreign;','unknown(multiply);','multiply({},10);']){
        refuse(program(capturedSource()+suffix));
    }
    const badEntry=program(multiply+';let trace:any=7;function tick(){return __bwBinaryAdd(multiply(trace,10),1)}tick();game.onUpdate(function(){trace={}});');
    refuse(badEntry);
});

test('new operation result currentness permanently revokes after observed body argument and writer restoration',()=>{
    for(const mode of ['body','argument','writer']){
        const ast=program(capturedSource()),proof=accept(ast);let restore;
        if(mode==='body'){
            const body=fn(ast,'multiply').body,saved=body[0].value;
            body[0].value={type:'Object',props:[]};restore=()=>{body[0].value=saved;};
        }else if(mode==='argument'){
            const call=invocation(ast,'multiply'),saved=call.args[0];call.args[0]={type:'Object',props:[]};restore=()=>{call.args[0]=saved;};
        }else{
            const declaration=ast.body.find(node=>node.type==='Declaration'&&node.decls[0].name==='trace').decls[0],saved=declaration.init;
            declaration.init={type:'Object',props:[]};restore=()=>{declaration.init=saved;};
        }
        assert.equal(proof.current(),false,mode);restore();assert.equal(proof.current(),false,'observed ABA must not revive '+mode);
        accept(ast);
    }
});

test('inherited absent semantic metadata is never read and permanently expires an already used new fact',()=>{
    const ast=program(capturedSource()),proof=accept(ast),key='restParam',previous=Object.getOwnPropertyDescriptor(Object.prototype,key);
    assert.equal(previous,undefined,'genuine baseline has no inherited rest marker');
    let reads=0;
    try{
        Object.defineProperty(Object.prototype,key,{configurable:true,get(){reads++;throw new Error('inherited metadata must not execute');}});
        assert.equal(proof.current(),false);assert.equal(reads,0);
    }finally{
        if(previous)Object.defineProperty(Object.prototype,key,previous);else delete Object.prototype[key];
    }
    assert.equal(reads,0);assert.equal(proof.current(),false,'restoring the inherited absence cannot revive authority');
    accept(ast);
});

test('reflection errors preserve their original identity then permanently revoke new operation results without rereads',()=>{
    const ast=program(capturedSource()),call=invocation(ast,'multiply'),original=call.args[0],failure=new Error('held source reflection failed');
    let armed=false,reflections=0;
    call.args[0]=new Proxy(original,{getOwnPropertyDescriptor(target,key){reflections++;if(armed)throw failure;return Reflect.getOwnPropertyDescriptor(target,key);}});
    const proof=accept(ast);armed=true;
    try{assert.throws(()=>proof.current(),error=>error===failure,'first failure must retain the exact original Error');}
    finally{armed=false;}
    const after=reflections;assert.equal(proof.current(),false);assert.equal(reflections,after,'revoked fact must not observe source again');
    call.args[0]=original;assert.equal(proof.current(),false);accept(ast);
});
