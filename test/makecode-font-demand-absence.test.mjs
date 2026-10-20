import test from 'node:test';
import assert from 'node:assert/strict';
import {parseMakeCodeTs} from '../overlay/scratch-gui/src/lib/bw-makecode/ts-import.js';
import {lowerSdkFontValues as eager,lowerSdkFontValuesForTranslation as owned} from '../overlay/scratch-gui/src/lib/bw-makecode/lower-sdk-font-values.js';
import {observeLoweringInput} from '../overlay/scratch-gui/src/lib/bw-makecode/lowering-input-observation.js';
import {prepareProcedureConstraintSourceForTranslation,procedureConstraintAstMetadata} from '../overlay/scratch-gui/src/lib/bw-makecode/procedure-constraint-source.js';
import {lowerConsoleInspectValues} from '../overlay/scratch-gui/src/lib/bw-makecode/lower-console-inspect-values.js';
const parse=source=>parseMakeCodeTs(source,{parameterDefaults:true,retainPrimitiveProcedureDefaults:true,retainCallableMetadata:true,retainParentheses:true});
const protocol=source=>{
    const parsed=parse(source),prepared=prepareProcedureConstraintSourceForTranslation(parsed,{mode:'supported-default'});
    return {...prepared.program,bwProcedureConstraintSource:procedureConstraintAstMetadata(prepared)};
};
const fontInput=source=>lowerConsoleInspectValues(protocol(source)).program;
const run=operation=>{try{return {value:operation()};}catch(error){return {error};}};
const compare=program=>{const before=observeLoweringInput(program),original=run(()=>eager(program)),actual=run(()=>owned(program));assert.deepEqual(actual,original);if(before)assert.equal(before.current(),true);return actual;};
const nodes=root=>{const out=[];const visit=value=>{if(!value||typeof value!=='object')return;if(!Array.isArray(value))out.push(value);for(const child of Object.values(value))visit(child);};visit(root);return out;};

test('actual original and console-cloned protocol envelopes admit complete font-free lowering without losing prefix identity',()=>{
    for(const make of [protocol,fontInput]){
        const input=make('let count=1;count+=2;'),prefix=input.bwProcedureConstraintSource.prefix;
        const observation=observeLoweringInput(input);assert.ok(observation);assert.equal(observation.current(),true);
        assert.equal(typeof prefix,'function');assert.deepEqual(Reflect.ownKeys(input.bwProcedureConstraintSource),['prefix']);
        const actual=compare(input).value;assert.ok(actual);assert.deepEqual(actual.unsupported,[]);
        assert.notEqual(actual.program,input);assert.notEqual(actual.program.body,input.body);
        assert.equal(actual.program.bwProcedureConstraintSource.prefix,prefix);
        assert.notEqual(actual.program.bwProcedureConstraintSource,input.bwProcedureConstraintSource);
        assert.equal(observation.current(),true);
    }
});

test('unique real function bindings recursion forwarding callbacks and unrelated Members preserve full clone results',()=>{
    for(const source of [
        'function echo(value:number){return value}let result=echo(2);',
        'function first(n:number){if(n>0)return second(n-1);return 0}function second(n:number){return first(n)}let result=first(2);',
        'function outer(n:number){function inner(value:number){return value}return inner(n)}let result=outer(2);',
        'let values=[1,2];values.push(3);let callback=()=>{let x=values.length;};',
        'function relay(value:image.Font){return value}let opaque:image.Font;relay(opaque);'
    ]){
        const input=fontInput(source);assert.ok(observeLoweringInput(input));
        const actual=compare(input).value;assert.ok(actual);assert.deepEqual(actual.unsupported,[]);
        assert.equal(nodes(actual.program).some(node=>node.bwFontValue||node.bwFontProducer||node.bwFontIntrinsic),false);
    }
});

test('same-spelling function declarations retain actual duplicate diagnostics and conservative distinct-scope fallback',()=>{
    const duplicate=parse('function same(){return 1}function same(){return 2}let value=same();');
    const actual=compare(duplicate).value;assert.ok(actual.unsupported.some(text=>/unique lexical declaration/.test(text)));
    const separate=fontInput('function outer(){function same(){return 1}return same()}function other(){function same(){return 2}return same()}outer();other();');
    const result=compare(separate).value;assert.deepEqual(result.unsupported,[]);
});

test('real Font constants factories metrics fields prints and glyph refusals remain on complete actual producer analysis',()=>{
    for(const source of [
        'let font=image.font8;let width=font.charWidth;let data=font.data;let scaled=image.scaledFont(font,2);',
        'let width=image.font5.charHeight;let selected=image.getFontForText("ok");',
        'let picture=image.create(10,10);picture.print("ok",1,2,3,image.font8);',
        'let picture=image.create(10,10);picture.print(1,1,2,3,image.font8);',
        'let font=image.font8;font.charWidth=9;',
        'image.font8.data.fill(0);'
    ])assert.ok(compare(fontInput(source)).value);
    const positive=compare(fontInput('let font=image.font8;let scaled=image.scaledFont(font,2);let width=scaled.charWidth;')).value;
    assert.deepEqual(positive.unsupported,[]);
    assert.ok(nodes(positive.program).some(node=>node.bwFontIntrinsic==='constant'));
    assert.ok(nodes(positive.program).some(node=>node.bwFontIntrinsic==='scaledFont'));
    assert.ok(nodes(positive.program).some(node=>node.bwFontIntrinsic==='field'));
    const bad=compare(fontInput('let font=image.font8;font.charWidth=9;')).value;
    assert.ok(bad.unsupported.some(text=>/mutation/.test(text)));
});

