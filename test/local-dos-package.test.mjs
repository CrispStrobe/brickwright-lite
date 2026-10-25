import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
const require = createRequire(import.meta.url);
const source = name => readFileSync(new URL(`../overlay/scratch-gui/src/lib/bw-machines/${name}`,import.meta.url),'utf8');
const uri = value => `data:text/javascript;base64,${Buffer.from(value).toString('base64')}`;
// Exact production sources. Only import routes change to avoid a build/engine
// import; JSZip remains the declared real dependency, never a parser stub.
const zipUrl = uri(source('dos-package-zip.js').replace("'jszip'",JSON.stringify(pathToFileURL(require.resolve('jszip')).href)));
const configUrl = uri(source('machine-config.js'));
const importersUrl = uri(source('importers.js').replace("'./machine-config.js'",JSON.stringify(configUrl)));
const localUrl = uri(source('local-dosbox.js').replace("'./machine-config.js'",JSON.stringify(configUrl)).replace("'./importers.js'",JSON.stringify(importersUrl)));
const canonicalPath = process.env.BW_DOSBOX_CONFIG_SOURCE || require.resolve('bw-board/dosbox-config.js');
const canonicalUrl = uri(readFileSync(canonicalPath,'utf8'));
const packageUrl = uri(source('local-dos-package.js').replace("'bw-board/dosbox-config.js'",JSON.stringify(canonicalUrl))
    .replace("'./local-dosbox.js'",JSON.stringify(localUrl)).replace("'./dos-package-zip.js'",JSON.stringify(zipUrl)));
const policyUrl = uri(readFileSync(new URL('../overlay/scratch-gui/src/lib/distribution-policy.js',import.meta.url),'utf8'));
const activateUrl = uri(source('activate.js').replace("'./machine-config.js'",JSON.stringify(configUrl)).replace("'../distribution-policy.js'",JSON.stringify(policyUrl)));
const runUrl = uri(source('run-machine.js').replace("'./activate.js'",JSON.stringify(activateUrl)));
const {runMachineConfig} = await import(runUrl);
const {readDosPackageZip,preflightDosPackageZip} = await import(zipUrl);
const {localDosPackage} = await import(packageUrl);
const crc = bytes => {let value=0xffffffff;for(const byte of bytes){value^=byte;for(let i=0;i<8;i++)value=(value&1)?(value>>>1)^0xedb88320:value>>>1;}return (value^0xffffffff)>>>0;};
const text = value => Buffer.from(value,'ascii');
const boot = Buffer.alloc(34816);
Buffer.from('fa31c08ed8b800b88ec031ffbe1c7cac84c07405b41fabebf6f4ebfd','hex').copy(boot);
boot.write('GUI LOCAL HDD BOOT OK\0',28,'ascii'); boot[510]=0x55;boot[511]=0xaa;
const conf = '[cpu]\ncputype=386\n[autoexec]\nimgmount c "disk/owned.img" -t hdd -size 512,17,4,1\nboot -l c\n';
const members = () => [{name:'demo/dosbox.conf',bytes:text(conf)},
    {name:'demo/disk/owned.img',bytes:Buffer.from(boot)},
    {name:'demo/LICENSE.txt',bytes:text('Authored test fixture; MIT. No third-party media included.\n')}];
// Independent STORED writer: central/local records and CRCs constructed here,
// not with JSZip or the production preflight. Layout is exposed for mutations.
function archive (rows=members()) {
    const locals=[],centrals=[],layout=[];let offset=0;
    for(const row of rows){const name=text(row.name),data=Buffer.from(row.bytes),local=Buffer.alloc(30),central=Buffer.alloc(46),sum=crc(data);
        local.writeUInt32LE(0x04034b50);local.writeUInt16LE(10,4);local.writeUInt32LE(sum,14);local.writeUInt32LE(data.length,18);local.writeUInt32LE(data.length,22);local.writeUInt16LE(name.length,26);
        central.writeUInt32LE(0x02014b50);central.writeUInt16LE(10,4);central.writeUInt16LE(10,6);central.writeUInt32LE(sum,16);central.writeUInt32LE(data.length,20);central.writeUInt32LE(data.length,24);central.writeUInt16LE(name.length,28);central.writeUInt32LE(offset,42);
        layout.push({local:offset,data:offset+30+name.length,central:centrals.reduce((n,b)=>n+b.length,0)});
        locals.push(local,name,data);centrals.push(central,name);offset+=30+name.length+data.length;
    }
    const directory=Buffer.concat(centrals),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(rows.length,8);end.writeUInt16LE(rows.length,10);end.writeUInt32LE(directory.length,12);end.writeUInt32LE(offset,16);
    for(const row of layout)row.central+=offset;
    return {bytes:Buffer.concat([...locals,directory,end]),layout,central:offset};
}

