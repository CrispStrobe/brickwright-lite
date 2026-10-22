import test from 'node:test';
import assert from 'node:assert/strict';
import Creator from '../overlay/scratch-gui/src/lib/sb3-creator-register-art.js';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade,projectJsonToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {createProjectJsonSnapshot,isProjectJsonSnapshot} from '../overlay/scratch-gui/src/lib/bw-makecode/project-json-snapshot.js';
import {createArrayReferenceExportAuthority} from '../overlay/scratch-gui/src/lib/bw-makecode/array-reference-export-authority.js';
import model from '../overlay/scratch-vm/src/util/bw-procedure-constraint-model.js';

const clean=value=>{for(const key of ['unsupported','warnings','errors','unparsed'])if(Object.hasOwn(value,key))assert.deepEqual(value[key],[],key);};
const parse=code=>{const c=new Creator();c.parse(code);clean(c);return c;};
const source=text=>{const out=arcadeToPseudocode(text);clean(out);return parse(out.code);};
const text='class Box{constructor(public n:number){}}function same(value:Box[]):Box[]{return value;}let boxes=[new Box(1)];let alias=same(boxes);alias.push(0 as any);let item=boxes[0];';
const all=project=>project.targets.flatMap(target=>Object.entries(target.blocks).map(([id,node])=>({target,id,node})));
const selectors=new Set(['arrays_mutateReference','arrays_referenceItem']);
let retained;
function fixture(){
    if(!retained){
        const c=source(text),first=projectJsonToArcade(JSON.stringify(c.project));clean(first);
        const imported=arcadeToPseudocode(first.files);clean(imported);
        const second=parse(imported.code);
        retained={original:JSON.stringify(c.project),second:JSON.stringify(second.project),first,code:imported.code};
    }
    return JSON.parse(retained.second);
}
function identity(project){
    const rows=all(project).filter(({node})=>node.opcode===model.OPCODE&&node.fields.PARAMETER?.[0]==='value');
    assert.equal(rows.length,1,'the actual reimported value-formal declaration');
    const row=rows[0],def=row.target.blocks[row.node.parent];assert.equal(def?.opcode,'procedures_definition');
    const proto=row.target.blocks[def.inputs.custom_block[1]];assert.equal(proto?.opcode,'procedures_prototype');
    const returned=row.target.blocks[row.node.next];assert.equal(returned?.opcode,'arcade_returnValue');
    return {...row,def,proto,returned};
}
function consumers(project){
    const rows=all(project).filter(({node})=>selectors.has(node.opcode));
    assert.ok(rows.some(({node})=>node.opcode==='arrays_mutateReference'));
    assert.ok(rows.some(({node})=>node.opcode==='arrays_referenceItem'));
    return rows;
}
function accepted(project){
    assert.equal(isProjectJsonSnapshot(project),true);
    const proof=createArrayReferenceExportAuthority(project),rows=consumers(project);
    for(const {target,node} of rows)assert.equal(proof.validateInput(target,node).ok,true,'actual supported '+node.opcode);
    return {proof,rows};
}
function freshNegative(edit,{canonical=true}={}){
    const draft=fixture(),before=createProjectJsonSnapshot(JSON.stringify(draft));
    const baseline=accepted(before),ids=baseline.rows.map(({id})=>id);
    edit(draft,identity(draft));
    const owned=createProjectJsonSnapshot(JSON.stringify(draft)),actual=consumers(owned);
    assert.deepEqual(actual.map(({id})=>id),ids,'semantic edits retain the genuine consumer blocks');
    const selected=identityUnchecked(owned);
    if(canonical){const p=model.prepare(selected.target);assert.equal(p.current(),true);}
    else assert.throws(()=>model.prepare(selected.target),/constraint/,'explicit malformed canonical frontier');
    const proof=createArrayReferenceExportAuthority(owned);
    const mutation=actual.find(({node})=>node.opcode==='arrays_mutateReference');
    assert.equal(proof.validateInput(mutation.target,mutation.node).ok,false,'fresh current source refuses the actual alias receiver');
    return owned;
}
// Unlike identity(), this locator deliberately does not assert the edited
// prefix remains valid: malformed cases must reach their explicit frontier.
function identityUnchecked(project){
    const target=project.targets.find(t=>Object.values(t.blocks).some(n=>n.opcode===model.OPCODE&&n.fields?.PARAMETER?.[0]==='value'))||
        project.targets.find(t=>Object.values(t.blocks).some(n=>selectors.has(n.opcode)));
    assert.ok(target);return {target};
}
function ownEntry(project){
    const row=identity(project),proof=model.prepare(row.target),entry=proof.procedures.get(row.proto.mutation.proccode);
    assert.ok(entry);assert.equal(proof.current(),true);assert.equal(entry.definition,row.def);assert.equal(entry.prototype,row.proto);
    const constraint=entry.constraints.get('value');assert.ok(constraint);assert.equal(constraint.type,'Any');
    assert.equal(constraint.block,row.node);assert.equal(constraint.id,entry.ids[constraint.index]);
    assert.equal(entry.names[constraint.index],'value');assert.equal(entry.body,row.returned);
    assert.equal(row.returned.next,null);assert.equal(row.returned.parent,row.id);
    const valueID=row.returned.inputs.VALUE[1],value=row.target.blocks[valueID];
    assert.ok(Object.hasOwn(row.target.blocks,valueID));assert.equal(value.opcode,'arcade_getLocal');
    assert.equal(value.parent,row.node.next);assert.deepEqual(value.inputs.NAME,[1,[10,'value']]);
    return row;
}

