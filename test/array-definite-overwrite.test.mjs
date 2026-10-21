import test from 'node:test';
import assert from 'node:assert/strict';
import Creator from '../overlay/scratch-gui/src/lib/sb3-creator-register-art.js';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade,projectJsonToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {createArrayReferenceExportAuthority} from '../overlay/scratch-gui/src/lib/bw-makecode/array-reference-export-authority.js';

import {createProjectJsonSnapshot,isProjectJsonSnapshot} from '../overlay/scratch-gui/src/lib/bw-makecode/project-json-snapshot.js';

const clean=result=>{for(const name of ['unsupported','warnings','errors','unparsed'])if(Object.hasOwn(result,name))assert.deepEqual(result[name],[],name);};
const parse=code=>{const creator=new Creator();creator.parse(code);clean(creator);return creator;};
const source=text=>{const result=arcadeToPseudocode(text);clean(result);return parse(result.code);};
const lengths=project=>project.targets.flatMap(target=>Object.values(target.blocks).filter(node=>node.opcode==='arrays_referenceLength').map(node=>({target,node})));
const checkProject=(project,expected)=>{const rows=lengths(project);assert.ok(rows.length,'actual Array length consumers');const proof=createArrayReferenceExportAuthority(project);
    for(const {target,node} of rows)assert.equal(proof.validateInput(target,node).ok,expected);return {proof,...rows[0]};};
const checks=(creator,expected)=>checkProject(createProjectJsonSnapshot(JSON.stringify(creator.project)),expected);
const localPrefix=`DEVICE ARCADE
GLOBAL published
GLOBAL out
WHEN arcade source starts:
  CALL: (build)
DEFINE build:
  arcade set local retained to (null value)
  arcade set local unrelated to ((0 + 0))
  arcade set local fresh to (new array reference from ("[]"))
  set published to (arcade local fresh)
  mutate array reference (published) op "push" index 0 value 1
  mutate array reference (published) op "unshift" index 0 value 2
  arcade set local retained to (published)
  set out to (length of array reference (arcade local retained))
`;
const globalSource='let ordinary:number[]=null;let alias:number[]=null;let result=0;function build(){ordinary=[];alias=ordinary;alias.push(1);result=alias.length;}build();';
const refusals=code=>checks(parse(code),false);
const rejectedSource=text=>checks(source(text),false);

test('a grouped local reset crosses scalar initialization and a stored published Array without inventing a fresh body',()=>{
    const c=parse(localPrefix),before=JSON.stringify(c.project);checks(c,true);assert.equal(JSON.stringify(c.project),before);
    const all=c.project.targets.flatMap(t=>Object.values(t.blocks));
    assert.ok(all.some(n=>n.opcode==='arrays_specialValue'&&n.fields.KIND[0]==='null'),'real reset remains in source');
    assert.ok(all.some(n=>n.opcode==='operator_add'),'actual scalar operand remains');
    assert.deepEqual(projectJsonToArcade(JSON.stringify(c.project)).unsupported,[]);
});

test('actual source-start null writers are overwritten inside their exact ordinary callee before every receiver read',()=>{
    const c=source(globalSource);checks(c,true);assert.deepEqual(projectJsonToArcade(JSON.stringify(c.project)).unsupported,[]);
    const nested=source('let rows:number[][]=null;let alias:number[][]=null;let row:number[]=null;function same(value:number[][]):number[][]{return value;}function build(){rows=[];alias=same(rows);alias.push([1]);row=rows[0];let count=row.length;}build();');
    checks(nested,true);assert.deepEqual(projectJsonToArcade(JSON.stringify(nested.project)).unsupported,[]);
});

test('discarding a reset never supplies an Array RHS or removes another opaque writer',()=>{
    refusals(localPrefix.replace('arcade set local retained to (published)','arcade set local retained to "opaque"'));
    refusals(localPrefix.replace('set out to (length','arcade set local retained to (null value)\n  set out to (length'));
    rejectedSource(globalSource+'ordinary=null;');
    rejectedSource(globalSource.replace('alias=ordinary;','alias="foreign" as any;'));
});