test('authored STORED package resolves config-relative image and ordinary 386 CHS without aliasing',async()=>{
    const input=archive(),before=Buffer.from(input.bytes),entries=await readDosPackageZip(input.bytes),selected=localDosPackage(entries);
    assert.equal(selected.selectedConfig,'demo/dosbox.conf');assert.equal(selected.selectedImage,'demo/disk/owned.img');
    assert.equal(selected.config.machine,'i80386');assert.equal(selected.config.executionMode,'functional');assert.equal(selected.config.nativeBlocks,false);
    assert.deepEqual(selected.config.slots.hdd.geometry,{cylinders:1,heads:4,sectors:17});assert.deepEqual(selected.config.bootOrder,['hdd']);
    assert.deepEqual(Buffer.from(selected.bytes),boot);input.bytes.fill(0);entries[1].bytes.fill(0);assert.deepEqual(Buffer.from(selected.bytes),boot);assert.ok(before.length>34816);
});
for(const [name,edit] of [
    ['CRC drift',x=>{x.bytes[x.layout[1].data]^=1;}],
    ['DEFLATE',x=>{x.bytes.writeUInt16LE(8,x.layout[0].central+10);x.bytes.writeUInt16LE(8,x.layout[0].local+8);} ],
    ['encryption',x=>{x.bytes.writeUInt16LE(1,x.layout[0].central+8);} ],
    ['descriptor',x=>{x.bytes.writeUInt16LE(8,x.layout[0].central+8);} ],
    ['ZIP64 extent',x=>{x.bytes.writeUInt32LE(0xffffffff,x.layout[0].central+24);} ],
    ['symlink',x=>{x.bytes.writeUInt32LE((0xa000<<16)>>>0,x.layout[0].central+38);} ],
    ['directory',x=>{x.bytes.writeUInt32LE(0x10,x.layout[0].central+38);} ],
    ['local name disagreement',x=>{x.bytes[x.layout[0].local+30]=0x78;} ],
    ['overlapping records',x=>{x.bytes.writeUInt32LE(0,x.layout[1].central+42);} ],
    ['extra fields',x=>{x.bytes.writeUInt16LE(1,x.layout[0].central+30);} ],
    ['multidisk',x=>{x.bytes.writeUInt16LE(1,x.bytes.length-18);} ],
    ['unclaimed local padding',x=>{x.bytes.writeUInt32LE(1,x.layout[0].central+42);} ]
])test(`raw ZIP preflight refuses ${name} before extraction`,()=>{const x=archive();edit(x);assert.throws(()=>preflightDosPackageZip(x.bytes));});
test('raw ZIP refuses trailing data, SFX and cap/record-count overflow',()=>{
    assert.throws(()=>preflightDosPackageZip(Buffer.concat([archive().bytes,Buffer.from([0])])));
    assert.throws(()=>preflightDosPackageZip(Buffer.concat([Buffer.from([0]),archive().bytes])));
    assert.throws(()=>preflightDosPackageZip(new Uint8Array(16*1024*1024+1)));
    assert.throws(()=>preflightDosPackageZip(archive(Array.from({length:33},(_,i)=>({name:`n${i}`,bytes:text('x')}))).bytes));
});
for(const name of ['../owned.img','/owned.img','C:/owned.img','a\\owned.img','a/../owned.img','a//owned.img'])test(`unsafe archive path ${name}`,()=>assert.throws(()=>preflightDosPackageZip(archive([{name,bytes:text('x')}]).bytes)));
test('case collisions and local-central size mismatches refuse',()=>{
    assert.throws(()=>preflightDosPackageZip(archive([{name:'A',bytes:text('x')},{name:'a',bytes:text('x')}]).bytes));
    const x=archive();x.bytes.writeUInt32LE(2,x.layout[0].local+22);assert.throws(()=>preflightDosPackageZip(x.bytes));
});
for(const [name,change] of [
    ['host mount',s=>s.replace('boot -l c','mount d /host\nboot -l c')],
    ['shell command',s=>s.replace('boot -l c','echo unsafe\nboot -l c')],
    ['program execution',s=>s.replace('boot -l c','game.exe\nboot -l c')],
    ['unsupported device',s=>s.replace('-t hdd','-t cdrom')],
    ['unknown option',s=>s.replace('-t hdd','-fs fat -t hdd')],
    ['wrong geometry',s=>s.replace('17,4,1','17,4,2')],
    ['traversal config reference',s=>s.replace('disk/owned.img','../owned.img')],
    ['missing image',s=>s.replace('disk/owned.img','disk/missing.img')],
    ['duplicate CPU key',s=>s.replace('cputype=386','cputype=386\ncputype=auto')]
])test(`closed GUI package boundary refuses ${name}`,()=>{const rows=members();rows[0].bytes=text(change(conf));assert.throws(()=>localDosPackage(rows));});
test('ambiguous config, extra image/executable and malformed config are useful persistent refusals',()=>{
    for(const extra of [{name:'other/dosbox.conf',bytes:text(conf)},{name:'other.img',bytes:boot},{name:'game.exe',bytes:text('MZ')}])assert.throws(()=>localDosPackage([...members(),extra]));
    const x=members();x[0].bytes=new Uint8Array(16385).fill(65);assert.throws(()=>localDosPackage(x),/16 KiB/);
});

