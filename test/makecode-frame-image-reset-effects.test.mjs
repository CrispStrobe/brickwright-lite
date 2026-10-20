import test from 'node:test';
import assert from 'node:assert/strict';
import {appendFileSync} from 'node:fs';
import JSZip from 'jszip';
import Creator from '../overlay/scratch-gui/src/lib/sb3-creator.js';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {createArrayReferenceExportAuthority} from '../overlay/scratch-gui/src/lib/bw-makecode/array-reference-export-authority.js';

// These independently authored graphs prove an operand effect, not valid art
// or Image values. The separate public pipeline supplies actual costumes/ZIPs.
function fixture(count=2) {
    const blocks={},target={isStage:true,name:'Stage',variables:{published:['published',0],out:['out',0]},blocks};
    const project={targets:[target],extensions:['arcade','arrays'],extensionURLs:{arrays:'https://crispstrobe.github.io/extensions/CrispStrobe/arrays.js'}};
    let serial=0;
    const text=value=>[10,String(value)],number=value=>[4,String(value)];
    function node(opcode,inputs={},fields={}) {
        const id=`b${++serial}`,n={opcode,next:null,parent:null,shadow:false,topLevel:false,inputs:{},fields};blocks[id]=n;
        for(const [key,value] of Object.entries(inputs)) {
            if(typeof value==='string'){n.inputs[key]=[2,value];blocks[value].parent=id;}
            else n.inputs[key]=[1,value];
        }
        return id;
    }
    const local=name=>node('arcade_getLocal',{NAME:text(name)});
    const special=kind=>node('arrays_specialValue',{}, {KIND:[kind,null]});
    const set=(name,value)=>node('arcade_setLocal',{NAME:text(name),VALUE:value});
    const create=()=>node('arrays_createReference',{VALUES:text('[]')});
    const palette=()=>node('arcade_setPalette',{DATA:text('012345'.repeat(16))});
    const global=value=>node('data_setvariableto',{VALUE:value},{VARIABLE:['published','published']});
    const frame=()=>node('arcade_frameImage',{KEY:text('gallery'),INDEX:number(0),TEMPLATE:text('Gallery'),START:number(0),COUNT:number(1)});
    const clone=()=>node('arcade_cloneImage',{IMAGE:frame()});
    const push=(name,value=clone())=>node('arrays_mutateReference',{ARRAY:local(name),OP:text('push'),INDEX:number(0),VALUE:value});
    const proto=node('procedures_prototype');blocks[proto].shadow=true;
    blocks[proto].mutation={proccode:'build',argumentids:'[]',argumentnames:'[]',argumentdefaults:'[]',warp:'false'};
    const definition=node('procedures_definition',{custom_block:proto});blocks[definition].inputs.custom_block[0]=1;blocks[definition].topLevel=true;
    const hat=node('arcade_whenSourceStarts');blocks[hat].topLevel=true;
    const call=node('procedures_call');blocks[call].mutation={proccode:'build',argumentids:'[]',warp:'false'};
    blocks[hat].next=call;blocks[call].parent=hat;
    const resets=[],overwrites=[],reads=[],sequence=[];
    for(let i=0;i<count;i++){const id=set(`cell${i}`,special(i%2?'undefined':'null'));resets.push(id);sequence.push(id);}
    const effect=palette();sequence.push(effect);
    for(let i=0;i<count;i++){
        sequence.push(set(`fresh${i}`,create()));const write=set(`cell${i}`,local(`fresh${i}`));overwrites.push(write);sequence.push(write);
        sequence.push(push(`cell${i}`),global(local(`cell${i}`)));
    }
    for(let i=0;i<count;i++){const read=node('arrays_referenceLength',{ARRAY:local(`cell${i}`)});reads.push(read);sequence.push(node('data_setvariableto',{VALUE:read},{VARIABLE:['out','out']}));}
    function chain(ids,start=definition){let prior=start;for(const id of ids){blocks[prior].next=id;blocks[id].parent=prior;prior=id;}blocks[prior].next=null;}
    chain(sequence);
    const insert=(before,id)=>{const prior=blocks[before].parent;blocks[prior].next=id;blocks[id].parent=prior;blocks[id].next=before;blocks[before].parent=id;};
    return {project,target,blocks,node,text,number,local,set,special,create,palette,global,push,proto,definition,hat,call,resets,overwrites,reads,effect,sequence,insert,chain,frame,clone};
}
const results=f=>{const proof=createArrayReferenceExportAuthority(f.project);return f.reads.map(id=>proof.validateInput(f.target,f.blocks[id]).ok);};
const refuses=f=>assert.deepEqual(results(f),f.reads.map(()=>false));