test('actual Number toString demand keeps its selected rewrite and wrong-arity diagnostic',()=>{
    const good=compare(fontInput('let value=12;let text=value.toString();')).value;
    assert.deepEqual(good.unsupported,[]);assert.ok(nodes(good.program).some(node=>node.bwPrimitiveNumberText===true));
    const bad=compare(fontInput('let value=12;let text=value.toString(2);')).value;
    assert.ok(bad.unsupported.some(text=>/zero-argument/.test(text)));
});

test('reserved Font bindings retained metadata malformed calls and exceptional source preserve eager diagnostics or actual errors',()=>{
    for(const source of ['let __bwSDK_Font=1;','let __bwSdkFont_fake=2;','function __bwSdkFont_fake(){return 1}',
        'function fail(){throw 2}fail();'])assert.deepEqual(run(()=>owned(parse(source))),run(()=>eager(parse(source))));
    const input=fontInput('let value=1;');input.body[0].decls[0].init.bwFontType='image.Font';compare(input);
    const malformed=parse('screen.print("hi");');nodes(malformed).find(node=>node.type==='Call').args=null;
    const original=run(()=>eager(malformed)),actual=run(()=>owned(malformed));assert.ok(original.error);assert.deepEqual(actual,original);
    const malformedShapes=[
        {type:'Program',body:[{type:'Identifier',name:1}]},
        {type:'Program',body:[{type:'Block',body:{}}]},
        {type:'Program',body:[null]},
        {type:'Program',body:new Array(1)},
        {type:'Program',body:[{type:'Class',name:1,methods:{},fields:[]}]},
        {type:'Program',body:[{type:'Switch',discriminant:{type:'Number',value:1},cases:{}}]}
    ];
    for(const bad of malformedShapes){const original=run(()=>eager(bad)),actual=run(()=>owned(bad));assert.ok(original.error);assert.deepEqual(actual,original);}
    const marker=new Error('actual font input accessor');let reads=0;
    const accessor=()=>{const p=parse('let value=1;');Object.defineProperty(p,'body',{enumerable:true,configurable:true,get(){reads++;throw marker;}});return p;};
    assert.throws(()=>eager(accessor()),error=>error===marker);assert.equal(reads,1);
    assert.throws(()=>owned(accessor()),error=>error===marker);assert.equal(reads,2);
});

test('changed native admission falls back to original actual callbacks and throw identity then restores fresh input',()=>{
    const originalInput=fontInput('let value=1;'),actualInput=fontInput('let value=1;'),freeze=Object.freeze,marker=new Error('actual changed freeze');
    const changed=(lower,input)=>{let calls=0,error;try{Object.freeze=()=>{calls++;throw marker;};try{lower(input);}catch(caught){error=caught;}}finally{Object.freeze=freeze;}return {calls,error};};
    const original=changed(eager,originalInput),actual=changed(owned,actualInput);
    assert.ok(original.calls>0);assert.equal(original.error,marker);assert.equal(actual.error,marker);assert.equal(actual.calls,original.calls);
    // The original graph's final freeze is an actual return boundary. A falsy
    // graph must still fail at the original public diagnostics read, never
    // become the private absence sentinel.
    const falsy=(lower,input)=>{let calls=0,result;try{Object.freeze=value=>{if(value&&typeof value.typesAt==='function'){calls++;return null;}return freeze(value);};result=run(()=>lower(input));}finally{Object.freeze=freeze;}return {calls,result};};
    const originalNull=falsy(eager,originalInput),actualNull=falsy(owned,actualInput);
    assert.equal(originalNull.calls,1);assert.equal(actualNull.calls,1);
    assert.ok(originalNull.result.error instanceof TypeError);assert.ok(actualNull.result.error instanceof TypeError);
    assert.equal(actualNull.result.error.message,originalNull.result.error.message);
    const fresh=fontInput('let value=1;');assert.ok(observeLoweringInput(fresh));assert.deepEqual(compare(fresh).value.unsupported,[]);
});

test('current physical replacement and number descriptor values never retain an absence decision across calls',()=>{
    const input=fontInput('let value=1;');const initial=input.body[0].decls[0].init;
    const before=observeLoweringInput(input);assert.ok(before);compare(input);
    input.body[0].decls[0].init={type:'Member',object:{type:'Identifier',name:'image'},name:'font8'};
    assert.equal(before.current(),false);assert.ok(nodes(compare(input).value.program).some(node=>node.bwFontIntrinsic==='constant'));
    input.body[0].decls[0].init=initial;assert.equal(before.current(),false);compare(input);
    for(const value of [-0,NaN,Infinity]){initial.value=value;const actual=compare(input).value;assert.ok(Object.is(actual.program.body[0].decls[0].init.value,value));}
});
