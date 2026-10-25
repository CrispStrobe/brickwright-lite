import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareArcadeDependencyInputs, currentPreparedNativeSourceProvenance as query} from '../overlay/scratch-gui/src/lib/bw-makecode/dependency-project.js';
import {TEXT_SPRITE_SOURCE_TEXT as source, TEXT_SPRITE_INITIALIZER as replacement, TEXT_SPRITE_NATIVE_IDENTITY as identity} from '../overlay/scratch-gui/src/lib/bw-makecode/text-source-admission.generated.js';
import {admitArcadeNativeSource} from '../overlay/scratch-gui/src/lib/bw-makecode/native-source-admission.js';

const fixture = () => {
    const original = {'main.ts': 'let n = 1', 'pxt.json': JSON.stringify({files:['main.ts'],dependencies:{device:'*'}})};
    const resolved = {packages:{[identity.packageId]:{files:{[identity.filename]:source},resourceIds:[]}},
        sourceOrder:[{id:identity.packageId,file:identity.filename}],jres:{}};
    return {original,resolved};
};
const prepare = () => {const f=fixture();return {...f,prepared:prepareArcadeDependencyInputs(f.original,f.resolved)};};

test('actual complete native source preparation privately binds original admission and retained initializer', () => {
    const {original,resolved,prepared}=prepare(),receipt=query(prepared.files);
    assert.ok(receipt);assert.equal(query(prepared.files),receipt);assert.equal(receipt.isCurrent(),true);
    assert.equal(receipt.entries.length,1);const entry=receipt.entries[0];
    assert.equal(entry.admission,admitArcadeNativeSource({packageId:identity.packageId,filename:identity.filename,source}));
    assert.deepEqual({...entry},{admission:entry.admission,packageId:identity.packageId,filename:identity.filename,
        originalSource:source,sourceOrderIndex:0,preparedPath:prepared.provenance[0].path,replacementSource:replacement});
    assert.equal(prepared.files[entry.preparedPath],replacement);
    assert.equal(JSON.parse(prepared.files['pxt.json']).files[0],entry.preparedPath);
    assert.ok(Object.isFrozen(receipt)&&Object.isFrozen(receipt.entries)&&Object.isFrozen(entry));
    assert.equal(Object.isFrozen(original),false);assert.equal(Object.isFrozen(resolved.packages[identity.packageId]),false);
});

test('copied files public config and copied receipt data cannot issue private provenance', () => {
    const {prepared}=prepare(),receipt=query(prepared.files);
    assert.equal(query({...prepared.files}),null);assert.equal(query({...prepared.files,receipt}),null);
    assert.equal(query({'pxt.json':JSON.stringify({bwArcadeNativeLibraries:{textsprite:'v1.3.0'}})}),null);
    assert.equal(query(null),null);
});

test('changed complete original source never obtains exact native admission from a namespace or version', () => {
    const {original,resolved}=fixture();resolved.packages[identity.packageId].files[identity.filename]+='\n// edited';
    const prepared=prepareArcadeDependencyInputs(original,resolved);assert.equal(query(prepared.files),null);
    assert.ok(Object.values(prepared.files).includes(source+'\n// edited'));
});

test('actual input parents source order descriptors and source bytes remain currentness obligations', () => {
    const changes=[
        f=>{f.original['main.ts']+='\nlet changed=2';},
        f=>{f.resolved.packages[identity.packageId].files[identity.filename]+='\n';},
        f=>{f.resolved.packages[identity.packageId]={...f.resolved.packages[identity.packageId]};},
        f=>{f.resolved.sourceOrder[0]={...f.resolved.sourceOrder[0]};},
        f=>{f.resolved.sourceOrder.push({...f.resolved.sourceOrder[0]});},
        f=>{Object.defineProperty(f.resolved.sourceOrder[0],'file',{writable:false});},
        f=>{Object.setPrototypeOf(f.resolved.packages[identity.packageId].files,null);}
    ];
    for(const change of changes){const f=prepare(),receipt=query(f.prepared.files);assert.ok(receipt);change(f);
        assert.equal(query(f.prepared.files),null);assert.equal(receipt.isCurrent(),false);}
});

test('prepared initializer config identity key ordering and descriptors cannot refresh a stale receipt', () => {
    const changes=[
        (f,e)=>{f.prepared.files[e.preparedPath]+='\n';},
        f=>{const cfg=JSON.parse(f.prepared.files['pxt.json']);cfg.files.reverse();f.prepared.files['pxt.json']=JSON.stringify(cfg);},
        f=>{Object.defineProperty(f.prepared.files,'main.ts',{enumerable:false});},
        f=>{const value=f.prepared.files['main.ts'];delete f.prepared.files['main.ts'];f.prepared.files['main.ts']=value;},
        f=>{Object.setPrototypeOf(f.prepared.files,null);},
        f=>{f.prepared.provenance[0].nativeAdapter={...f.prepared.provenance[0].nativeAdapter};}
    ];
    for(const change of changes){const f=prepare(),receipt=query(f.prepared.files);change(f,receipt.entries[0]);
        assert.equal(query(f.prepared.files),null);assert.equal(receipt.isCurrent(),false);}
    const f=prepare(),receipt=query(f.prepared.files),path=receipt.entries[0].preparedPath,value=f.prepared.files[path];
    f.prepared.files[path]+='\n';assert.equal(query(f.prepared.files),null);f.prepared.files[path]=value;
    assert.equal(query(f.prepared.files),null,'observed expiry cannot remint');
});

test('an input accessor retains ordinary preparation behavior but cannot issue private facts', () => {
    const {original,resolved}=fixture();let reads=0;const value=original['main.ts'];
    Object.defineProperty(original,'main.ts',{get(){reads++;return value;},enumerable:true,configurable:true});
    const prepared=prepareArcadeDependencyInputs(original,resolved);assert.ok(reads>0);assert.equal(prepared.files['main.ts'],value);
    assert.equal(query(prepared.files),null);
});

test('getter driven preparation mutation never creates a postmutation private authority', () => {
    const {original,resolved}=fixture();const value=original['main.ts'];
    Object.defineProperty(original,'main.ts',{get(){resolved.sourceOrder[0].extra='changed during prepare';return value;},enumerable:true});
    const prepared=prepareArcadeDependencyInputs(original,resolved);assert.equal(resolved.sourceOrder[0].extra,'changed during prepare');
    assert.equal(query(prepared.files),null);
});

test('source order positions include earlier ordinary sources without authorizing their bodies', () => {
    const {original,resolved}=fixture();resolved.packages.ordinary={files:{'helper.ts':'namespace ordinary { export let x=1 }'},resourceIds:[]};
    resolved.sourceOrder.unshift({id:'ordinary',file:'helper.ts'});
    const prepared=prepareArcadeDependencyInputs(original,resolved),receipt=query(prepared.files);assert.ok(receipt);
    assert.equal(receipt.entries.length,1);assert.equal(receipt.entries[0].sourceOrderIndex,1);
    assert.equal(prepared.files['__bwDependencyInputs/ordinary/helper.ts'],resolved.packages.ordinary.files['helper.ts']);
});


test('custom source iteration remains ordinary behavior but cannot bypass private ordered-slot binding', () => {
    const {original,resolved}=fixture();
    Object.defineProperty(resolved.sourceOrder,Symbol.iterator,{value:function*(){yield this[0];},configurable:true});
    const prepared=prepareArcadeDependencyInputs(original,resolved);
    assert.equal(prepared.files[prepared.provenance[0].path],replacement);assert.equal(query(prepared.files),null);
});