const record=row=>{if(process.env.BW_SHARED_FRAME_SNAPSHOTS)appendFileSync(process.env.BW_SHARED_FRAME_SNAPSHOTS,JSON.stringify(row)+'\n');};
const channels=value=>Object.fromEntries(Object.keys(value).filter(key=>/unsupported|warn|error|unparsed|diagnostic|refusal/i.test(key)).map(key=>[key,value[key]]));
const clean=(value,required=[])=>{for(const key of required)assert.ok(Object.hasOwn(value,key)&&Array.isArray(value[key]),'promised channel '+key);for(const [key,row]of Object.entries(channels(value)))assert.ok(Array.isArray(row)&&row.length===0,key+': '+JSON.stringify(row));};
const frameOf=(f,pushIndex=0)=>{const pushes=f.sequence.filter(id=>f.blocks[id].opcode==='arrays_mutateReference'),push=f.blocks[pushes[pushIndex]],clone=f.blocks[push.inputs.VALUE[1]];return f.blocks[clone.inputs.IMAGE[1]];};
const replace=(f,node,key,value)=>{const old=node.inputs[key][1];if(typeof old==='string')delete f.blocks[old];node.inputs[key]=typeof value==='string'?[2,value]:[1,value];if(typeof value==='string')f.blocks[value].parent=Object.keys(f.blocks).find(id=>f.blocks[id]===node);};

test('closed frame operands let distinct later locals overwrite real resets without changing the graph',()=>{
    const f=fixture(7),before=JSON.stringify(f.project);assert.deepEqual(results(f),Array(7).fill(true));assert.equal(JSON.stringify(f.project),before);
    const published=f.sequence.filter(id=>f.blocks[id].opcode==='data_setvariableto'&&f.blocks[id].fields.VARIABLE[0]==='published');assert.equal(published.length,7);
    assert.equal(Object.values(f.blocks).filter(n=>n.opcode==='arcade_frameImage').length,7);
    assert.equal(Object.values(f.blocks).filter(n=>n.opcode==='arcade_cloneImage').length,7);
    for(const value of ['', '   ',0,'0']){const numeric=fixture();replace(numeric,frameOf(numeric),'INDEX',[4,value]);assert.deepEqual(results(numeric),[true,true],'canonical primitive numeric codec '+JSON.stringify(value));}
    for(const row of [['0'],['0',null]]){const shadow=fixture(),leaf=shadow.node('math_number',{}, {NUM:row});shadow.blocks[leaf].shadow=true;replace(shadow,frameOf(shadow),'INDEX',leaf);shadow.blocks[Object.keys(shadow.blocks).find(id=>shadow.blocks[id]===frameOf(shadow))].inputs.INDEX[0]=1;assert.deepEqual(results(shadow),[true,true]);}

});

test('frame operands cannot read the reset destination directly or through an alias',()=>{
    for(const field of ['KEY','TEMPLATE','INDEX','START','COUNT']){
        const f=fixture(),frame=frameOf(f);replace(f,frame,field,f.local('cell1'));assert.equal(results(f)[1],false,field);
    }
    const f=fixture();f.insert(f.overwrites[1],f.set('alias',f.local('cell1')));replace(f,frameOf(f),'INDEX',f.local('alias'));assert.equal(results(f)[1],false);
    const captured=fixture();captured.insert(captured.overwrites[1],captured.node('arcade_registerCountdownHandler',{TOKEN:captured.text('later'),CAPTURES:captured.text('cell1')}));assert.equal(results(captured)[1],false);
});