test('actual no-prefix and reimported Any-prefix identities retain mixed Array receiver authority without type loans',()=>{
    const draft=fixture(),before=JSON.stringify(draft),owned=createProjectJsonSnapshot(before);ownEntry(owned);accepted(owned);
    const stripped=fixture(),row=identity(stripped);row.def.next=row.node.next;row.returned.parent=row.node.parent;delete row.target.blocks[row.id];
    accepted(createProjectJsonSnapshot(JSON.stringify(stripped)));
    assert.equal(JSON.stringify(draft),before);assert.equal(isProjectJsonSnapshot(draft),false);
    const raw=createArrayReferenceExportAuthority(draft),at=consumers(draft).find(r=>r.node.opcode==='arrays_mutateReference');
    assert.equal(raw.validateInput(at.target,at.node).ok,false,'new reset proof cannot enroll mutable caller objects');
});

test('canonical procedure prototype and ordered formal identities are physical obligations',()=>{
    for(const edit of [
        (_p,r)=>{r.node.fields.PROCEDURE[0]='foreign %s';},
        (_p,r)=>{r.node.fields.PARAMETER[0]='other';},
        (_p,r)=>{r.proto.parent='foreign';},
        (_p,r)=>{r.proto.mutation.argumentids='["foreign"]';},
        (_p,r)=>{r.proto.mutation.argumentnames='["other"]';},
        (_p,r)=>{r.proto.mutation.argumentids='["x","x"]';},
        (_p,r)=>{r.target.blocks.__duplicatePrototype=JSON.parse(JSON.stringify(r.proto));}
    ])freshNegative(edit,{canonical:false});
    // A genuine two-formal import makes order a real obligation rather than
    // calling a missing/duplicate single ID an ordering witness.
    const two=source(text.replace('same(value:Box[])','same(value:Box[],unused:any)').replace('same(boxes)','same(boxes,0 as any)'));
    const first=projectJsonToArcade(JSON.stringify(two.project));clean(first);
    const imported=arcadeToPseudocode(first.files);clean(imported);const draft=parse(imported.code).project;
    const baseline=createProjectJsonSnapshot(JSON.stringify(draft));accepted(baseline);
    const selected=all(baseline).find(({node})=>node.opcode===model.OPCODE&&node.fields.PARAMETER?.[0]==='value');assert.ok(selected);
    const current=model.prepare(selected.target),entry=current.procedures.get(selected.node.fields.PROCEDURE[0]);
    assert.equal(entry.ids.length,2);assert.deepEqual(entry.names,['value','unused']);
    assert.deepEqual([...entry.constraints.values()].map(x=>x.type),['Any','Any']);
    const target=draft.targets.find(t=>Object.hasOwn(t.blocks,entry.prototypeId));assert.ok(target);
    target.blocks[entry.prototypeId].mutation.argumentids=JSON.stringify([...entry.ids].reverse());
    const changed=createProjectJsonSnapshot(JSON.stringify(draft)),actual=consumers(changed).find(r=>r.node.opcode==='arrays_mutateReference');
    assert.throws(()=>model.prepare(actual.target),/constraint/);
    assert.equal(createArrayReferenceExportAuthority(changed).validateInput(actual.target,actual.node).ok,false);
});

