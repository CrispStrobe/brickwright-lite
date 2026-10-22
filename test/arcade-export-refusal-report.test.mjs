import {test as originalTest} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import Creator from '../overlay/scratch-gui/src/lib/sb3-creator-register-art.js';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectJsonToArcade,projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {makeCodeProjectFile} from '../overlay/scratch-gui/src/lib/bw-makecode/project-file.js';
import {balancedFrom} from './helpers/js-scope.mjs';
const observations=[];
const test=(title,body)=>originalTest(title,async t=>{
    const first=observations.length;
    try {await body(t);}catch(error){try{t.diagnostic(JSON.stringify({schema:'arcade-export-report-test-failure-v1',observations:observations.slice(first)}));}catch{}throw error;}
});
const component=readFileSync(new URL('../overlay/scratch-gui/src/components/tw-pseudocode/pseudocode-importer.jsx',import.meta.url),'utf8');
const method=signature=>balancedFrom(component,component.indexOf(signature)+signature.length,'{','}',signature);
const context=()=>{const c={props:{vm:{}},state:{conversionReport:null},setState(patch){const update=typeof patch==='function'?patch(this.state):patch;if(update)Object.assign(this.state,update);}};
    for(const [name,args] of [['invalidateArcadeReport',''],['beginArcadeReport',''],['publishArcadeReport','request, out, operation, outcome']])
        c[name]=new Function(args,method(`${name} (${args})`).slice(1,-1));return c;};
const exported=text=>{const imported=arcadeToPseudocode(text);assert.deepEqual(imported.unsupported,[]);const creator=new Creator();creator.parse(imported.code);
    assert.deepEqual(creator.errors,[]);const before=JSON.stringify(creator.project),out=projectJsonToArcade(before);assert.equal(JSON.stringify(creator.project),before);observations.push({source:text,importedCode:imported.code,project:JSON.parse(before),output:out});return {creator,out};};
const refused=()=>{
    const creator=new Creator();creator.parse('DEVICE ARCADE\nGLOBAL result\nSPRITE Game:\nWHEN flag clicked:\n  set result to (calculate value (arcade new image width 1 height 1) op "+" with (1))');
    assert.deepEqual(creator.errors,[]);assert.deepEqual(creator.unparsed,[]);
    const projectJson=JSON.stringify(creator.project),out=projectJsonToArcade(projectJson);
    observations.push({pseudocode:'DEVICE ARCADE\nGLOBAL result\nSPRITE Game:\nWHEN flag clicked:\n  set result to (calculate value (arcade new image width 1 height 1) op "+" with (1))',project:JSON.parse(projectJson),output:out});
    return {creator,out};
};

