import test from 'node:test';
import assert from 'node:assert/strict';
import Creator from '../overlay/scratch-gui/src/lib/sb3-creator.js';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade,projectJsonToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {createProjectJsonSnapshot} from '../overlay/scratch-gui/src/lib/bw-makecode/project-json-snapshot.js';
import {createArrayReferenceExportAuthority} from '../overlay/scratch-gui/src/lib/bw-makecode/array-reference-export-authority.js';
import {conditionalArrayPrefix as prefix,conditionalArrayLevel as level,conditionalArraySource as source} from './fixtures/arcade-conditional-array-entry.mjs';
const clean=out=>{for(const key of ['unsupported','errors','warnings','unparsed'])if(Object.hasOwn(out,key))assert.deepEqual(out[key],[],key);};
const create=text=>{const out=arcadeToPseudocode(text);clean(out);const c=new Creator();c.parse(out.code);clean(c);return c;};
const query=project=>{const p=createProjectJsonSnapshot(JSON.stringify(project)),rows=p.targets.flatMap(target=>Object.values(target.blocks).filter(node=>['arrays_referenceIndexOf','arrays_referenceLength'].includes(node.opcode)).map(node=>({target,node})));assert.ok(rows.length);return {p,rows,proof:createArrayReferenceExportAuthority(p)};};
const positive=q=>{for(const row of q.rows)assert.deepEqual(q.proof.validateInput(row.target,row.node),{ok:true});};
const negative=q=>{assert.ok(q.rows.some(row=>q.proof.validateInput(row.target,row.node).ok===false),'at least one actual receiver remains refused');};
const clone=project=>JSON.parse(JSON.stringify(project));