test('only a complete leading fixed Any prefix can precede the sole corresponding formal return',()=>{
    for(const edit of [
        (_p,r)=>{r.target.blocks.__duplicateConstraint={...r.node,parent:r.id,next:r.node.next};r.returned.parent='__duplicateConstraint';r.node.next='__duplicateConstraint';},
        (_p,r)=>{r.def.next=r.node.next;r.returned.parent=r.node.parent;r.returned.next=r.id;r.node.parent=r.node.next;r.node.next=null;},
        (_p,r)=>{r.node.inputs.TYPE=[1,[10,'Any']];},
        (_p,r)=>{r.node.fields.EXTRA=['unsupported',null];},
        (_p,r)=>{r.node.fields.TYPE[0]='Array';}
    ])freshNegative(edit,{canonical:false});
    for(const type of ['Number','String'])freshNegative((_p,r)=>{r.node.fields.TYPE[0]=type;});
});

test('owned JSON prefix preflight refuses inherited selector data and accessors without evaluating them',()=>{
    for(const getter of [false,true]){
        const draft=fixture(),row=identity(draft);delete row.node.fields.TYPE;
        const owned=createProjectJsonSnapshot(JSON.stringify(draft)),old=Object.getOwnPropertyDescriptor(Object.prototype,'TYPE');
        assert.equal(old,undefined);let reads=0,result;
        try{
            Object.defineProperty(Object.prototype,'TYPE',getter?{configurable:true,get(){reads++;return ['Any',null];}}:
                {configurable:true,value:['Any',null]});
            const proof=createArrayReferenceExportAuthority(owned),at=consumers(owned).find(r=>r.node.opcode==='arrays_mutateReference');
            result=proof.validateInput(at.target,at.node).ok;
        }finally{delete Object.prototype.TYPE;}
        assert.equal(reads,0,'the new effect gate cannot read a borrowed selector');assert.equal(result,false);
    }
    const owned=createProjectJsonSnapshot(JSON.stringify(fixture()));accepted(owned);
    assert.equal(isProjectJsonSnapshot(new Proxy(owned,{})),false);
    const borrowed=createArrayReferenceExportAuthority(new Proxy(owned,{}));
    const actual=consumers(owned).find(r=>r.node.opcode==='arrays_mutateReference');
    assert.equal(borrowed.validateInput(actual.target,actual.node).ok,false,'a Proxy cannot reuse the snapshot brand');
});

test('a valid Any declaration grants no authority to changed return values or unknown body effects',()=>{
    for(const edit of [
        (_p,r)=>{r.returned.inputs.VALUE=[1,[10,'not the actual formal']];},
        (_p,r)=>{r.returned.opcode='arcade_futureIdentityEffect';},
        (_p,r)=>{r.returned.next='__extraEffect';r.target.blocks.__extraEffect={opcode:'arcade_futureIdentityEffect',parent:r.node.next,next:null,fields:{},inputs:{},shadow:false,topLevel:false};}
    ])freshNegative(edit);
    // Valid annotation, invalid producer: keep the genuine consumer IDs and
    // identity prefix while replacing the actual identity-call argument.
    freshNegative(project=>{
        const call=all(project).find(({target,node})=>node.opcode==='arcade_callFunction'&&
            (Array.isArray(node.inputs.NAME?.[1])?node.inputs.NAME[1][1]:target.blocks[node.inputs.NAME?.[1]]?.fields.TEXT?.[0])?.includes('same'));
        assert.ok(call);const arg=call.target.blocks[call.node.inputs.ARGS[1]];assert.equal(arg.opcode,'arcade_functionArgument');
        arg.inputs.VALUE=[1,[10,'foreign Array annotation is not an allocation']];
    });
});

