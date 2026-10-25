import test from 'node:test';
import assert from 'node:assert/strict';
import {parseMakeCodeTs} from '../overlay/scratch-gui/src/lib/bw-makecode/ts-import.js';
import {compile} from '../scripts/lib/pxt-node.mjs';

const source=`let sequence = 0
function next(){sequence += 1; return sequence}
class Holder {
    constructor(public value:number = next(), private readonly update:(n:number)=>void = (n:number)=>{sequence += n}) {
        this.update(this.value)
    }
}
let object = new Holder()
let observed = sequence + object.value
observed += 0`;

test('constructor parameter properties preserve declared fields, defaults and assignments before user effects',()=>{
    const ast=parseMakeCodeTs(source,{parameterDefaults:true});
    const holder=ast.body.find(n=>n.type==='Class');
    assert.deepEqual(holder.ctor.params,['value','update']);
    assert.deepEqual(holder.fields.map(f=>[f.name,f.typeName,f.modifiers]),[
        ['value','number',['public']],['update','(n:number)=>void',['private','readonly']]
    ]);
    assert.deepEqual(holder.ctor.body.slice(0,2).map(n=>n.type),['If','If']);
    assert.deepEqual(holder.ctor.body.slice(2,4).map(n=>[n.expr.left.object.name,n.expr.left.name,n.expr.right.name]),[
        ['this','value','value'],['this','update','update']
    ]);
    assert.equal(holder.ctor.body[4].expr.callee.name,'update');
    assert.equal(holder.ctor.paramTypes.update.isArray,false);
    assert.deepEqual(holder.ctor.params.optionalParams,['value','update']);
});

test('original pinned Arcade compiler accepts constructor properties, numeric defaults and callback types',async()=>{
    const originalSource='class Holder {constructor(public value:number=3, private readonly update:(n:number)=>void=null){if(this.update)this.update(this.value)}}; let object=new Holder(); let observed=object.value; observed+=0';
    const result=await compile('arcade',{'main.ts':originalSource,'pxt.json':JSON.stringify({name:'parser-property-control',dependencies:{device:'*'},files:['main.ts']})});
    assert.equal(result.success,true,JSON.stringify(result.diagnostics));
    assert.deepEqual(result.diagnostics,[]);
    assert.ok(result.outfiles['binary.js']);
});

test('object index signatures remain a type, preserve following initializer and are not array parameters',()=>{
    const ast=parseMakeCodeTs('let timeouts: {[key: string]: number} = {}; function check(values: {[key:string]: number}, sprites:Sprite[]){return values["first"]}');
    assert.equal(ast.body[0].decls[0].typeName,'{[key:string]:number}');
    assert.equal(ast.body[0].decls[0].init.type,'Object');
    assert.equal(ast.body[1].paramTypes.values.isArray,false);
    assert.equal(ast.body[1].paramTypes.sprites.isArray,true);
    assert.equal(ast.body[1].body[0].value.type,'Index');
});

test('dotted namespaces retain nested scopes and original initialization effects',()=>{
    const ast=parseMakeCodeTs('namespace text.util {export let count=control.millis(); export function next(){count+=1;return count}}');
    assert.equal(ast.body[0].name,'text');
    const inner=ast.body[0].body[0];assert.equal(inner.name,'util');
    assert.equal(inner.body[0].exported,true);
    assert.equal(inner.body[0].decls[0].init.callee.name,'millis');
    assert.equal(inner.body[1].body[0].expr.op,'+=');
});

test('exponentiation preserves right association and multiplication precedence',()=>{
    const ast=parseMakeCodeTs('let value=2 ** 3 ** 2 * 4');
    const expr=ast.body[0].decls[0].init;
    assert.equal(expr.op,'*');assert.equal(expr.left.op,'**');assert.equal(expr.left.right.op,'**');
});

test('readonly parameter properties and object-typed fields do not consume following members',()=>{
    const ast=parseMakeCodeTs('class State{values:{[key:string]:number}={};constructor(readonly interval:number){} next(){return this.interval}} function name(readonly:number){return readonly}');
    assert.equal(ast.body[0].fields[0].typeName,'{[key:string]:number}');
    assert.equal(ast.body[0].fields[1].name,'interval');
    assert.equal(ast.body[0].ctor.body[0].expr.right.name,'interval');
    assert.equal(ast.body[0].methods[0].name,'next');
    assert.deepEqual(ast.body[1].params,['readonly']);
});


test('interface field type metadata remains available alongside object types',()=>{
    const ast=parseMakeCodeTs('interface Entry {value:number; buckets:{[key:string]:number}}');
    assert.deepEqual(ast.body[0].fields,[{name:'value',typeName:'number'},{name:'buckets',typeName:'{[key:string]:number}'}]);
});