test('a reset read alias capture yield or unknown call before overwrite cannot disappear',()=>{
    for(const inserted of [
        'set out to (length of array reference (arcade local retained))',
        'arcade set local leaked to (arcade local retained)',
        'wait 0.01 seconds',
        'CALL: (unknown)',
        'arcade set captured retained to (null value)'
    ])refusals(localPrefix.replace('arcade set local unrelated to',inserted+'\n  arcade set local unrelated to')+'\nDEFINE unknown:\n  wait 0.01 seconds\n');
    rejectedSource('let ordinary:number[]=null;function build(){game.onUpdate(function(){let x=ordinary.length;});ordinary=[];let count=ordinary.length;}build();');
});

test('conditional cyclic escaped and competing entries retain global reset obligations',()=>{
    rejectedSource(globalSource.replace('ordinary=[];','if(controller.A.isPressed()){ordinary=[];}'));
    rejectedSource(globalSource.replace('build();','build();build();'));
    rejectedSource(globalSource.replace('ordinary=[];','build();ordinary=[];'));
    rejectedSource(globalSource.replace('build();','game.onUpdate(function(){build();});'));
    rejectedSource(globalSource.replace('ordinary=[];','for(let i=0;i<1;i++){ordinary=[];}'));
});

test('closed pure constructors before overwrite do not exempt constructor publication or callbacks',()=>{
    const base='class Box{constructor(public n:number){}}function build(){let kept:number[]=null;let gap=0;let fresh:number[]=[];kept=fresh;let box=new Box(1);let count=kept.length;}build();';
    const c=source(base);checks(c,true);assert.deepEqual(projectJsonToArcade(JSON.stringify(c.project)).unsupported,[]);
    const early=source(base.replace('let gap=0;','let gap=0;let early=new Box(2);'));
    checks(early,true);checkProject(early.project,false);assert.deepEqual(projectJsonToArcade(JSON.stringify(early.project)).unsupported,[]);
    rejectedSource(base.replace('class Box{constructor(public n:number){}}','let published=0;class Box{constructor(public n:number){published=n;}}').replace('let gap=0;','let gap=0;let early=new Box(2);'));
    rejectedSource(base.replace('class Box{constructor(public n:number){}}','class Box{constructor(public n:number){game.onUpdate(function(){});}}').replace('let gap=0;','let gap=0;let early=new Box(2);'));
    refusals(localPrefix.replace('arcade set local unrelated to ((0 + 0))','arcade set local __proto__ to "foreign"'));
    const badURL=parse(localPrefix);badURL.project.extensionURLs.arrays='https://example.invalid/foreign-arrays.js';checks(badURL,false);
    const foreign=parse(localPrefix);foreign.project.extensions.push('foreign');checks(foreign,false);
});

