import test from 'node:test';
import assert from 'node:assert/strict';
import Creator from '../overlay/scratch-gui/src/lib/sb3-creator.js';
import {parseMakeCodeTs} from '../overlay/scratch-gui/src/lib/bw-makecode/ts-import.js';
import {lowerMathIdivValues} from '../overlay/scratch-gui/src/lib/bw-makecode/math-idiv-source.js';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {MATH_IDIV_SOURCE} from './fixtures/arcade/math-idiv.mjs';
const visit=(node,predicate)=>node&&typeof node==='object'&&(predicate(node)||Object.values(node).some(value=>Array.isArray(value)?value.some(item=>visit(item,predicate)):visit(value,predicate)));
let diagnosticCounter=0;
function captureDiagnostics(value,required){
    const keys=Object.keys(value),channels={};
    for(const key of new Set([...keys.filter(key=>/unsupported|warning|error|unparsed|diagnostic|refusal/i.test(key)),...required])){
        const provided=Object.hasOwn(value,key),actual=value[key];channels[key]={provided,valueKind:!provided?'notprovided':actual===undefined?'undefined':Array.isArray(actual)?'array':actual===null?'null':typeof actual,value:!provided||actual===undefined?null:structuredClone(actual)};
    }
    return {returnedKeys:keys,channels};
}
const diagnosticIssue=value=>Array.isArray(value)?value.length>0:value&&typeof value==='object'?Object.keys(value).length>0:typeof value==='number'?value!==0:Boolean(value);
function requireClear(observed,required,source){
    for(const key of required)assert.ok(observed.channels[key]?.provided&&observed.channels[key].valueKind==='array'&&observed.channels[key].value.length===0,key+' diagnostic; actual source: '+source);
    for(const [key,row]of Object.entries(observed.channels))if(row.provided)assert.ok(row.valueKind!=='undefined'&&!diagnosticIssue(row.value),key+' diagnostic; actual source: '+source);
}
function current(source){
    const actualSource=typeof source==='string'?source:source['main.ts'],imported=arcadeToPseudocode(source),sourceDiagnostics=captureDiagnostics(imported,['unsupported','warnings']);
    console.error(JSON.stringify({kind:'idiv-pure-diagnostics',counter:++diagnosticCounter,stage:'source',source:actualSource,...sourceDiagnostics}));requireClear(sourceDiagnostics,['unsupported','warnings'],actualSource);
    const creator=new Creator();let parseError=null;
    try{creator.parse(imported.code);}catch(error){parseError=error;throw error;}finally{console.error(JSON.stringify({kind:'idiv-pure-diagnostics',counter:++diagnosticCounter,stage:'Creator',parseError:parseError?{message:parseError.message,stack:parseError.stack,cause:Object.hasOwn(parseError,'cause')?String(parseError.cause):null}:null,...captureDiagnostics(creator,['errors','warnings','unparsed'])}));}
    requireClear(captureDiagnostics(creator,['errors','warnings','unparsed']),['errors','warnings','unparsed'],actualSource);return {imported,creator};
}
const idiv=node=>node.type==='Call'&&node.callee?.type==='Member'&&node.callee.name==='idiv'&&node.callee.object?.name==='Math';

test('idiv selected source exposes real converted editable operands and downstream Number text',()=>{
    const {creator}=current(MATH_IDIV_SOURCE),blocks=creator.project.targets.flatMap(t=>Object.values(t.blocks));
    assert.ok(blocks.some(b=>b.opcode==='arrays_valueBinary'&&b.fields.OP?.[0]==='/'));
    assert.ok(blocks.filter(b=>b.opcode==='arrays_valueBinary'&&b.fields.OP?.[0]==='|').length>=3);
    const result=projectToArcade(creator.project);assert.deepEqual(result.unsupported,[],result.unsupported.join('\n'));
    assert.equal(visit(parseMakeCodeTs(result.files['main.ts']),idiv),false,'current expressions cannot be renamed into the SDK API');
    current(result.files);
});

test('idiv actual mutable Number aliases ordinary helpers and captured entry dominance qualify',()=>{
    for(const source of ['let a=7;let b=a;a=9;let q=Math.idiv(b,a)',
        'function quotient(a,b){return Math.idiv(a,b)};let q=quotient(7,2)',
        'let captured=7;function read(){return captured};let q=Math.idiv(read(),2)',
        'function outer(a){function read(){return a};return Math.idiv(read(),2)};let q=outer(7)',
        'function consume(value:number){return value+1};let q=consume(Math.idiv(7,2))',
        'let text=Math.idiv(7,2).toString();let canvas=image.create(8,8);canvas.print(text,0,0,1,image.font5)'])current(source);
});

test('idiv SDK shadows extraction and root/member mutation cannot grant intrinsic identity',()=>{
    for(const source of ['let Math=0;let q=Math.idiv(7,2)',
        'function f(Math){return Math.idiv(7,2)};f(1)',
        'let Math=0;function f(){return Math.idiv(7,2)};f()',
        'let q=Math.idiv(7,2);Math.idiv=unknown',
        'if(true){Math.idiv=unknown};let q=Math.idiv(7,2)',
        'let alias=Math;let q=Math.idiv(7,2)',
        'let alias=Math.idiv;let q=Math.idiv(7,2)',
        'Math["idiv"]=unknown;let q=Math.idiv(7,2)',
        'let alias=Math.idiv;let q=alias(7,2)',
        'namespace Math{export function idiv(a,b){return a}};let q=Math.idiv(7,2)']){
        const lowered=lowerMathIdivValues(parseMakeCodeTs(source));assert.ok(lowered.unsupported.length,source);
    }
});