// Execute the real connected production handlers with actual ZIP+package
// modules; replace only component state/ref and parent callback interfaces.
const manager=readFileSync(new URL('../overlay/scratch-gui/src/components/tw-pseudocode/machine-manager.jsx',import.meta.url),'utf8');
function chooser(onRun=async()=>{}) {
    const updates=[],closed=[],owner={current:{mounted:true,epoch:{},file:null,busy:false}};
    const start=manager.indexOf('    const selectDosPackage ='),end=manager.indexOf('    const runFree386 =',start);assert.ok(start>=0&&end>start);
    const api=new Function('dosPackageOwner','setDosPackageFile','setDosPackageBusy','setStatus','readDosPackageZip','localDosPackage','DOS_PACKAGE_LIMITS','onRun','onClose',manager.slice(start,end)+'return {selectDosPackage,runDosPackage};')(
        owner,()=>{},()=>{},value=>updates.push(value),readDosPackageZip,localDosPackage,{rawBytes:16*1024*1024},onRun,()=>closed.push(true));
    // Run the exact effect cleanup; it must revoke the same captured owner.
    const effectStart=manager.indexOf('    React.useEffect(() => {\n        const owner = dosPackageOwner.current;');
    const effectEnd=manager.indexOf('\n    }, []);',effectStart);assert.ok(effectStart>=0&&effectEnd>effectStart);
    const dispose=new Function('dosPackageOwner',manager.slice(effectStart+'    React.useEffect(() => {'.length,effectEnd))(owner);
    return {...api,updates,closed,owner,dispose};
}
const file=bytes=>({name:'owned.zip',size:bytes.length,arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.length)});
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};};
test('real chooser handler boots admitted data only and rejects any media/network fallback',async()=>{
    let calls=0;const c=chooser(async(cfg,{fetcher})=>{calls++;assert.equal(cfg.machine,'i80386');const disk=await fetcher({url:'local-media:disk'});assert.deepEqual(Buffer.from(disk.bytes),boot);await assert.rejects(fetcher({url:'https://unselected/image'}));});
    c.selectDosPackage(file(archive().bytes));await c.runDosPackage();assert.equal(calls,1);assert.equal(c.closed.length,1);assert.ok(c.updates.some(s=>s.includes('demo/dosbox.conf')));
});
test('real chooser keeps invalid-package error and recovers after new valid selection',async()=>{
    let calls=0;const c=chooser(async()=>{calls++;});c.selectDosPackage(file(Buffer.from('bad')));await c.runDosPackage();assert.equal(c.closed.length,0);assert.equal(calls,0);assert.match(c.updates.at(-1),/DOS package/);
    c.selectDosPackage(file(archive().bytes));await c.runDosPackage();assert.equal(calls,1);assert.equal(c.closed.length,1);
});
test('selection change or effect cleanup while file read awaits prevents boot and stale state writes',async()=>{
    for(const mode of ['selection','unmount']){let calls=0;const gate=deferred(),c=chooser(async()=>{calls++;});c.selectDosPackage({name:'pending.zip',size:100,arrayBuffer:()=>gate.promise});const pending=c.runDosPackage();
        if(mode==='selection')c.selectDosPackage(file(archive().bytes));else c.dispose();const writes=c.updates.length;
        gate.resolve(archive().bytes.buffer);await pending;assert.equal(calls,0);assert.equal(c.updates.length,writes);assert.equal(c.closed.length,0);}
});
test('synchronous busy guard prevents duplicate reads, stale parent completion cannot close replacement',async()=>{
    let calls=0;const gate=deferred(),entered=deferred(),c=chooser(async()=>{calls++;entered.resolve();await gate.promise;});c.selectDosPackage(file(archive().bytes));const pending=c.runDosPackage();await c.runDosPackage();await entered.promise;assert.equal(calls,1);
    c.selectDosPackage(file(archive().bytes));gate.resolve();await pending;assert.equal(c.closed.length,0);
});
test('size cap refuses before File read; actual JSX action imports handlers and tracked mirror matches',async()=>{
    let reads=0;const c=chooser();c.selectDosPackage({name:'large.zip',size:16*1024*1024+1,arrayBuffer(){reads++;}});await c.runDosPackage();assert.equal(reads,0);assert.equal(c.closed.length,0);
    assert.match(manager,/onChange=\{e => selectDosPackage\(e.target.files\?\.\[0\] \|\| null\)\}/);
    assert.match(manager,/data-testid="bw-mm-dos-package-run"[\s\S]*?onClick=\{runDosPackage\}/);
    assert.match(manager,/import \{readDosPackageZip, DOS_PACKAGE_LIMITS\}/);
    assert.equal(manager,readFileSync(new URL('../packages/scratch-gui/src/components/tw-pseudocode/machine-manager.jsx',import.meta.url),'utf8'));
});