test('actual nested startup scalar effects and selected branch establish receiver readiness',()=>{
    for(const conditional of [false,true]){
        const c=create(source(conditional));positive(query(c.project));
        const direct=projectToArcade(c.project),json=projectJsonToArcade(JSON.stringify(c.project));clean(direct);clean(json);assert.deepEqual(direct.files,json.files);
        if(conditional)assert.match(json.ts,/if \(/);assert.match(json.ts,/\.push\(/);assert.match(json.ts,/\.indexOf\(/);
    }
});

test('receiver frontier preserves complete bodies through Code and both export generations',()=>{
    let c=create(source());
    for(let generation=0;generation<2;generation++){
        positive(query(c.project));const out=projectJsonToArcade(JSON.stringify(c.project));clean(out);
        assert.match(out.ts,/function (?:Game_)+nextLevel/);assert.match(out.ts,/function (?:Game_)+newFood/);assert.match(out.ts,/game\.onPaint\(/);
        const code=new Creator();code.parse(c.decompile());clean(code);clean(projectToArcade(code.project));c=create(out.files);
    }
});

test('false, missing and unknown branch inputs supply no receiver readiness',()=>{
    for(const changed of [source().replace('counter=9','counter=0'),source().replace('counter=9','counter:number'),
        source().replace('counter=9','counter=controller.dx()'),source().replace('nextLevel();}','let ignored=1;}')])negative(query(create(changed).project));
});

test('early registrations and an early additional ordinary caller remain refused',()=>{
    const early=source().replace('newFood();game.onPaint','game.onPaint').replace('count=snake.length;});','count=snake.length;});newFood();');
    negative(query(create(early).project));
    negative(query(create(prefix+level+'function probe(){result=snake.indexOf(2);}probe();nextLevel();game.onPaint(function(){probe();});').project));
});

test('null, opaque and callback replacements remain real incompatible Array writers',()=>{
    for(const changed of [source()+'snake=null as any;',source().replace('result=snake.indexOf(2);','snake=null as any;result=snake.indexOf(2);'),
        source().replace('snake=fresh;','snake=undefined as any;')])negative(query(create(changed).project));
});

test('cyclic ordinary entry and unknown physical calls cannot establish a frontier',()=>{
    negative(query(create(source().replace('if(counter>=5){nextLevel();}','if(counter>=5){newFood();nextLevel();}')).project));
    const p=clone(create(source()).project);let changed=0;
    for(const target of p.targets)for(const node of Object.values(target.blocks))if(node.opcode==='procedures_call'&&node.mutation.proccode.startsWith('newFood')){node.mutation.proccode='foreign';changed++;}
    assert.ok(changed);negative(query(p));
});

test('physical predicate, cell and source-root changes cannot copy an initialization fact',()=>{
    const original=create(source()).project;
    const edits=[p=>{const n=p.targets.flatMap(t=>Object.values(t.blocks)).find(n=>n.opcode==='arrays_valueCompare');assert.ok(n);n.fields.OP=['foreign',null];},
        p=>{const t=p.targets.find(t=>Object.values(t.blocks).some(n=>n.opcode==='arcade_whenSourceStarts'));t.blocks.foreign={opcode:'event_whenflagclicked',parent:null,next:null,inputs:{},fields:{},topLevel:true,shadow:false};},
        p=>{const n=p.targets.flatMap(t=>Object.values(t.blocks)).find(n=>n.opcode==='data_setvariableto'&&n.fields.VARIABLE[0]==='snake');assert.ok(n);n.fields.VARIABLE[0]='foreign';}];
    for(const edit of edits){const p=clone(original);edit(p);negative(query(p));}
});

test('used receiver frontier expires on observed ambient mutation and remains expired after restore',()=>{
    const q=query(create(source()).project);positive(q);const d=Object.getOwnPropertyDescriptor(Number,'isFinite');
    try{Object.defineProperty(Number,'isFinite',{...d,value:()=>true});assert.equal(q.proof.validateInput(q.rows[0].target,{...q.rows[0].node}).ok,false);}
    finally{Object.defineProperty(Number,'isFinite',d);}
    negative(q);positive(query(create(source()).project));
});

test('a direct artwork callback cannot publish against changed live startup inputs',()=>{
    const c=create(source()),writer=c.project.targets.flatMap(t=>Object.values(t.blocks)).find(n=>n.opcode==='data_setvariableto'&&n.fields.VARIABLE[0]==='counter');assert.ok(writer);
    const value=writer.inputs.VALUE;let changed=false;
    let out;try{out=projectToArcade(c.project,{costumePalette(){if(!changed){writer.inputs.VALUE=[1,[4,'0']];changed=true;}return null;}});}finally{writer.inputs.VALUE=value;}
    assert.equal(changed,true);assert.ok(out.unsupported.length);clean(projectToArcade(c.project));
});


const reexportProject=(text=source())=>{const c=create(text),out=projectJsonToArcade(JSON.stringify(c.project));clean(out);return create(out.files).project;};
const paintResetPrefix=project=>{
    const target=project.targets.find(t=>Object.values(t.blocks).some(n=>n.opcode==='arcade_whenRegisteredPaint'));assert.ok(target);
    const hat=Object.values(target.blocks).find(n=>n.opcode==='arcade_whenRegisteredPaint'),reset=target.blocks[hat.next],other=target.blocks[reset.next],value=target.blocks[other.inputs.VALUE[1]];
    assert.equal(reset.opcode,'arcade_setLocal');assert.equal(target.blocks[reset.inputs.VALUE[1]].fields.KIND[0],'null');
    assert.equal(other.opcode,'arcade_setLocal');assert.equal(value.opcode,'operator_add');
    const overwrite=target.blocks[other.next];assert.equal(overwrite.inputs.NAME[1][1],reset.inputs.NAME[1][1]);
    assert.equal(overwrite.inputs.VALUE[1][0],12);assert.equal(overwrite.inputs.VALUE[1][1],'snake');
    return {target,reset,other,value};
};

test('the reimported local reset crosses only a closed numeric-literal prefix',()=>{
    const original=reexportProject();positive(query(original));
    for(const kind of ['global read','local read','String operand','malformed fields']){
        const p=clone(original),{target,reset,value}=paintResetPrefix(p);
        if(kind==='global read'){
            const owner=p.targets.find(t=>Object.values(t.variables||{}).some(v=>v[0]==='snake')),id=Object.keys(owner.variables).find(id=>owner.variables[id][0]==='snake');
            value.inputs.NUM1=[3,[12,'snake',id],[4,'0']];
        }else if(kind==='local read'){
            const parent=Object.keys(target.blocks).find(id=>target.blocks[id]===value);
            target.blocks.readOld={opcode:'arcade_getLocal',parent,next:null,inputs:{NAME:[1,[10,reset.inputs.NAME[1][1]]]},fields:{},shadow:false,topLevel:false};
            value.inputs.NUM1=[3,'readOld',[4,'0']];
        }else if(kind==='String operand')value.inputs.NUM1=[1,[10,'0']];
        else value.fields.EXTRA=['foreign',null];
        negative(query(p));
    }
});

test('a used literal-only reset prefix expires before an unrelated diagnostic and cannot renew',()=>{
    // This older direct startup route needs no new conditional entry fact.
    // Its reexported callback still needs the independent literal-prefix proof.
    const direct=source().replace('function newFood(){counter=counter+1;if(counter>=5){nextLevel();}}newFood();','nextLevel();');
    const p=reexportProject(direct),q=query(p);paintResetPrefix(p);positive(q);
    const d=Object.getOwnPropertyDescriptor(Array.prototype,'map');
    try{
        Object.defineProperty(Array.prototype,'map',{...d,value(){throw new Error('a currentness check must not dispatch the changed map');}});
        const result=q.proof.validateInput(q.rows[0].target,{...q.rows[0].node});assert.equal(result.ok,false);assert.match(result.reason,/literal.*reset|literal.*prefix/);
    }finally{Object.defineProperty(Array.prototype,'map',d);}
    negative(q);positive(query(p));
});


test('a registered callback cannot race a later startup branch calculation',()=>{
    const text=prefix+level+'function newFood(){counter=counter+1;if(counter>=5){nextLevel();}result=snake.indexOf(2);}'+
        'game.onPaint(function(){counter=-100;});newFood();';
    negative(query(create(text).project));
    const nested=text.replace('game.onPaint(function(){counter=-100;});newFood();','if(counter>=5){game.onPaint(function(){counter=-100;});}newFood();');
    negative(query(create(nested).project));
});

test('an alternate paint-reachable Array publisher cannot borrow the startup writer certificate',()=>{
    // Originally refused under the startup-only certificate. A fresh alternate
    // publisher is now admitted only by the separate inductive publication
    // frontier (every writer publishes a fresh frame-local Array); a
    // non-fresh alternate publisher still borrows nothing.
    const fresh=source().replace('newFood();game.onPaint', 'function replace(){let other:number[]=[];other.push(3);snake=other;}newFood();game.onPaint')
        .replace('function(){result=snake.indexOf(2);','function(){if(counter>=5){replace();}result=snake.indexOf(2);');
    positive(query(create(fresh).project));
    const aliased=source().replace('let snake:number[];','let snake:number[];let spare:number[];')
        .replace('newFood();game.onPaint', 'function replace(){snake=spare;}newFood();game.onPaint')
        .replace('function(){result=snake.indexOf(2);','function(){if(counter>=5){replace();}result=snake.indexOf(2);');
    negative(query(create(aliased).project));
});
