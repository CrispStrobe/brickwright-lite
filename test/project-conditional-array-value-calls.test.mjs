import test from 'node:test';
import assert from 'node:assert/strict';
import Creator from '../overlay/scratch-gui/src/lib/sb3-creator.js';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade,projectJsonToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {createProjectJsonSnapshot} from '../overlay/scratch-gui/src/lib/bw-makecode/project-json-snapshot.js';
import {createArrayReferenceExportAuthority} from '../overlay/scratch-gui/src/lib/bw-makecode/array-reference-export-authority.js';
import {conditionalArrayPrefix as prefix,conditionalArrayLevel as level} from './fixtures/arcade-conditional-array-entry.mjs';
const clean=out=>{for(const key of ['unsupported','errors','warnings','unparsed'])if(Object.hasOwn(out,key))assert.deepEqual(out[key],[],key);};
const create=text=>{const out=arcadeToPseudocode(text);clean(out);const c=new Creator();c.parse(out.code);clean(c);return c;};
const query=project=>{const p=createProjectJsonSnapshot(JSON.stringify(project)),rows=p.targets.flatMap(target=>Object.values(target.blocks).filter(node=>['arrays_referenceIndexOf','arrays_referenceLength'].includes(node.opcode)).map(node=>({target,node})));assert.ok(rows.length);return {p,rows,proof:createArrayReferenceExportAuthority(p)};};
const positive=q=>{for(const row of q.rows)assert.deepEqual(q.proof.validateInput(row.target,row.node),{ok:true});};
const negative=q=>{assert.ok(q.rows.some(row=>q.proof.validateInput(row.target,row.node).ok===false),'at least one actual receiver remains refused');};
const clone=project=>JSON.parse(JSON.stringify(project));
const blocks=project=>project.targets.flatMap(t=>Object.entries(t.blocks).map(([id,node])=>({t,id,node})));

// Representative ordinary value helpers; the branch selects the initializer
// only when the actual call evaluates its arguments in source order.
const helper='function diff(x:number,y:number){return x-y;}';
const program=(call='diff(9,4)',extra='')=>prefix+level+helper+extra+
    'function newFood(){counter='+call+';if(counter>=5){nextLevel();}}'+
    'newFood();game.onPaint(function(){result=snake.indexOf(2);count=snake.length;});';

test('finite ordinary value calls bind fresh formals in actual argument order',()=>{
    for(const call of ['diff(9,4)','diff(diff(20,1),diff(10,0))','diff(9,4)+diff(1,1)'])positive(query(create(program(call)).project));
    for(const call of ['diff(4,9)','diff(diff(10,0),diff(20,1))'])negative(query(create(program(call)).project));
});

test('value-call frontier survives both export routes and Code reimport',()=>{
    let c=create(program('diff(diff(20,1),diff(10,0))'));
    for(let generation=0;generation<2;generation++){
        positive(query(c.project));
        const direct=projectToArcade(c.project),json=projectJsonToArcade(JSON.stringify(c.project));clean(direct);clean(json);
        assert.deepEqual(direct.files,json.files);assert.match(json.ts,/diff\(/);
        const code=new Creator();code.parse(c.decompile());clean(code);positive(query(code.project));c=create(json.files);
    }
});

test('constraints check actual values and never convert or invent them',()=>{
    // The importer already refuses a String source argument; a physical String
    // VALUE in the actual argument chain must also refuse here.
    assert.ok(arcadeToPseudocode(program('diff("9" as any,4)')).unsupported.length||new Creator().errors);
    const s=clone(create(program()).project),arg=blocks(s).find(r=>r.node.opcode==='arcade_functionArgument');
    for(const [id,node]of Object.entries(arg.t.blocks))if(id===arg.node.inputs.VALUE[1])delete arg.t.blocks[id];
    arg.node.inputs.VALUE=[1,[10,'9']];negative(query(s));
    const p=clone(create(program()).project);
    const row=blocks(p).find(r=>r.node.opcode==='arcade_declareParameterConstraint');assert.ok(row);row.node.fields.TYPE=['String',null];
    negative(query(p));
});

test('missing returns, returned Arrays and recursion supply no call completion',()=>{
    const p=clone(create(program()).project);
    const ret=blocks(p).find(r=>r.node.opcode==='arcade_returnValue'&&r.t.blocks[r.node.parent]?.opcode!=='control_if');
    assert.ok(ret);const parent=ret.t.blocks[ret.node.parent];parent.next=null;delete ret.t.blocks[ret.id];
    for(const [id,node]of Object.entries(ret.t.blocks))if(node.parent===ret.id)delete ret.t.blocks[id];
    negative(query(p));
    // Without its explicit return this callee would leave Undefined, whose
    // negation alone would still select the initializer.
    const truthy=prefix+level+'function flag(x:number){return 0;}function newFood(){if(!flag(1)){nextLevel();}}'+
        'newFood();game.onPaint(function(){result=snake.indexOf(2);count=snake.length;});';
    const t=clone(create(truthy).project);positive(query(t));
    const r=blocks(t).find(x=>x.node.opcode==='arcade_returnValue');r.t.blocks[r.node.parent].next=null;
    for(const [id,node]of Object.entries(r.t.blocks))if(node.parent===r.id)delete r.t.blocks[id];delete r.t.blocks[r.id];
    negative(query(t));
    negative(query(create(program('mk().length+5','function mk(){let a:number[]=[];a.push(1);return a;}')).project));
    negative(query(create(program('rec(2)','function rec(n:number):number{if(n>0){return rec(n-1);}return 9;}')).project));
});

test('malformed argument chains, formal names and call identities refuse',()=>{
    const original=create(program()).project;
    const edits=[
        p=>{const a=blocks(p).find(r=>r.node.opcode==='arcade_functionArgument'&&Array.isArray(r.node.inputs.REST[1]));a.node.inputs.REST=[1,[10,'[x]']];},
        p=>{const call=blocks(p).find(r=>r.node.opcode==='arcade_callFunction');const first=call.t.blocks[call.node.inputs.ARGS[1]];
            const second=call.t.blocks[first.inputs.REST[1]];first.inputs.REST=[1,[10,'[]']];second.parent=null;second.topLevel=true;},
        p=>{const read=blocks(p).find(r=>r.node.opcode==='arcade_getLocal'&&r.node.inputs.NAME[1][1]==='y_');read.node.inputs.NAME=[1,[10,'z_']];},
        p=>{const call=blocks(p).find(r=>r.node.opcode==='arcade_callFunction');call.node.inputs.NAME=[1,[10,'foreign %s %s']];},
        p=>{const proto=blocks(p).find(r=>r.node.opcode==='procedures_prototype'&&r.node.mutation.proccode.startsWith('diff'));
            proto.node.mutation.argumentnames=proto.node.mutation.argumentnames.replace('y_','w_');}];
    for(const edit of edits){const p=clone(original);edit(p);negative(query(p));}
});

test('a used value-call frontier expires on observed ambient mutation and stays expired',()=>{
    const q=query(create(program()).project);positive(q);const d=Object.getOwnPropertyDescriptor(Number,'isFinite');
    try{Object.defineProperty(Number,'isFinite',{...d,value:()=>true});assert.equal(q.proof.validateInput(q.rows[0].target,{...q.rows[0].node}).ok,false);}
    finally{Object.defineProperty(Number,'isFinite',d);}
    negative(q);positive(query(create(program()).project));
});