test('in-flight extraction owns original ZIP bytes and direct entry shadows cannot change extent',async()=>{
    const x=archive(),pending=readDosPackageZip(x.bytes);x.bytes.fill(0);
    const selected=localDosPackage(await pending);assert.deepEqual(Buffer.from(selected.bytes),boot);
    const rows=members();let getters=0;
    Object.defineProperty(rows[1].bytes,'length',{get(){getters++;throw Error('shadow length');}});
    assert.deepEqual(Buffer.from(localDosPackage(rows).bytes),boot);assert.equal(getters,0);
});
test('a same-basename image outside config directory never resolves as the selected disk',()=>{
    const rows=members();rows[1].name='elsewhere/disk/owned.img';assert.throws(()=>localDosPackage(rows),/config-relative/);
});
test('config DOS-relative backslashes resolve within the same archive directory',()=>{
    const rows=members();rows[0].bytes=text(conf.replace('disk/owned.img','disk\\owned.img'));
    assert.equal(localDosPackage(rows).selectedImage,'demo/disk/owned.img');
});
test('disposed chooser ignores later selection and runner callback refusal remains visible',async()=>{
    const disposed=chooser();disposed.dispose();const before=disposed.updates.length;disposed.selectDosPackage(file(archive().bytes));await disposed.runDosPackage();assert.equal(disposed.updates.length,before);
    const c=chooser(async()=>{throw new Error('actual parent boot refusal');});c.selectDosPackage(file(archive().bytes));await c.runDosPackage();assert.equal(c.updates.at(-1),'actual parent boot refusal');assert.equal(c.closed.length,0);
});

test('actual chooser through existing activation/dispatch resolves exactly its declared HDD slot',async()=>{
    const events=[],refs=[];
    const c=chooser(async(config,options)=>runMachineConfig(config,{...options,
        fetcher:async ref=>{refs.push(ref.url);return options.fetcher(ref);},dispatch:detail=>events.push(detail)}));
    c.selectDosPackage(file(archive().bytes));await c.runDosPackage();
    assert.equal(c.closed.length,1);assert.deepEqual(refs,['local-media:disk']);assert.equal(events.length,1);
    assert.equal(events[0].kind,'i80386');assert.equal(events[0].slotId,'hdd');
    assert.deepEqual(events[0].geometry,{cylinders:1,heads:4,sectors:17});assert.deepEqual(Buffer.from(events[0].bytes),boot);
    assert.equal(events[0].nativeBlocks,false);
});

