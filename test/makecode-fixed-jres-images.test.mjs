import test from 'node:test';
import assert from 'node:assert/strict';
import {createFixedImageResourceMaterializer} from '../overlay/scratch-gui/src/lib/bw-makecode/fixed-jres-images.js';
import {prepareArcadeDependencyInputs} from '../overlay/scratch-gui/src/lib/bw-makecode/dependency-project.js';

// Authored, column-major PXT f4 image. No SDK, corpus, network or runtime.
const data = Buffer.from([0x87,4,2,0,2,0,0,0,0x31,0,0,0,0x42,0,0,0]).toString('base64');
const literal = 'img`\n    1 2\n    3 4\n`';
const declaration = '    export const hero = image.ofBuffer(hex``);';
const source = ['namespace gallery {','    //% fixedInstance jres tags="tile"',declaration,
    '    export function keep() { return 17 }','    export const custom = image.ofBuffer(hex`01`);','}'].join('\n');
const fixture = () => ({
    original:{'pxt.json':JSON.stringify({files:['main.ts'],dependencies:{device:'*',art:'github:example/art#v1'}}),'main.ts':''},
    resolved:{packages:{art:{files:{'art.ts':source},resourceIds:['gallery.hero']}},
        sourceOrder:[{id:'art',file:'art.ts'}],
        jres:{'gallery.hero':{id:'gallery.hero',namespace:'gallery.',mimeType:'image/x-mkcd-f4',dataEncoding:'base64',data,tilemapTile:true}},
        runtimeConfig:{palette:['#000000','#111111','#222222','#333333','#444444']},rootResourceIds:[]}
});
const materialize = f => createFixedImageResourceMaterializer(f.original,f.resolved)('art','art.ts',f.resolved.packages.art.files['art.ts']);
const appendSource = (f,text) => {f.original['main.ts']=text;return f;};

test('actual pixels replace only the existing initializer; all surrounding bytes and inputs survive', () => {
    const f=fixture(), before=JSON.stringify(f), result=materialize(f);
    assert.equal(result.source,source.replace('image.ofBuffer(hex``)',literal));
    assert.equal(JSON.stringify(f),before);
    assert.equal(result.resources.length,1);
    const entry=result.resources[0];
    assert.deepEqual([entry.width,entry.height,...entry.pixels],[2,2,1,2,3,4]);
    assert.equal(entry.resourceId,'gallery.hero');assert.equal(entry.resource.tilemapTile,true);
    assert.deepEqual(entry.palette,f.resolved.runtimeConfig.palette);
    assert.equal(entry.rootOverride,false);
    assert.equal(result.source.match(/export const hero/g).length,1);
    assert.ok(result.source.includes('export function keep() { return 17 }'));
    assert.ok(result.source.includes('image.ofBuffer(hex`01`)'));
});

test('dependency preparation retains source order, root bytes, metadata and unchanged helper bodies', () => {
    const f=fixture(), before=JSON.stringify(f), prepared=prepareArcadeDependencyInputs(f.original,f.resolved);
    const row=prepared.provenance.find(row=>row.id==='art');
    assert.equal(prepared.files[row.path],source.replace('image.ofBuffer(hex``)',literal));
    assert.deepEqual(row.fixedImageResources[0].pixels,[1,2,3,4]);
    assert.equal(row.fixedImageResources[0].resource.tilemapTile,true);
    assert.equal(prepared.files['main.ts'],f.original['main.ts']);
    assert.deepEqual(JSON.parse(prepared.files['pxt.json']).files,[row.path,'main.ts','__bwDependencyInputs/resources.jres']);
    assert.equal(JSON.stringify(f),before);
});

test('effective resolved root override pixels are used without rewriting root artwork', () => {
    const f=fixture();f.resolved.rootResourceIds=['gallery.hero'];
    f.original['images.g.jres']='{"root":{"data":"authored bytes retained"}}';
    f.resolved.jres['gallery.hero'].data=Buffer.from([0x87,4,1,0,1,0,0,0,5,0,0,0]).toString('base64');
    const before=JSON.stringify(f), result=materialize(f);
    assert.equal(result.resources[0].rootOverride,true);
    assert.deepEqual(result.resources[0].pixels,[5]);
    assert.match(result.source,/img`\n    5\n`/);
    assert.equal(JSON.stringify(f),before);
});

test('nonempty buffers, custom calls and absent genuine annotation remain untouched', () => {
    for (const replacement of [source.replace('hex``','hex`01`'),source.replace('image.ofBuffer(hex``)','image.create(2,2)'),
        source.replace('fixedInstance jres','tags="fixedInstance jres"'),source.replace('//% fixedInstance jres tags="tile"','// ordinary fixedInstance jres')]) {
        const f=fixture();f.resolved.packages.art.files['art.ts']=replacement;
        assert.equal(materialize(f).source,replacement);
        assert.deepEqual(materialize(f).resources,[]);
    }
});

test('comment-shaped declarations never supply actual code authority', () => {
    const f=fixture();f.resolved.packages.art.files['art.ts']='/*\n'+source+'\n*/';
    assert.throws(()=>materialize(f),/missing or ambiguous actual declaration/);
});

test('missing and duplicate actual resource ownership refuse by name', () => {
    const f=fixture();f.resolved.packages.art.resourceIds=[];
    assert.throws(()=>materialize(f),/missing or ambiguous actual package resource: gallery.hero/);
    const g=fixture();g.resolved.packages.other={files:{},resourceIds:['gallery.hero']};
    assert.throws(()=>materialize(g),/missing or ambiguous actual package resource: gallery.hero/);
});