test('actual exporter retains its candidate draft and observed facts without inventing a selected block',async()=>{
    const {creator,out}=refused();assert.ok(out.unsupported.includes('native addition requires initialized primitive or proved flat Array operands'));
    assert.equal(out.unsupportedDetails.length,1);const detail=out.unsupportedDetails[0];assert.equal(detail.physicalOrigin,'UNAVAILABLE');
    assert.ok(detail.emissionCandidates.length);for(const site of detail.emissionCandidates){
        const target=creator.project.targets.find(t=>t.name===site.target);assert.ok(target);assert.equal(target.blocks[site.blockId].opcode,site.opcode);
        assert.deepEqual(site.operands,['LEFT','RIGHT']);}
    assert.equal(typeof out.refusalEvidence.nativeAdditionDraft,'string');assert.ok(out.refusalEvidence.nativeAdditionDraft.includes(detail.refusal.helper));
    assert.equal(out.files['main.ts'],out.ts);assert.equal(JSON.stringify(out).includes('nativeArrayDomainCall'),false);
    const url=new URL('../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js',import.meta.url);
    const source=readFileSync(url,'utf8'),needle='const site=this.nativeAdditionSite(b,helper);';
    assert.equal(source.split(needle).length,2,'one diagnostic collector call');
    const faulted=source.replace(needle,"throw new Error('collector observation failed');\n                    "+needle)
        .replace(/\b(from\s+|import\s*\(\s*|import\s+)(['"])(\.{1,2}\/[^'"\n]+)\2/g,(_,prefix,quote,specifier)=>`${prefix}${quote}${new URL(specifier,url).href}${quote}`);
    assert.equal([...source.matchAll(/\b(from\s+|import\s*\(\s*|import\s+)(['"])(\.{1,2}\/[^'"\n]+)\2/g)].length,44,'all current literal dependencies are rebased, including parent paths');
    assert.equal(/\b(from\s+|import\s*\(\s*|import\s+)(['"])(\.{1,2}\/[^'"\n]+)\2/.test(faulted),false,'data URL retains no relative literal import');
    const copy=await import('data:text/javascript;base64,'+Buffer.from(faulted).toString('base64'));
    const observed=copy.projectJsonToArcade(JSON.stringify(creator.project));
    assert.deepEqual(observed.unsupported,out.unsupported);assert.deepEqual(observed.files,out.files);
    assert.equal(observed.refusalEvidence.nativeAdditionDraft,out.refusalEvidence.nativeAdditionDraft);
    assert.deepEqual(observed.unsupportedDetails[0].emissionCandidates,[],'collector failure does not replace export/refusal');
    const raw=exporter=>{
        const project=structuredClone(creator.project),counts={keys:0,descriptor:0};
        const target=project.targets.find(t=>Object.values(t.blocks).some(b=>b.opcode==='arrays_valueBinary'));
        assert.ok(target);target.blocks=new Proxy(target.blocks,{ownKeys(value){counts.keys++;return Reflect.ownKeys(value);},
            getOwnPropertyDescriptor(value,key){counts.descriptor++;return Reflect.getOwnPropertyDescriptor(value,key);}});
        const output=exporter(project);return {counts,output};
    };
    const original=raw(projectToArcade),withoutCollector=raw(copy.projectToArcade);
    assert.deepEqual(original.counts,withoutCollector.counts,'raw provenance adds no source reflection/callback');
    assert.deepEqual(original.output.files,withoutCollector.output.files);assert.deepEqual(original.output.unsupported,withoutCollector.output.unsupported);
    assert.deepEqual(original.output.unsupportedDetails[0].emissionCandidates,[],'raw objects never acquire owned-JSON provenance');
});

test('clean exports keep the old result shape and later exports do not inherit details',()=>{
    refused();const {out}=exported('let result=1+2;');assert.deepEqual(out.unsupported,[]);
    assert.deepEqual(Object.keys(out).sort(),['files','ts','unsupported','warnings']);
});

test('real exporter output reaches the existing report with exact reasons and export-only wording',()=>{
    const {out}=refused(),c=context(),request=c.beginArcadeReport();
    c.publishArcadeReport(request,out,'export','Arcade source saved; not compiled or run.');
    const report=c.state.conversionReport;assert.deepEqual(report.unsupported,out.unsupported);assert.strictEqual(report.details,out.unsupportedDetails);
    assert.equal(report.direction,'Blocks → Arcade export');assert.equal(report.operation,'export');assert.equal(c.state.reportExpanded,true);
    assert.doesNotMatch(report.outcome,/generated and loaded/);assert.equal(report.preserved,false);
    assert.match(component,/data-testid="bw-conversion-refusal-details"/);
});

test('revision, VM replacement, disposal and later requests reject only stale report publication',()=>{
    const {out}=refused();for(const mutate of [c=>c.invalidateArcadeReport(),c=>{c.props.vm={};},c=>{c._unmounted=true;},c=>c.beginArcadeReport()]){
        const c=context(),request=c.beginArcadeReport();mutate(c);c.publishArcadeReport(request,out,'export','stale');assert.equal(c.state.conversionReport,null);
    }
    const c=context(),old=c.beginArcadeReport();c.publishArcadeReport(old,out,'export','first');c.invalidateArcadeReport();assert.equal(c.state.conversionReport,null);
    const clean=exported('let result=1+2;').out,request=c.beginArcadeReport();c.publishArcadeReport(request,clean,'export','fresh');
    assert.deepEqual(c.state.conversionReport.unsupported,[]);assert.deepEqual(c.state.conversionReport.details,[]);assert.equal(c.state.reportExpanded,false);
    // React may apply the state updater after this method returns.
    for(const change of [ctx=>ctx.invalidateArcadeReport(),ctx=>{ctx.props.vm={};},ctx=>{ctx._unmounted=true;},ctx=>ctx.beginArcadeReport()]){
        const ctx=context(),queue=[];ctx.setState=update=>queue.push(update);
        const token=ctx.beginArcadeReport();ctx.publishArcadeReport(token,out,'export','deferred');assert.equal(queue.length,1);
        change(ctx);const update=queue[0](ctx.state);assert.equal(update,null);assert.equal(ctx.state.conversionReport,null);
    }
    const queued=context(),queue=[];queued.setState=update=>queue.push(update);
    const token=queued.beginArcadeReport();queued.publishArcadeReport(token,out,'export','still current');
    const update=queue[0](queued.state);assert.equal(update.conversionReport.outcome,'still current');
});

test('actual export method retains exact original files and download transport while reporting the outcome',async()=>{
    const c=context(),files={'main.ts':'let original=7;','pxt.json':JSON.stringify({name:'retained'})};
    let downloads=0,blob;c.makeCodeOriginalStatus=()=>({status:'current',target:'arcade',files});c.arcadeFromStage=()=>{throw new Error('original must not be regenerated');};
    c.L={arcDone:()=> 'saved',mcFailed:(_,message)=>message};
    const signature='async exportArcade ()',body=method(signature),importLine=/const \{makeCodeProjectFile\} = await import\([\s\S]*?'\.\.\/\.\.\/lib\/bw-makecode\/index\.js'\);/;
    assert.match(body,importLine);const execute=new (Object.getPrototypeOf(async function(){}).constructor)('makeCodeProjectFile','downloadBlob','Blob',body.slice(1,-1).replace(importLine,''));
    await execute.call(c,makeCodeProjectFile,async(name,value)=>{downloads++;blob=value;assert.equal(name,'arcade-retained.mkcd');},Blob);
    assert.equal(downloads,1);assert.ok((await blob.text()).length);assert.match(c.state.conversionReport.outcome,/Recovered original/);
    assert.deepEqual(c.state.conversionReport.unsupported,[]);assert.equal(c.state.status,'saved');assert.equal(c.state.busy,false);
});

test('original export error remains visible and assets are not modified by report-only publication',async()=>{
    const c=context(),failure=new Error('asset delivery failed'),assets=[{id:'current',bytes:new Uint8Array([1,2,3])}],before=structuredClone(assets);
    c.arcadeFromStage=async()=>{throw failure;};c.makeCodeOriginalStatus=()=>({status:'stale'});let observed;
    c.L={mcFailed:(_,message)=>{observed=message;return message;}};
    const body=method('async exportArcade ()');const execute=new (Object.getPrototypeOf(async function(){}).constructor)('downloadBlob','Blob',body.slice(1,-1));
    await execute.call(c,()=>{throw new Error('download must not run');},Blob);assert.equal(observed,failure.message);assert.deepEqual(assets,before);
    assert.equal(c.state.conversionReport,null);assert.equal(c.state.busy,false);
    const edited=context();edited.state={lang:'pseudocode',buffers:{pseudocode:'old'},conversionReport:{operation:'export'}};
    edited.setState=patch=>{const update=typeof patch==='function'?patch(edited.state):patch;
        if(update&&Object.hasOwn(update,'conversionReport'))throw new Error('report clear failed');if(update)Object.assign(edited.state,update);};
    const setCode=new Function('LANG_LABEL','text',method('setActiveCode (text)').slice(1,-1));
    assert.doesNotThrow(()=>setCode.call(edited,{pseudocode:'Pseudocode'},'current source'));
    assert.equal(edited.state.buffers.pseudocode,'current source','report-only clearing cannot block the original edit');
});