test('all actual entries writers and intervening effects remain obligations after the identity prefix',()=>{
    for(const suffix of ['boxes=null;','alias="foreign" as any;']){
        const c=source(text+suffix),out=projectJsonToArcade(JSON.stringify(c.project));
        assert.ok(out.unsupported.length,'unsafe writer remains a genuine export refusal');
    }
    freshNegative((_p,r)=>{
        const next=r.node.next;r.node.next='__unknownPrefix';r.target.blocks.__unknownPrefix={opcode:'arcade_futureIdentityEffect',parent:r.id,next,inputs:{},fields:{},shadow:false,topLevel:false};r.returned.parent='__unknownPrefix';
    });
    const escaped=source(text+'game.onUpdate(function(){boxes=null;});');
    const out=projectJsonToArcade(JSON.stringify(escaped.project));assert.ok(out.unsupported.length,'actual callback writer remains refused');
});

test('owned snapshot immutability and observed ambient graph edits cannot revive a stale prefix proof',()=>{
    const owned=createProjectJsonSnapshot(JSON.stringify(fixture())),row=ownEntry(owned),{proof,rows}=accepted(owned);
    assert.throws(()=>{row.node.fields.TYPE[0]='Number';},TypeError);
    assert.equal(row.node.fields.TYPE[0],'Any');assert.equal(proof.validateInput(rows[0].target,rows[0].node).ok,true);
    for(const mode of ['after-positive','before-first','diagnostic']){
        const project=createProjectJsonSnapshot(JSON.stringify(fixture())),p=createArrayReferenceExportAuthority(project),at=consumers(project).find(r=>r.node.opcode==='arrays_mutateReference');
        if(mode==='after-positive')assert.equal(p.validateInput(at.target,at.node).ok,true);
        const name='__identityConstraintAmbientEdit';assert.equal(Object.hasOwn(Object.prototype,name),false);let observed;
        try{Object.defineProperty(Object.prototype,name,{configurable:true,value:1});observed=p.validateInput(at.target,at.node,mode==='diagnostic'?'__unrelatedDiagnosticInput':'ARRAY').ok;}
        finally{delete Object.prototype[name];}
        assert.equal(observed,false);assert.equal(p.validateInput(at.target,at.node).ok,false,'observed ABA remains revoked');
        accepted(createProjectJsonSnapshot(JSON.stringify(fixture())));
    }
    // A local reset actually needs the new identity-call effect proof. A
    // separate genuine animation query can run an options descriptor observer
    // after the early currentness fences, before the result is published.
    const local=source('function same(value:any):any{return value;}function build(){let kept:number[]=null;let z=same(0);kept=[];let count=kept.length;}build();');
    const initial=projectJsonToArcade(JSON.stringify(local.project));clean(initial);
    const imported=arcadeToPseudocode(initial.files);clean(imported);const second=parse(imported.code);
    const resourceID='12345678-1234-4234-8234-123456789abc';
    const creator=parse(second.decompile()+'\nWHEN arcade source starts:\n  arcade set local animationCount to (length of array reference (arcade animation frames resource "'+resourceID+'"))\n');
    const frames=[2,8].map((colour,index)=>({id:'f'+index,durationMs:100,activeLayerId:'pixels',
        layers:[{id:'pixels',name:'Pixels',locked:false,type:'pixel',visible:true,opacity:1,
            content:{kind:'pixels',value:{width:2,height:1,pixels:[colour,colour]}}}]}));
    const document={version:4,layers:frames[0].layers,activeLayerId:'pixels',
        animation:{resource:{id:resourceID,name:'Walk'},activeFrameId:'f0',frames}};
    const project=createProjectJsonSnapshot(JSON.stringify(creator.project));ownEntry(project);
    const lengths=all(project).filter(({node})=>node.opcode==='arrays_referenceLength');assert.equal(lengths.length,2);
    const animation=lengths.find(({target,node})=>target.blocks[node.inputs.ARRAY[1]]?.opcode==='arcade_animationAssetFrames');assert.ok(animation);
    const retained=lengths.find(row=>row!==animation);assert.ok(retained);
    const localRead=retained.target.blocks[retained.node.inputs.ARRAY[1]];
    assert.equal(localRead.opcode,'arcade_getLocal');assert.deepEqual(localRead.inputs.NAME,[1,[10,'kept']]);
    const fixedCall=all(project).find(({target,node})=>node.opcode==='arcade_callFunction'&&
        (Array.isArray(node.inputs.NAME?.[1])?node.inputs.NAME[1][1]:target.blocks[node.inputs.NAME?.[1]]?.fields.TEXT?.[0])?.includes('same'));
    assert.ok(fixedCall,'the actual intervening identity call is retained');
    let armed=false,observations=0,mutatedAt=0;
    const marker='__identityConstraintAmbientEdit';assert.equal(Object.hasOwn(Object.prototype,marker),false);
    const options=new Proxy({animationDocuments:[document]},{getOwnPropertyDescriptor(target,key){
        if(armed&&key==='animationDocuments'&&++observations===2){
            mutatedAt=observations;Object.defineProperty(Object.prototype,marker,{configurable:true,value:1});
        }
        return Reflect.getOwnPropertyDescriptor(target,key);
    }});
    const actual=createArrayReferenceExportAuthority(project,options);
    assert.equal(actual.validateInput(retained.target,retained.node).ok,true,'actual local reset through Any-prefix identity');
    assert.equal(actual.validateInput(animation.target,animation.node).ok,true,'genuine resource Array positive before arming');
    let published;
    try{observations=0;armed=true;published=actual.validateInput(animation.target,animation.node);}
    finally{armed=false;delete Object.prototype[marker];}
    assert.equal(mutatedAt,2,'real options observer runs after the first live producer observation');
    assert.ok(observations>=2);assert.equal(published.ok,false,'late source mutation must precede every successful publication');
    assert.equal(actual.validateInput(animation.target,animation.node).ok,false,'restoration cannot revive the expired used-prefix dependency');
    assert.equal(actual.validateInput(retained.target,retained.node).ok,false);

});