test('resource identity, namespace, MIME, encoding and invalid bytes refuse', () => {
    for (const patch of [{id:'other.hero'},{namespace:'other.'},{mimeType:'application/octet-stream'},
        {dataEncoding:'hex'},{data:'AA=='}, {data:Buffer.from([0x87,4,2,0,2,0,0,0]).toString('base64')}]) {
        const f=fixture();Object.assign(f.resolved.jres['gallery.hero'],patch);
        assert.throws(()=>materialize(f),/Fixed-instance JRES image: (resource metadata|invalid resource)/);
    }
    const f=fixture();delete f.resolved.jres['gallery.hero'];
    assert.throws(()=>materialize(f),/resource metadata/);
});

test('later configured SDK mutation, extraction and computed escapes refuse even in unused helpers', () => {
    for (const text of ['function unused() { image.ofBuffer = replacement }','function unused() { const f = image.ofBuffer }',
        'const alias = image','const f = image["ofBuffer"]','hex = replacement','img = replacement',
        'const alias = hex','const alias = img','globalThis.image = replacement','eval("image = replacement")']) {
        assert.throws(()=>materialize(appendSource(fixture(),text)),/Fixed-instance JRES image:/,text);
    }
});

test('mutations in another configured dependency are part of the closed source census', () => {
    const f=fixture();f.resolved.packages.other={files:{'other.ts':'function unused() { image.ofBuffer = replacement }'},resourceIds:[]};
    f.resolved.sourceOrder.push({id:'other',file:'other.ts'});
    assert.throws(()=>materialize(f),/SDK image\/hex\/img writer/);
});

test('merged namespace image, hex and img bindings and namespace overrides refuse', () => {
    for (const name of ['image','hex','img']) {
        const f=appendSource(fixture(),`namespace gallery { export const ${name} = replacement }`);
        assert.throws(()=>materialize(f),/shadowed in actual merged namespace/);
        const g=appendSource(fixture(),`namespace ${name} { export const custom = 1 }`);
        assert.throws(()=>materialize(g),/namespace may replace SDK/);
    }
});

test('lexically local SDK-like parameters and unconfigured files do not pretend to mutate the SDK', () => {
    const f=appendSource(fixture(),'function ordinary(image: any) { image.ofBuffer = replacement }');
    f.original['unused.ts']='image.ofBuffer = replacement';
    assert.equal(materialize(f).source,source.replace('image.ofBuffer(hex``)',literal));
});

test('missing, duplicate and authored/generated source collisions refuse', () => {
    const f=fixture();delete f.original['main.ts'];
    assert.throws(()=>materialize(f),/configured root source missing/);
    const g=fixture();g.resolved.sourceOrder.push({...g.resolved.sourceOrder[0]});
    assert.throws(()=>materialize(g),/duplicate configured dependency source/);
    const h=fixture();h.resolved.generatedRootFiles={'main.ts':'image.ofBuffer = replacement'};
    assert.throws(()=>materialize(h),/would replace authored source/);
});

test('CRLF source retains every original byte outside the exact initializer', () => {
    const f=fixture(), text=source.replaceAll('\n','\r\n');f.resolved.packages.art.files['art.ts']=text;
    assert.equal(materialize(f).source,text.replace('image.ofBuffer(hex``)',literal));
});


test('forty-eight authored declarations retain names, order and one initializer per resource', () => {
    const f=fixture(), names=Array.from({length:48},(_,index)=>'tile'+index);
    const text='namespace gallery {\n'+names.map(name=>'    //% fixedInstance jres\n    export const '+name+' = image.ofBuffer(hex``);').join('\n')+'\n    export function after() { return 23 }\n}';
    f.resolved.packages.art.files['art.ts']=text;
    f.resolved.packages.art.resourceIds=names.map(name=>'gallery.'+name);
    f.resolved.jres=Object.fromEntries(names.map(name=>['gallery.'+name,{...f.resolved.jres['gallery.hero'],id:'gallery.'+name}]));
    const before=JSON.stringify(f), result=materialize(f);
    assert.equal(result.resources.length,48);
    assert.equal(result.source,text.replaceAll('image.ofBuffer(hex``)',literal));
    assert.deepEqual([...result.source.matchAll(/export const (tile\d+)/g)].map(match=>match[1]),names);
    assert.equal(result.source.match(/img`/g).length,48);
    assert.equal(JSON.stringify(f),before);
});

test('explicit resource aliases and annotation text inside quoted tags grant no bare jres authority', () => {
    for (const annotation of ['//% fixedInstance jres=other.hero','//% tags="fixedInstance jres"']) {
        const f=fixture();f.resolved.packages.art.files['art.ts']=source.replace('//% fixedInstance jres tags="tile"',annotation);
        assert.deepEqual(materialize(f),{source:f.resolved.packages.art.files['art.ts'],resources:[]});
    }
});


test('Unicode text and line separators preserve original bytes outside the call', () => {
    const f=fixture(), text=('// authored 🧱 art\n'+source).replaceAll('\n','\u2028');
    f.resolved.packages.art.files['art.ts']=text;
    assert.equal(materialize(f).source,text.replace('image.ofBuffer(hex``)',literal));
});
