import test from 'node:test';
import assert from 'node:assert/strict';
import {parseMakeCodeTs} from '../overlay/scratch-gui/src/lib/bw-makecode/ts-import.js';
import {GENERATED_HELPER_PROFILES as P} from '../overlay/scratch-gui/src/lib/bw-makecode/generated-helper-recognition.js';
import {nativeArrayAddHelperSource} from '../overlay/scratch-gui/src/lib/bw-makecode/native-array-binary-helper-source.js';
import {inspectNativeAdditionExportDomains} from '../overlay/scratch-gui/src/lib/bw-makecode/native-array-binary-domain.js';

const helper=nativeArrayAddHelperSource('__bwBinaryAdd',true,true);
const source=({prefix='',fill='temp.push("5");temp.push(undefined);',assign='rows=temp;',gap='',index='0',after='',root='__bwStartup();'}={})=>
    `${helper}\nfunction __bwStartup(){let temp:any[]=null;${prefix}temp=[];${fill}${assign}${gap}rows[${index}]=__bwBinaryAdd(rows[${index}],2);${after}}\nlet rows:any[]=null;${root}`;
const inspect=text=>inspectNativeAdditionExportDomains(parseMakeCodeTs(text,P.ordinary));
const pass=text=>{const proof=inspect(text);assert.equal(proof.reason,null,text);assert.equal(proof.current(),true);return proof;};
const refuse=text=>{const proof=inspect(text);assert.equal(typeof proof.reason,'string',text);assert.equal(proof.helpers.size,0,text);return proof;};

test('one closed startup supplies primitive Array elements only to its immediately following indexed read',()=>{
    pass(source());
    pass(source({index:'99'})); // Missing element is Undefined; no presence is inferred.
    pass(source({fill:'temp.push(null);temp.push(false);temp.push(4);'}));
});

test('a null global writer cannot turn into an Array result through a type spelling',()=>{
    refuse(source({assign:'rows=null;'}));
});

test('private allocation and all pre-read element writers remain closed and primitive',()=>{
    refuse(source({fill:'temp.push({value:1});'}));
    refuse(source({fill:'temp.push([1]);'}));
    refuse(source({fill:'temp.push("5");temp[0]={value:1};'}));
    refuse(source({prefix:'let early=temp;'}));
    refuse(source({assign:'rows=foreign();'}));
});

test('branch and prototype mutation retain refusal',()=>{
    refuse(source({gap:'if(true){rows=null;}'}));
    refuse(source({prefix:'Array.prototype.push=foreign;'}));
});

test('a consumed source receipt expires permanently after mutation',()=>{
    const program=parseMakeCodeTs(source(),P.ordinary),proof=inspectNativeAdditionExportDomains(program);
    assert.equal(proof.reason,null);
    const startup=program.body.find(node=>node.type==='FunctionDeclaration'&&node.name==='__bwStartup');
    startup.body.find(node=>node.type==='ExpressionStatement'&&node.expr?.type==='Assignment'&&node.expr.left?.type==='Index').expr.left.index.value='1';
    assert.equal(proof.current(),false);
    startup.body.find(node=>node.type==='ExpressionStatement'&&node.expr?.type==='Assignment'&&node.expr.left?.type==='Index').expr.left.index.value='0';
    assert.equal(proof.current(),false);
});

test('a numeric inherited Array getter expires a previously issued primitive read',()=>{
    const proof=inspect(source({index:'99'}));
    assert.equal(proof.reason,null);
    const old=Object.getOwnPropertyDescriptor(Array.prototype,'99');
    try{
        Object.defineProperty(Array.prototype,'99',{configurable:true,get(){return {opaque:true};}});
        assert.equal(proof.current(),false);
    }finally{
        if(old)Object.defineProperty(Array.prototype,'99',old);
        else delete Array.prototype[99];
    }
    assert.equal(proof.current(),false);
});
