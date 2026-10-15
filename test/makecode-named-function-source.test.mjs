import test from 'node:test';
import assert from 'node:assert/strict';
import {parseMakeCodeTs} from '../overlay/scratch-gui/src/lib/bw-makecode/ts-import.js';
import {proveNamedFunctionSource} from '../overlay/scratch-gui/src/lib/bw-makecode/named-function-source.js';
import {lowerNamedFunctionValues} from '../overlay/scratch-gui/src/lib/bw-makecode/lower-named-function-values.js';
const parse=source=>parseMakeCodeTs(source,{retainCallableMetadata:true,parameterDefaults:true,retainParentheses:true});
const prove=source=>proveNamedFunctionSource(parse(source));

test('actual named Number/String/Void declarations retain their bodies and distinct stable sites',()=>{
    for(const [body,returnType]of [['return 7','number'],['return "ok"','string'],['count=7','void']]) {
        const input=parse(`let count=0;function read():${returnType}{${body}}let one=read;let two=read;${returnType==='void'?'one();':'let result=one();'}`),before=JSON.stringify(input);
        const lowered=lowerNamedFunctionValues(input);assert.deepEqual(lowered.unsupported,[]);
        assert.equal(JSON.stringify(input),before);
        assert.equal(lowered.program.bwCallableLexicalPlan.version,3);
        const decls=lowered.program.body.filter(node=>node.type==='FunctionDeclaration');
        assert.equal(decls.length,1);assert.equal(decls[0].name,'read');assert.equal(decls[0].bwCallableDefinition.functionKind,'declaration');
        assert.equal(lowered.program.bwCallables.length,1);assert.equal(lowered.program.sourceCallableDeclarations.length,2);
        assert.equal(lowered.program.body.filter(node=>node.type==='Declaration').flatMap(node=>node.decls).filter(row=>row.init?.bwCallableIntrinsic==='create').length,2);
    }
});

test('actual namespace symbol, declaration and origin survive candidate flattening',()=>{
    const lowered=lowerNamedFunctionValues(parse('namespace own {export function read():number{return 7}}let label=own.read;let result=label();'));
    assert.deepEqual(lowered.unsupported,[]);
    const owner=lowered.program.bwCallableLexicalPlan.owners.find(row=>row.kind==='declaration');
    assert.equal(owner.origin.kind,'namespace');assert.equal(owner.origin.path,'own.read');
    assert.equal(lowered.proof.origins.get([...lowered.proof.targets][0]).declaration.name,'read');
});

test('all actual binding, signature, initialization and body boundaries refuse',()=>{
    const cases=[
        'function read():number{return 7}function read():number{return 8}let label=read;',
        'function read():number{return 7}read=other;let label=read;',
        'function read(a:number):number{return a}let label=read;',
        'function read<T>():number{return 7}let label=read;',
        'function read():string{return 7}let label=read;',
        'function read(){return image.create(1,1)}let label=read;',
        'function read():number{if(true)return 7;return 8}let label=read;',
        'function read():number{return read()}let label=read;',
        'function read():number{return 7}let label=read;label=image.create(1,1);',
        'function read():number{return 7}let label=read;let alias=label;alias=image.create(1,1);',
        'function read():number{return 7}let label=read;let result=label(1);',
        'function read():number{return 7}let label=read;let result=new label();',
        'function read():number{return 7}let label=read;function nested(){let alias=label}',
        'let count:number=7;function read():number{return count}let label=read;',
        'function read():number{return 7}let label=read;let arrow=()=>7;',
        'function read():number{return 7}let label:()=>string=read;',
        'function read():number{return 7}let label=read;let imageValue=image.create(1,1);',
        'function read():void{missing=7}let label=read;',
        'function read():number{let local:number="bad";return 7}let label=read;',
        'function read():number{return 7}let label=read;let __bwCallables=1;',
        'function effect():void{}let label=effect;let empty=label();',
        'function read():number{return 7}let label=read;let kind=typeof label;'
    ];
    for(const source of cases)assert.equal(prove(source).eligible,false,source);
});

test('ordinary calls and established Arrow-only input are left to their existing gates',()=>{
    for(const source of ['function read():number{return 7}let result=read();','let arrow=()=>7;let result=arrow();']) {
        const proof=prove(source);assert.equal(proof.eligible,false);assert.deepEqual(proof.unsupported,[]);
    }
});