test('idiv exact plain call and initialized Number domains reject mixed and opaque obligations',()=>{
    for(const source of ['let q=Math.idiv(7)','let q=Math.idiv(7,2,1)','let q=new Math.idiv(7,2)',
        'let q=Math.idiv<number>(7,2)','let q=Math.idiv("20",2)','let q=Math.idiv(null,2)',
        'let q=Math.idiv(undefined,2)','let q=Math.idiv(true,2)','let a:number;let q=Math.idiv(a,2)',
        'let q=Math.idiv(a,2);let a=7','let a=7;let q=Math.idiv(a,2);a="20" as any',
        'let q=Math.idiv(image.create(1,1),2)','let q=Math.idiv([1],2)',
        'function next(){return 7};next=unknown;let q=Math.idiv(next(),2)',
        'function next():number{return "20" as any};let q=Math.idiv(next(),2)']){
        assert.ok(arcadeToPseudocode(source).unsupported.some(value=>value.includes('Math.idiv')),source);
    }
});

test('idiv captures require every actual entry and cannot borrow late or escaped initialization',()=>{
    for(const source of ['function read(){return captured};let q=Math.idiv(read(),2);let captured=7',
        'let captured;function read(){return captured};read();captured=7;let q=Math.idiv(read(),2)',
        'function f(value){return Math.idiv(value,2)};let alias=f;alias("20" as any);f(7)',
        'function f(){let value:number;return Math.idiv(value,2)};let q=f()',
        'function outer(a){function read(){return a};return Math.idiv(read(),2)};let alias=outer;alias("20" as any);outer(7)',
        'function f(a){if(a>0){f(a-1)}return Math.idiv(a,2)};let alias=f;alias("20" as any);f(7)']){
        assert.ok(arcadeToPseudocode(source).unsupported.some(value=>value.includes('Math.idiv')),source);
    }
});

test('idiv absence leaves the actual original Program and ordinary namespace behavior unchanged',()=>{
    const program=parseMakeCodeTs('let a=1;let b=a+2;function f(value){return value/2}');
    const result=lowerMathIdivValues(program);assert.equal(result.program,program);assert.deepEqual(result.unsupported,[]);
});

test('idiv does not reinterpret ordinary quotient conversion as input-converting SDK division',()=>{
    const {creator}=current('let q=(1/0.5)|0'),result=projectToArcade(creator.project);assert.deepEqual(result.unsupported,[]);
    assert.equal(visit(parseMakeCodeTs(result.files['main.ts']),idiv),false);current(result.files);
});

// Nested functions that read only their enclosing function's never-written
// parameters agree with original PXT through Lite's VM and its export.
test('nested parameter captures agree with original PXT through the VM and export',async()=>{
    const {runPxtArcade}=await import('./helpers/pxt-arcade-runtime.mjs');
    const {runProgram,clearStrayTimers}=await import('./helpers/bw-vm.mjs');
    const cases=[
        ['function outer(a:number){function read(){return a};return Math.idiv(read(),2)};let q=outer(7)',{q:3}],
        ['let g=0;function outer(a:number){function inc(){g=a+1};inc();return g};let q=outer(7)',{q:8,g:8}],
        ['function outer(a:number,b:number){function mix(c:number){return a*10+b+c};return mix(1)+mix(2)};let q=outer(4,5)',{q:93}]];
    for(const[source,expected]of cases){
        const files={'main.ts':source,'pxt.json':JSON.stringify({dependencies:{device:'*'},files:['main.ts']})};
        const original=await runPxtArcade(files,{fakeClock:true,waitForGlobals:expected});
        for(const[key,value]of Object.entries(expected))assert.equal(original[key],value,'original '+key+': '+source);
        const {imported}=current(source);
        const run=await runProgram(imported.code,{frames:20,storage:true});
        try{
            const vars=Object.fromEntries(run.vm.runtime.targets.flatMap(t=>Object.values(t.variables)).map(v=>[v.name.replace(/^Game_/,''),v.value]));
            assert.deepEqual(run.errors,[]);
            for(const[key,value]of Object.entries(expected))assert.equal(Number(vars[key]),value,'Lite '+key+': '+source);
            const exported=projectToArcade(JSON.parse(run.vm.toJSON()));assert.deepEqual(exported.unsupported,[]);
            const back=await runPxtArcade(exported.files,{fakeClock:true,waitForGlobals:expected});
            for(const[key,value]of Object.entries(expected))assert.equal(back[key],value,'export '+key+': '+source);
        }finally{run.vm.quit();clearStrayTimers();}
    }
});

test('nested captures of written parameters or enclosing locals are not lifted',()=>{
    for(const source of ['function outer(a:number){function read(){return a};a=9;return Math.idiv(read(),2)};let q=outer(7)',
        'function outer(a:number){let b=a;function read(){return b};return Math.idiv(read(),2)};let q=outer(7)',
        'function outer(a:number){function read(){return a};let f=read;return Math.idiv(f(),2)};let q=outer(7)'])
        assert.ok(arcadeToPseudocode(source).unsupported.length,source);
});