test('real Code feedback exact-files reimport and owned second export keep honest mixed declarations and canonical prefix',()=>{
    const original=source(text),before=JSON.stringify(original.project),first=projectJsonToArcade(before);clean(first);
    assert.match(first.ts,/function Game_same\s*\(value: any\): any/);assert.match(first.ts,/let alias: any\[\]/);
    assert.match(first.ts,/alias\.push\(\(0 \+ 0\)\)/);
    const feedback=parse(original.decompile());clean(projectJsonToArcade(JSON.stringify(feedback.project)));
    const imported=arcadeToPseudocode(first.files);clean(imported);const second=parse(imported.code);
    const project=createProjectJsonSnapshot(JSON.stringify(second.project));ownEntry(project);accepted(project);
    const exported=projectJsonToArcade(JSON.stringify(second.project));clean(exported);
    assert.match(exported.ts,/function Game_same\s*\(value: any\): any/);assert.match(exported.ts,/any\[\]/);
    assert.ok(Object.keys(exported.files).length>0);assert.equal(JSON.stringify(original.project),before);
    const unsafe=fixture(),row=identity(unsafe);row.returned.inputs.VALUE=[1,[10,'foreign']];
    const rejected=projectJsonToArcade(JSON.stringify(unsafe));assert.ok(rejected.unsupported.length);
});