test('dynamic frame codecs and malformed physical inputs retain the incompatible writer',()=>{
    for(const field of ['KEY','TEMPLATE','INDEX','START','COUNT']){
        const f=fixture(),dynamic=f.node('arcade_callFunction',{NAME:f.text('unknown'),ARGS:f.text('[]')});replace(f,frameOf(f),field,dynamic);assert.equal(results(f)[1],false,field);
    }
    for(const value of [null,true,{},[], 'NaN']){const f=fixture();replace(f,frameOf(f),'INDEX',[4,value]);assert.equal(results(f)[1],false);}
    for(const edit of [
        (f,n)=>{n.inputs.EXTRA=[1,f.text('unproved')];},
        (f,n)=>{n.fields.EXTRA=['unproved',null];},
        (f,n)=>{n.mutation={changed:true};},
        (f,n)=>{n.parent=f.definition;},
        (f,n)=>{n.inputs.KEY[0]=99;}
    ]){const f=fixture();edit(f,frameOf(f));assert.equal(results(f)[1],false);}
    const f=fixture();let coerced=0;replace(f,frameOf(f),'INDEX',[4,{valueOf(){coerced++;return 0;}}]);assert.equal(results(f)[1],false);assert.equal(coerced,0,'no numeric coercion of an object');
});

test('clone and frame effects cannot excuse candidate mutation publication or unrelated calls',()=>{
    const read=fixture();replace(read,frameOf(read),'INDEX',read.local('cell1'));assert.equal(results(read)[1],false);
    const published=fixture();published.insert(published.overwrites[1],published.global(published.local('cell1')));assert.equal(results(published)[1],false);
    const alias=fixture();alias.insert(alias.overwrites[1],alias.set('escape',alias.local('cell1')));assert.equal(results(alias)[1],false);
    const wrong=fixture(),push=wrong.blocks[wrong.sequence.find(id=>wrong.blocks[id].opcode==='arrays_mutateReference')],clone=wrong.blocks[push.inputs.VALUE[1]];replace(wrong,clone,'IMAGE',wrong.local('cell1'));assert.equal(results(wrong)[1],false);
    for(const opcode of ['control_wait','arcade_pushScene','arcade_gameOver','arcade_callFunction']){const f=fixture();f.insert(f.overwrites[1],f.node(opcode));assert.equal(results(f)[1],false);}
    const foreign=fixture();foreign.project.extensions.push('custom');assert.equal(results(foreign)[1],false);
});

const publicSource='let first:Image[];let ordinary:Image[];function initialize(){let a:Image[]=[];a.push(img`1 .\n. 2`);first=a;let b:Image[]=[];b.push(img`2 .\n. 1`);ordinary=b;}function use(){let count=ordinary.length;}initialize();use();';
const importedProject=source=>{
    const imported=arcadeToPseudocode(source);record({stage:'frame-reset-import',source,result:imported,channels:channels(imported)});clean(imported,['unsupported']);
    const creator=new Creator();creator.parse(imported.code);record({stage:'frame-reset-Creator',project:creator.project,channels:channels(creator)});clean(creator,['errors','warnings','unparsed']);
    for(const item of imported.costumes)assert.equal(item.mode==='add'?creator.addCustomSVGCostume(item.sprite,item.svg,item.name):creator.applyCustomSVG(item.sprite,item.svg),true);
    return {imported,creator};
};
test('two current temporary Arrays retain Code SB3 art export and fresh source reimport',async()=>{
    const {imported,creator}=importedProject(publicSource),code=creator.decompile();record({stage:'frame-reset-Code',code,project:creator.project});assert.ok(code);
    const bytes=Buffer.from(await(await creator.generateSB3()).arrayBuffer()),zip=await JSZip.loadAsync(bytes),members={};for(const [name,item]of Object.entries(zip.files))if(!item.dir)members[name]=await item.async('base64');record({stage:'frame-reset-SB3',bytes:bytes.toString('base64'),members,project:creator.project});
    assert.deepEqual(JSON.parse(await zip.file('project.json').async('string')),creator.project);
    for(const target of creator.project.targets)for(const costume of target.costumes||[]){const asset=creator.assets.get(costume.assetId);if(asset){assert.equal(asset.filename,costume.md5ext);assert.equal(members[asset.filename],Buffer.from(asset.data).toString('base64'));}}
    const exported=projectToArcade(creator.project,{costumeSvg:(_target,costume)=>creator.assets.get(costume.assetId)?.data});record({stage:'frame-reset-export',result:exported,channels:channels(exported)});clean(exported,['unsupported']);
    const again=arcadeToPseudocode(exported.files);record({stage:'frame-reset-reimport',files:exported.files,result:again,channels:channels(again)});clean(again,['unsupported']);
    // This second Creator checks fresh source/Blocks diagnostics only. Its
    // artwork is not applied/saved here; only the first actual ZIP is claimed.
    const second=new Creator();second.parse(again.code);record({stage:'frame-reset-reimport-Creator',project:second.project,channels:channels(second)});clean(second,['errors','warnings','unparsed']);
    const blocks=creator.project.targets.flatMap(t=>Object.values(t.blocks)),creates=blocks.filter(n=>n.opcode==='arrays_createReference'),pushes=blocks.filter(n=>n.opcode==='arrays_mutateReference');assert.equal(creates.length,2);assert.equal(pushes.length,2);
    for(const target of creator.project.targets){const authority=createArrayReferenceExportAuthority(creator.project);for(const node of Object.values(target.blocks))if(node.opcode==='arrays_mutateReference'||node.opcode==='arrays_referenceLength')assert.equal(authority.validateInput(target,node).ok,true);}
    assert.equal((imported.costumes||[]).length,2);assert.ok(Object.keys(exported.files).length>0);
});

