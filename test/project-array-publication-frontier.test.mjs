import test from 'node:test';
import assert from 'node:assert/strict';
import Creator from '../overlay/scratch-gui/src/lib/sb3-creator.js';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade,projectJsonToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {createProjectJsonSnapshot} from '../overlay/scratch-gui/src/lib/bw-makecode/project-json-snapshot.js';
import {createArrayReferenceExportAuthority} from '../overlay/scratch-gui/src/lib/bw-makecode/array-reference-export-authority.js';
const clean=out=>{for(const key of ['unsupported','errors','warnings','unparsed'])if(Object.hasOwn(out,key))assert.deepEqual(out[key],[],key);};
const create=text=>{const out=arcadeToPseudocode(text);clean(out);const c=new Creator();c.parse(out.code);clean(c);return c;};
const query=project=>{const p=createProjectJsonSnapshot(JSON.stringify(project)),rows=p.targets.flatMap(target=>Object.values(target.blocks).filter(node=>['arrays_referenceIndexOf','arrays_referenceLength','arrays_mutateReference'].includes(node.opcode)&&node.inputs.ARRAY[1]&&JSON.stringify(node.inputs.ARRAY).includes('snake')).map(node=>({target,node})));return {p,rows,proof:createArrayReferenceExportAuthority(p)};};
const reads=project=>{const p=createProjectJsonSnapshot(JSON.stringify(project)),proof=createArrayReferenceExportAuthority(p),rows=[];
    for(const target of p.targets)for(const node of Object.values(target.blocks))if(['arrays_referenceIndexOf','arrays_referenceLength'].includes(node.opcode))rows.push({target,node});
    assert.ok(rows.length);return {p,rows,proof};};
const positive=q=>{for(const row of q.rows)assert.deepEqual(q.proof.validateInput(row.target,row.node),{ok:true});};
const negative=q=>{assert.ok(q.rows.some(row=>q.proof.validateInput(row.target,row.node).ok===false),'at least one actual receiver remains refused');};
const clone=project=>JSON.parse(JSON.stringify(project));
const blocks=project=>project.targets.flatMap(t=>Object.entries(t.blocks).map(([id,node])=>({t,id,node})));

// Representative snake-shaped source: the only receiver writer publishes a
// fresh local Array after suspending effects; paint can republish it, and a
// startup loop reads it after the first publication.
const head='let counter=9;let result=-99;let count=-99;let snake:number[];'+
    'function nextLevel(){game.splash("Level "+counter);pause(100);let fresh:number[]=[];fresh.push(1);fresh.push(2);snake=fresh;}'+
    'function grow(){counter=counter+1;if(counter>=5){music.playSound(music.sounds(Sounds.PowerUp));nextLevel();}}';
const tail='game.onPaint(function(){result=snake.indexOf(2);count=snake.length;if(result<0){counter=9;grow();}});';
const program=(before='',after='')=>head+before+'grow();'+after+'while(snake.indexOf(7)<0){snake.push(7);}'+tail;

