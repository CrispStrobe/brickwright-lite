import test from 'node:test';
import assert from 'node:assert/strict';
import Creator from '../overlay/scratch-gui/src/lib/sb3-creator.js';
import JSZip from 'jszip';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {createProjectJsonSnapshot} from '../overlay/scratch-gui/src/lib/bw-makecode/project-json-snapshot.js';
import {createClosedOrdinaryProjectEntry,closedOrdinaryProjectEntryFor} from '../overlay/scratch-gui/src/lib/bw-makecode/closed-ordinary-project-entry.js';
import {prepareProcedureConstraintExport} from '../overlay/scratch-gui/src/lib/bw-makecode/procedure-constraint-export.js';
import {projectJsonToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';

const make=source=>{
    const imported=arcadeToPseudocode(source);assert.deepEqual(imported.unsupported,[]);
    const creator=new Creator();creator.parse(imported.code);
    assert.deepEqual(creator.errors,[]);assert.deepEqual(creator.warnings,[]);
    return creator;
};
const snapshot=creator=>createProjectJsonSnapshot(JSON.stringify(creator.project));
const definition=(project,name)=>{
    for(const target of project.targets)for(const node of Object.values(target.blocks))if(node.opcode==='procedures_definition'){
        const proto=target.blocks[node.inputs.custom_block[1]];
        if(proto.mutation.proccode===name)return {target,node};
    }
    assert.fail('missing complete procedure '+name);
};
const source='function shared(){console.log(1)} function unused(){shared()} shared();';

test('owned project roots distinguish unused callers while retaining complete declarations and calls',()=>{
    const creator=make(source),project=snapshot(creator),proof=createClosedOrdinaryProjectEntry(project);
    const unused=definition(project,'unused'),shared=definition(project,'shared');
    assert.equal(proof.isUnreachable(unused.target,unused.node),true);
    assert.equal(proof.isUnreachable(unused.target,unused.target.blocks[unused.node.next]),true);
    assert.equal(proof.isUnreachable(shared.target,shared.node),false);
    assert.equal(proof.current(),true);
    assert.equal(closedOrdinaryProjectEntryFor(project,proof),proof);
    assert.equal(Object.values(unused.target.blocks).filter(node=>['procedures_call','arcade_callFunction'].includes(node.opcode)).length,2);
});

test('a real new root activates the entire previously unused call chain',()=>{
    const project=snapshot(make(source+'unused();')),proof=createClosedOrdinaryProjectEntry(project);
    for(const name of ['unused','shared']){const row=definition(project,name);assert.equal(proof.isUnreachable(row.target,row.node),false);}
});

test('ordinary export retains structural contracts while omitting only an uncalled owner obligation',()=>{
    const imported=arcadeToPseudocode('function shared(n){console.log(n)} function unused(m){shared(m)} shared(1);');
    assert.deepEqual(imported.unsupported,[]);
    assert.match(imported.code,/DEFINE shared \(n\):/);
    const creator=new Creator();creator.parse(imported.code.replace('DEFINE shared (n):',
        'DEFINE shared (n):\n  declare arcade procedure "shared %s" parameter "n" as Number'));
    assert.deepEqual(creator.errors,[]);assert.deepEqual(creator.warnings,[]);
    const project=snapshot(creator),prepared=prepareProcedureConstraintExport(project);
    assert.equal(prepared.allObligations.length,1,'the live actual Number caller still has its obligation');
    assert.equal(prepared.allObligations[0].obligation.type,'Number');
    assert.equal(prepared.current(),true);
    assert.equal(prepareProcedureConstraintExport(creator.project).allObligations.length,2,
        'a live-object input has no owned nonreachability authority');
    const actual=definition(project,'shared %s');
    assert.equal(prepared.annotation(actual.target,'shared %s',0),'number','the formal contract remains emitted');
});

test('uncalled cycles terminate the analysis and become reachable together when actually called',()=>{
    const declarations='function first(){second()} function second(){first()}';
    for(const called of [false,true]){
        const project=snapshot(make(declarations+(called?'first();':''))),proof=createClosedOrdinaryProjectEntry(project);
        for(const name of ['first','second']){const row=definition(project,name);assert.equal(proof.isUnreachable(row.target,row.node),!called);}
    }
});

test('live, cloned, forged and foreign owner objects cannot borrow an owned entry proof',()=>{
    const creator=make(source),project=snapshot(creator),proof=createClosedOrdinaryProjectEntry(project),row=definition(project,'unused');
    const live=definition(creator.project,'unused');
    assert.equal(createClosedOrdinaryProjectEntry(creator.project).isUnreachable(live.target,live.node),false);
    const clone=JSON.parse(JSON.stringify(project)),cloned=definition(clone,'unused');
    assert.equal(createClosedOrdinaryProjectEntry(clone).isUnreachable(cloned.target,cloned.node),false);
    assert.equal(closedOrdinaryProjectEntryFor(project,{current:()=>true,isUnreachable:()=>true}),null);
    const other=snapshot(creator);assert.equal(closedOrdinaryProjectEntryFor(other,proof),null);
    assert.equal(proof.isUnreachable(other.targets[0],row.node),false);
    assert.equal(proof.isUnreachable(row.target,{...row.node}),false);
});

test('unknown callable, foreign extension and malformed physical entries retain the old checks',()=>{
    for(const opcode of ['arcade_createCallable','arcade_declareClass','arcade_declareSubclass','arcade_callObjectMethod','foreign_invokeByName']){
        const creator=make(source),row=definition(creator.project,'unused');
        row.target.blocks[row.node.next].opcode=opcode;
        const project=snapshot(creator),actual=definition(project,'unused');
        assert.equal(createClosedOrdinaryProjectEntry(project).isUnreachable(actual.target,actual.node),false);
    }
    const creator=make(source),row=definition(creator.project,'unused');
    row.target.blocks[row.node.next].parent='not-the-owner';
    const project=snapshot(creator),actual=definition(project,'unused');
    assert.equal(createClosedOrdinaryProjectEntry(project).isUnreachable(actual.target,actual.node),false);
    const badShadow=make(source),shadowRow=definition(badShadow.project,'unused');
    shadowRow.target.blocks[shadowRow.node.next].shadow=true;
    const shadowProject=snapshot(badShadow),shadowActual=definition(shadowProject,'unused');
    assert.equal(createClosedOrdinaryProjectEntry(shadowProject).isUnreachable(shadowActual.target,shadowActual.node),false);
});

test('a changed WeakMap lookup cannot forge a module-issued project proof',()=>{
    const project=snapshot(make(source)),fake={current:()=>true,isUnreachable:()=>true};
    const original=Object.getOwnPropertyDescriptor(WeakMap.prototype,'get');
    try{
        Object.defineProperty(WeakMap.prototype,'get',{...original,value:()=>({project,facade:fake})});
        assert.equal(closedOrdinaryProjectEntryFor(project,fake),null);
    }finally{Object.defineProperty(WeakMap.prototype,'get',original);}
});

test('an observed ambient mutation expires the issued proof even after physical restoration',()=>{
    const project=snapshot(make(source)),proof=createClosedOrdinaryProjectEntry(project),row=definition(project,'unused');
    assert.equal(proof.isUnreachable(row.target,row.node),true);
    const key='__bwEntryMutationControl';
    try{Object.defineProperty(Array.prototype,key,{value:1,configurable:true});assert.equal(proof.current(),false);}
    finally{delete Array.prototype[key];}
    assert.equal(proof.current(),false);assert.equal(proof.isUnreachable(row.target,row.node),false);
});

const arrayCallerSource=`let values=[5,3];
function exchange(left:number,right:number){
    let previous=values[left];values[left]=values[right];values[right]=previous;
}
function dormant(index){exchange(0,index)}
exchange(0,1);`;

test('a newly executed bad forwarding caller reactivates the actual Number contract',()=>{
    const result=arcadeToPseudocode(arrayCallerSource+'\ndormant("bad");');
    assert.ok(result.unsupported.some(message=>/Procedure parameter constraint: exchange\.right requires Number/.test(message)),
        JSON.stringify(result.unsupported));
});

test('unused Array callers retain their complete bodies across Code, repeated JSON export and saved project reopen',async()=>{
    let creator=make(arrayCallerSource);
    const bodies=project=>{
        const defs=[];
        for(const target of project.targets)for(const node of Object.values(target.blocks))if(node.opcode==='procedures_definition'){
            const code=target.blocks[node.inputs.custom_block[1]].mutation.proccode;
            if(!/(exchange|dormant)/.test(code))continue;
            const seen=new Set(),body=[];
            const walk=id=>{
                if(typeof id!=='string'||seen.has(id))return;seen.add(id);
                const child=target.blocks[id];if(!child)return;body.push(child);
                for(const slot of Object.values(child.inputs||{}))walk(slot[1]);walk(child.next);
            };walk(node.next);defs.push({code,body});
        }
        const exchange=defs.filter(row=>/exchange/.test(row.code)),dormant=defs.filter(row=>/dormant/.test(row.code));
        assert.equal(exchange.length,1);assert.equal(dormant.length,1);
        assert.equal(exchange[0].body.filter(node=>node.opcode==='arrays_mutateReference').length,2,
            'both actual Array writes survive, including the currently unused body');
        assert.ok(dormant[0].body.some(node=>['procedures_call','arcade_callFunction'].includes(node.opcode)),
            'the unused forwarding call is preserved');
    };
    bodies(creator.project);
    const code=new Creator();code.parse(creator.decompile());assert.deepEqual(code.errors,[]);assert.deepEqual(code.warnings,[]);
    bodies(code.project);creator=code;
    for(let generation=0;generation<3;generation++){
        const output=projectJsonToArcade(JSON.stringify(creator.project));assert.deepEqual(output.unsupported,[]);
        creator=make(output.files);bodies(creator.project);
    }
    const saved=await JSZip.loadAsync(await(await creator.generateSB3()).arrayBuffer());
    const json=await saved.file('project.json').async('string');bodies(JSON.parse(json));
    const reopened=projectJsonToArcade(json);assert.deepEqual(reopened.unsupported,[]);bodies(make(reopened.files).project);
});

test('closed loop and fixed-math blocks preserve unused recursive callers through current JSON export',()=>{
    let creator=make(`let values=[9,1];
function exchange(left:number,right:number){let old=values[left];values[left]=values[right];values[right]=old;}
function future(end:number){let n=0;while(n<end){exchange(n,end);n++;}if(end>0){future(end-1);}}
function asleep(){future(values.length)}
let count=0;while(count<Math.randomRange(1,2)){exchange(0,1);count++;}`);
    for(let generation=0;generation<2;generation++){
        const output=projectJsonToArcade(JSON.stringify(creator.project));
        assert.deepEqual(output.unsupported,[],`generation ${generation}: ${JSON.stringify(output.unsupported)}`);
        creator=make(output.files);
        const names=creator.project.targets.flatMap(target=>Object.values(target.blocks)
            .filter(node=>node.opcode==='procedures_prototype').map(node=>node.mutation.proccode));
        assert.equal(names.filter(name=>/future/.test(name)).length,1);
        assert.equal(names.filter(name=>/asleep/.test(name)).length,1);
        assert.ok(creator.project.targets.some(target=>Object.values(target.blocks).some(node=>node.opcode==='arcade_sourceWhile')));
    }
});