test('invalid or changed frame resources retain independent export errors',()=>{
    for(const mode of ['template','range','art']){
        const {creator}=importedProject(publicSource),project=structuredClone(creator.project),target=project.targets.find(t=>Object.values(t.blocks).some(n=>n.opcode==='arcade_frameImage')),frame=Object.values(target.blocks).find(n=>n.opcode==='arcade_frameImage');assert.ok(frame);
        if(mode==='template')frame.inputs.TEMPLATE=[1,[10,'missing-resource']];
        if(mode==='range')frame.inputs.COUNT=[1,[4,'999']];
        const exported=projectToArcade(project,{costumeSvg:(_target,costume)=>mode==='art'?'<svg><path d="M0 0"/></svg>':creator.assets.get(costume.assetId)?.data});record({stage:'frame-reset-invalid-resource',mode,result:exported,channels:channels(exported)});if(mode==='art')assert.ok(exported.warnings.some(message=>message.includes('no costume image available')),mode+' retains the existing named placeholder warning');else assert.ok(exported.unsupported.includes('Arcade shared frame image requires a literal array key and valid template range'),mode);
    }
});


test('consumed frame-reset facts expire on changed edges metadata and currentness throws',()=>{
    for(const mode of ['edge','metadata','cycle','getter']){
        const f=fixture(),proof=createArrayReferenceExportAuthority(f.project),read=f.blocks[f.reads[1]];assert.equal(proof.validateInput(f.target,read).ok,true);
        if(mode==='edge'){
            const frame=frameOf(f),old=frame.inputs.INDEX;frame.inputs.INDEX=[1,f.number(1)];assert.equal(proof.validateInput(f.target,read).ok,false);frame.inputs.INDEX=old;
        }else if(mode==='metadata'){
            f.project.extensions.push('custom');assert.equal(proof.validateInput(f.target,read).ok,false);f.project.extensions.pop();
        }else if(mode==='cycle'){
            const frame=frameOf(f);frame.extra=frame;assert.throws(()=>proof.validateInput(f.target,read));delete frame.extra;
        }else{
            Object.defineProperty(f.target.variables,'transient',{configurable:true,enumerable:true,get(){throw Error('currentness failed');}});assert.throws(()=>proof.validateInput(f.target,read),/currentness failed/);delete f.target.variables.transient;
        }
        assert.equal(proof.validateInput(f.target,read).ok,false,mode+' restoration cannot renew the consumed fact');
        assert.equal(createArrayReferenceExportAuthority(f.project).validateInput(f.target,read).ok,true,'fresh independent proof remains possible');
    }
    // A failed exploratory frame visit does not adopt the new expiry policy.
    const f=fixture();replace(f,frameOf(f),'INDEX',f.local('cell1'));assert.equal(results(f)[1],false);
    const proof=createArrayReferenceExportAuthority(f.project),read=f.blocks[f.reads[0]];assert.equal(proof.validateInput(f.target,read).ok,true);
    f.project.extensions.push('custom');assert.equal(proof.validateInput(f.target,read).ok,false);f.project.extensions.pop();assert.equal(proof.validateInput(f.target,read).ok,true,'failed frame exploration does not broaden the old nonframe currentness policy');
});