// Cross-action tests evaluate the actual JSX callback expressions and actual
// existing raw/free/library/lesson handlers, not a duplicate package guard.
function crossChooser (phase = 'file') {
    const packageGate=deferred(), otherGate=deferred(), extractionGate=deferred(), extractionEntered=deferred(), updates=[],calls=[],closes=[];
    const owner={current:{mounted:true,epoch:{},file:null,busy:false}};
    const first=manager.indexOf('    const run = async'),last=manager.indexOf('    // A LESSON',first);
    const lessonStart=manager.indexOf('    const runLesson = async'),lessonEnd=manager.indexOf('\n    };',lessonStart)+7;
    const rawExpression=manager.match(/<button onClick=\{(.+)\} style=\{primary\} data-testid="bw-mm-local-run"/)?.[1];
    const savedExpression=manager.match(/<button onClick=\{(.+)\} style=\{primary\} data-testid="bw-mm-run"/)?.[1];
    const freeExpression=manager.match(/<button onClick=\{(.+)\} style=\{primary\}\s*\n\s*data-testid="bw-mm-free386-run"/)?.[1];
    const lessonExpression=manager.match(/<button onClick=\{(.+)\} style=\{primary\}\s*\n\s*disabled=\{lessonBusy/)?.[1];
    const closeExpression=manager.match(/<button onClick=\{(.+)\} style=\{btn\} data-testid="bw-mm-close"/)?.[1];
    assert.ok(rawExpression&&savedExpression&&freeExpression&&lessonExpression&&closeExpression);
    // Include a possible new synchronous invalidator/close wrapper, without
    // rewriting it. In V1 neither exists and actual close callback is direct.
    const prefixStart=manager.indexOf('    const invalidateDosPackage =');
    const prefix=prefixStart>=0?manager.slice(prefixStart,first):'';
    const api=new Function('deps',`const {dosPackageOwner,setDosPackageFile,setDosPackageBusy,setStatus,readDosPackageZip,localDosPackage,DOS_PACKAGE_LIMITS,onRun,onClose,localDosboxMachine,localDisk,localNativeBlocks,text,freeMedia,freeNativeBlocks,localFreedosVgaMachine,defaultImageFetcher,setLessonBusy,lessonT,locale,m,lesson}=deps;${prefix}${manager.slice(first,last)}${manager.slice(lessonStart,lessonEnd)};return {selectDosPackage,runDosPackage,raw:${rawExpression},saved:${savedExpression},free:${freeExpression},lesson:${lessonExpression},close:${closeExpression}};`)({
        dosPackageOwner:owner,setDosPackageFile(){},setDosPackageBusy(){},setStatus:value=>updates.push(value),
        readDosPackageZip:async bytes=>{const entries=await readDosPackageZip(bytes);if(phase==='extraction'){extractionEntered.resolve();await extractionGate.promise;}return entries;},localDosPackage,DOS_PACKAGE_LIMITS:{rawBytes:16*1024*1024},
        onRun:async cfg=>calls.push(cfg),onClose:()=>closes.push(true),
        localDosboxMachine:(...args)=>({kind:'raw',args}),localDisk:{name:'owned.img',size:34816,arrayBuffer:()=>otherGate.promise},localNativeBlocks:false,text:'',
        freeMedia:{floppy:{arrayBuffer:()=>otherGate.promise}},freeNativeBlocks:false,localFreedosVgaMachine:()=>({kind:'free'}),defaultImageFetcher:()=>{throw Error('no fallback');},
        setLessonBusy(){},lessonT:()=>'',locale:'en',m:{kind:'saved'},lesson:{config:{kind:'lesson'}}
    });
    api.selectDosPackage({name:'pending.zip',size:100,arrayBuffer:()=>phase==='file'?packageGate.promise:file(archive().bytes).arrayBuffer()});
    return {api,packageGate,otherGate,extractionGate,extractionEntered,updates,calls,closes};
}
for(const phase of ['file','extraction'])for(const intent of ['raw','free','saved','lesson','close'])test(`new ${intent} intent invalidates pending package ${phase} before alternative awaits or close effect`,async()=>{
    const c=crossChooser(phase),pending=c.api.runDosPackage();
    if(phase==='extraction')await c.extractionEntered.promise;
    const alternative=c.api[intent]();
    if (!['raw','free'].includes(intent)) await alternative;
    const writes=c.updates.length,closes=c.closes.length,calls=c.calls.length;
    c.packageGate.resolve(file(archive().bytes).arrayBuffer());c.extractionGate.resolve();await pending;
    assert.equal(c.calls.length,calls,'stale package must not invoke parent onRun');
    assert.equal(c.updates.length,writes,'stale package must not update status');
    assert.equal(c.closes.length,closes,'stale package must not close a newer intent');
    c.otherGate.resolve(new ArrayBuffer(34816));await alternative;
    if(['raw','free'].includes(intent))assert.equal(c.calls.at(-1).kind,intent,'existing alternative handler still runs');
});

test('both Close bindings and both lesson boot variants synchronously guard the package owner',()=>{
    assert.match(manager,/<div onClick=\{closeManager\} data-testid="bw-machine-manager"/);
    assert.match(manager,/<button onClick=\{closeManager\} style=\{btn\} data-testid="bw-mm-close"/);
    assert.match(manager,/onClick=\{\(\) => \{invalidateDosPackage\(\); return runLesson\(lesson, true\);\}\}/);
});