test('new reset facts require genuine owned JSON and cannot enroll caller objects or mutable metadata',()=>{
    const c=parse(localPrefix);checkProject(c.project,false);
    const frozen=structuredClone(c.project);Object.freeze(frozen);checkProject(frozen,false);
    const owned=createProjectJsonSnapshot(JSON.stringify(c.project));assert.equal(isProjectJsonSnapshot(owned),true);
    const actual=checkProject(owned,true);assert.equal(Object.isFrozen(owned),true);
    const writer=Object.values(actual.target.blocks).find(n=>n.opcode==='arrays_mutateReference');
    assert.deepEqual(writer.inputs.OP,[1,[10,'push']],'actual first mutation has a literal inline selector');
    const selector=writer.inputs.OP[1],previous=selector[1];
    assert.throws(()=>{selector[1]='foreign';},TypeError);
    assert.equal(selector[1],previous);assert.equal(actual.proof.validateInput(actual.target,actual.node).ok,true);
    const proxy=new Proxy(owned,{});assert.equal(isProjectJsonSnapshot(proxy),false);checkProject(proxy,false);
    for(const kind of ['selector','index']){
        const raw=parse(localPrefix);raw.project.monitors=[];
        const stage=raw.project.targets.find(t=>Object.values(t.blocks).some(n=>n.opcode==='arrays_mutateReference'));
        const mutation=Object.values(stage.blocks).find(n=>n.opcode==='arrays_mutateReference');
        assert.deepEqual(mutation.inputs.OP,[1,[10,'push']],'raw control selects the actual inline OP');
        const row=kind==='selector'?mutation.inputs.OP[1]:mutation.inputs.INDEX[1];
        assert.ok(Array.isArray(row)&&row.length===2,'actual inline '+kind+' tuple');
        Object.defineProperty(raw.project.monitors,'toJSON',{value(){row[1]='foreign';return [];}});
        checkProject(raw.project,false);
        assert.equal(isProjectJsonSnapshot(raw.project),false);
    }
    // A branded root cannot borrow even nonenumerable graph containers.
    for(const name of ['targets','blocks','variables','inputs','fields']){
        const raw=parse(localPrefix).project,copy=structuredClone(raw);
        let inherited;
        if(name==='targets'){inherited=copy.targets;delete copy.targets;}
        else if(name==='blocks'||name==='variables'){
            const target=copy.targets.find(t=>Object.keys(t.blocks).length);inherited=target[name];delete target[name];
        }else{
            const target=copy.targets.find(t=>Object.values(t.blocks).some(n=>n.opcode==='arrays_referenceLength'));
            const node=Object.values(target.blocks).find(n=>n.opcode==='arrays_referenceLength');inherited=node[name];delete node[name];
        }
        const json=JSON.stringify(copy),previous=Object.getOwnPropertyDescriptor(Object.prototype,name);
        assert.equal(previous,undefined,'control owns temporary inherited '+name);
        try{
            Object.defineProperty(Object.prototype,name,{configurable:true,writable:true,value:inherited});
            const borrowed=createProjectJsonSnapshot(json);assert.equal(isProjectJsonSnapshot(borrowed),true);
            checkProject(borrowed,false);
        }finally{delete Object.prototype[name];}
        assert.equal(Object.getOwnPropertyDescriptor(Object.prototype,name),undefined);
    }
    const fresh=parse(localPrefix),stage=fresh.project.targets.find(t=>Object.values(t.variables||{}).some(v=>v[0]==='published'));
    const published=Object.entries(stage.variables).find(([,v])=>v[0]==='published');assert.ok(published);
    fresh.project.monitors=[{visible:true,mode:'slider',opcode:'data_variable',id:published[0],params:{VARIABLE:'published'},spriteName:null}];
    checks(fresh,false);
    assert.throws(()=>createProjectJsonSnapshot(c.project),TypeError,'object inputs are not serialized or enrolled by the ingress');
});

test('real numeric and class Array exports retain all initializers through outer Code and exact-file reimport',()=>{
    for(const text of [
        'let items=[1,2];let alias=items;alias.push(3);alias.unshift(0);alias.removeElement(2);let count=items.length;',
        'class Box{constructor(public n:number){}read():number{return this.n}}let boxes=[new Box(1)];let alias=boxes;alias.push(new Box(2));let observed=boxes[0].read();'
    ]){
        const c=source(text),before=JSON.stringify(c.project),first=projectToArcade(c.project);clean(first);
        const feedback=parse(c.decompile());clean(projectToArcade(feedback.project));
        const imported=arcadeToPseudocode(first.files);clean(imported);
        const second=parse(imported.code),raw=projectToArcade(second.project);
        if(text.startsWith('class Box')){
            assert.match(first.ts,/let __bwPxtValue\d+: Box\[\] = null/);
            assert.match(first.ts,/^let boxes: Box\[\]$/m,'source-reference globals preserve their uninitialized declaration');
            const all=second.project.targets.flatMap(target=>Object.values(target.blocks).map(node=>({target,node})));
            const nullWrite=({target,node})=>target.blocks[node.inputs?.VALUE?.[1]]?.opcode==='arrays_specialValue'&&target.blocks[node.inputs.VALUE[1]].fields.KIND[0]==='null';
            assert.ok(all.some(row=>row.node.opcode==='arcade_setLocal'&&nullWrite(row)),'real pure local reset remains');
            assert.ok(!all.some(row=>row.node.opcode==='data_setvariableto'&&nullWrite(row)),'no global reset is invented for an uninitialized reference declaration');
            clean(raw); // Existing deadReset admits this pure local prefix without the new theorem.
        }else assert.ok(raw.unsupported.length,'unowned reset graph remains refused');
        clean(projectJsonToArcade(JSON.stringify(second.project)));
        assert.equal(JSON.stringify(c.project),before,'Code/export retain original physical program');
    }
    const requiresOwned=source(globalSource);checkProject(requiresOwned.project,false);checks(requiresOwned,true);
});