test('a fresh-publication invariant admits repeated paint publications and later loops',()=>{
    positive(reads(create(program()).project));
    const direct=projectToArcade(create(program()).project),json=projectJsonToArcade(JSON.stringify(create(program()).project));
    clean(direct);clean(json);assert.deepEqual(direct.files,json.files);assert.match(json.ts,/while \(/);assert.match(json.ts,/game\.splash\(/);
});

test('the frontier survives Code reimport and two export generations',()=>{
    let c=create(program());
    for(let generation=0;generation<2;generation++){
        positive(reads(c.project));const out=projectJsonToArcade(JSON.stringify(c.project));clean(out);
        const code=new Creator();code.parse(c.decompile());clean(code);positive(reads(code.project));c=create(out.files);
    }
});

test('reads before the first publication and unknown startup control refuse',()=>{
    negative(reads(create(program('result=snake.indexOf(2);')).project));
    negative(reads(create(program('game.splash("n"+snake.length);')).project));
    negative(reads(create(program('counter=controller.dx();')).project));
    negative(reads(create(program('counter=0;')).project));
});

test('a callback registered before the first publication refuses',()=>{
    negative(reads(create(program('controller.A.onEvent(ControllerButtonEvent.Pressed,function(){result=snake.indexOf(1);});')).project));
    negative(reads(create(program('game.onPaint(function(){count=snake.length;});')).project));
});

test('non-fresh, null and aliased receiver writers refuse',()=>{
    for(const extra of ['snake=null as any;','let other:number[]=snake;snake=other;'])
        negative(reads(create(program('',extra)).project));
    negative(reads(create(head+'grow();'+tail.replace('grow();}','snake=undefined as any;}')).project));
});

test('a local reassignment between allocation and publication refuses',()=>{
    const p=clone(create(program()).project);
    const publish=blocks(p).find(r=>r.node.opcode==='data_setvariableto'&&r.node.fields.VARIABLE[0]==='snake');assert.ok(publish);
    const rhs=publish.t.blocks[publish.node.inputs.VALUE[1]],name=rhs.inputs.NAME[1][1];
    const prev=publish.t.blocks[publish.node.parent];
    publish.t.blocks.reset={opcode:'arcade_setLocal',parent:publish.node.parent,next:publish.id,inputs:{NAME:[1,[10,name]],VALUE:[1,[10,'']]},fields:{},shadow:false,topLevel:false};
    prev.next='reset';publish.node.parent='reset';
    negative(reads(p));
});

test('effects with calls or receiver reads in their arguments refuse',()=>{
    negative(reads(create(program('','').replace('game.splash("Level "+counter)','game.splash("Level "+snake.length)')).project));
    negative(reads(create(program().replace('function grow(){','function label(){return 1;}function grow(){').replace('pause(100)','pause(label())')).project));
});

test('a used frontier expires on observed ambient mutation and stays expired',()=>{
    const q=reads(create(program()).project);positive(q);const d=Object.getOwnPropertyDescriptor(Number,'isFinite');
    try{Object.defineProperty(Number,'isFinite',{...d,value:()=>true});assert.equal(q.proof.validateInput(q.rows[0].target,{...q.rows[0].node}).ok,false);}
    finally{Object.defineProperty(Number,'isFinite',d);}
    negative(q);positive(reads(create(program()).project));
});

test('a hoisted reset crosses only statements that cannot read it',()=>{
    const regenerated=()=>{const out=projectJsonToArcade(JSON.stringify(create(program()).project));clean(out);return create(out.files).project;};
    const original=regenerated();positive(reads(original));
    // Insert a closed wait right after the startup alias reset; its argument
    // reads the reset local, so the reset can no longer be discounted.
    const p=clone(original);
    const reset=blocks(p).find(r=>r.node.opcode==='arcade_setLocal'&&r.t.blocks[r.node.inputs.VALUE[1]]?.opcode==='arrays_specialValue'&&
        blocks(p).some(o=>o.t===r.t&&o.node.opcode==='procedures_call'&&reachable(r.t,r.id,o.id)));
    assert.ok(reset);const name=reset.node.inputs.NAME[1][1],t=reset.t,next=reset.node.next;
    t.blocks.waitRead={opcode:'control_wait',parent:reset.id,next,inputs:{DURATION:[3,'readReset',[4,'0']]},fields:{},shadow:false,topLevel:false};
    t.blocks.readReset={opcode:'arcade_getLocal',parent:'waitRead',next:null,inputs:{NAME:[1,[10,name]]},fields:{},shadow:false,topLevel:false};
    reset.node.next='waitRead';t.blocks[next].parent='waitRead';
    negative(reads(p));
    // The same wait reading an unrelated literal still crosses.
    const q=clone(original),r2=blocks(q).find(r=>r.id===reset.id&&r.t.name===t.name),n2=r2.node.next;
    r2.t.blocks.waitLiteral={opcode:'control_wait',parent:r2.id,next:n2,inputs:{DURATION:[1,[4,'0']]},fields:{},shadow:false,topLevel:false};
    r2.node.next='waitLiteral';r2.t.blocks[n2].parent='waitLiteral';
    positive(reads(q));
});
function reachable(target,from,to){for(let id=target.blocks[from].next,n=0;id&&n<100;id=target.blocks[id].next,n++)if(id===to)return true;return false;}
