import test from 'node:test';
import assert from 'node:assert/strict';
import {parseMakeCodeTs} from '../overlay/scratch-gui/src/lib/bw-makecode/ts-import.js';
import {localArrayDeclarationResetSource} from '../overlay/scratch-gui/src/lib/bw-makecode/local-array-declaration-reset-source.js';
import {analyseSourceValueProducers} from '../overlay/scratch-gui/src/lib/bw-makecode/source-value-producers.js';

const observe=source=>{
    const program=parseMakeCodeTs(source,{retainCallableMetadata:true}),nodes=[];
    const visit=node=>{if(!node||typeof node!=='object')return;if(Array.isArray(node)){node.forEach(visit);return;}
        nodes.push(node);for(const [key,value]of Object.entries(node))if(!['paramTypes','parameterDefaults','originalBody'].includes(key))visit(value);};visit(program);
    const decl=nodes.find(node=>node.type==='Declaration'&&node.decls.some(value=>value.name==='values'))?.decls.find(value=>value.name==='values');
    return {program,nodes,decl,proof:localArrayDeclarationResetSource(program),graph:analyseSourceValueProducers(program,
        {arrayValues:true,arrayEffectSites:true,unboundIsOpaque:true,declaredLocalUndefined:true,initializationEntries:true})};
};
const source='function run(){let values:number[]=null;values=[];values.push(1);let missing=values[99]}run();';

test('an immediately overwritten uncaptured local reset contributes no Array element type',()=>{
    for(const reset of ['null','undefined']){
        const {nodes,decl,proof,graph}=observe(source.replace('=null','= '+reset));
        const read=nodes.find(node=>node.type==='Index');
        assert.equal(proof.discount(decl),true);
        assert.deepEqual([...graph.typesAt(read)].sort(),['Number','Undefined']);
        assert.equal(graph.isInitializedAt(read.object),true);
        assert.equal(graph.arrayAllocationsAt(read.object).length,1);
        assert.deepEqual([...graph.arrayElementTypesAt(read.object)],['Number']);
        assert.deepEqual([...graph.typesAt(decl.init)],[reset==='null'?'Null':'Undefined']);
    }
});

test('declaration reset recognition refuses captures, hidden defaults, timing and binding ambiguities',()=>{
    const refused=[
        'let values:number[]=null;values=[];',
        'function f(){var values:number[]=null;values=[]}',
        'function f(){const values:number[]=null;values=[]}',
        'function f(){let values:number[]=null,other=0;values=[]}',
        'function f(){let values:number[]=null;pause(1);values=[]}',
        'function f(){let values:number[]=null;if(true){values=[]}}',
        'function f(){let values:number[]=null;values=[values]}',
        'function f(){let values:number[]=null;values=foreign()}',
        'function f(){let values:number[]=null;values=[];function later(){return values}}',
        'function f(){let values:number[]=null;values=[];game.onUpdate(()=>{values=null})}',
        'function f(){let values:number[]=null;values=[];function later(x:any=values){}}',
        'function f(){eval("saved=()=>values");let values:number[]=null;values=[]}',
        'function f(){class Later{field=values}let values:number[]=null;values=[]}',
        'function f(){let values:number[]=null;values=[];class Later{static field=values}}',
        'function f(){let values:number[]=null;{let values:number[];values=[]}}',
        'function f(){let values:number[]=null;values=[];let values:number[]}',
        'class C{method(){let values:number[]=null;values=[]}}'
    ];
    for(const text of refused){const {decl,proof}=observe(text);assert.ok(decl,text);assert.equal(proof.discount(decl),false,text);}
});

test('later null and incompatible writers remain in the complete binding domain',()=>{
    for(const writer of ['values=null;','values="bad";']){
        const {nodes,proof,decl,graph}=observe(source.replace('let missing=',writer+'let missing='));
        const read=nodes.find(node=>node.type==='Index');
        assert.equal(proof.discount(decl),true);
        assert.ok([...graph.bindingTypesAt(read.object)].includes(writer.includes('null')?'Null':'String'));
        assert.equal(graph.arrayMapReceiverSafeAt(read.object),false);
        assert.equal(graph.arrayAllocationsAt(read.object).length,0);
    }
});

test('discarding a reset grants no initialization before the declaration',()=>{
    const {nodes,graph}=observe(source.replace('let values:number[]=null','let early=values[0];let values:number[]=null'));
    const read=nodes.find(node=>node.type==='Index');assert.equal(graph.isInitializedAt(read.object),false);
});

test('source mutation permanently revokes every dependent cached Array result and readiness API',()=>{
    const {nodes,program,proof,decl,graph}=observe(source),read=nodes.find(node=>node.type==='Index');
    assert.equal(proof.discount(decl),true);assert.deepEqual([...graph.typesAt(read)].sort(),['Number','Undefined']);
    const allocation=nodes.find(node=>node.type==='Assignment').right;
    allocation.items.push({type:'String',value:'edited'});
    assert.equal(proof.current(),false);assert.deepEqual([...graph.typesAt(read)],[]);
    assert.equal(graph.isInitializedAt(read.object),false);assert.equal(graph.arrayMapReceiverSafeAt(read.object),false);
    assert.deepEqual(graph.arrayAllocationsAt(read.object),[]);assert.deepEqual(graph.possibleArrayAllocationsAt(read.object),[]);
    assert.deepEqual([...graph.arrayElementTypesAt(read.object)],[]);assert.ok(graph.arrayConstraintErrorsAt(read.object).length);
    assert.equal(graph.lexicalDeclarationReadinessCurrent(),false);
    allocation.items.pop();assert.equal(proof.current(),false);assert.deepEqual([...graph.typesAt(read)],[]);
    assert.equal(graph.isLexicalDeclarationExecutedAt(read.object,graph.bindingOf(read.object)),false);
    assert.equal(graph.isCapturedLexicalDeclarationReadyAt(read.object),false);
    assert.equal(program.type,'Program');
});

test('intrinsic replacement revokes reset-dependent facts permanently',()=>{
    const {decl,proof,graph,nodes}=observe(source),read=nodes.find(node=>node.type==='Index');
    assert.equal(proof.discount(decl),true);
    const original=Object.getOwnPropertyDescriptor(JSON,'stringify');
    try{
        Object.defineProperty(JSON,'stringify',{...original,value:()=> 'forged snapshot'});
        assert.equal(proof.current(),false);assert.deepEqual([...graph.typesAt(read)],[]);
    }finally{Object.defineProperty(JSON,'stringify',original);}
    assert.equal(proof.current(),false);assert.deepEqual([...graph.typesAt(read)],[]);
});

test('unknown executable forms cannot hide a later capture from reset admission',()=>{
    const {program,decl}=observe(source);
    program.body[0].body.unshift({type:'DeferredOpaqueEffect',raw:'return values'});
    assert.equal(localArrayDeclarationResetSource(program).discount(decl),false);
});
