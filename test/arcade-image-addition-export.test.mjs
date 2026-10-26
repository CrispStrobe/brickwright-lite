import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade,projectJsonToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import SB3Creator from '../overlay/scratch-gui/src/lib/sb3-creator.js';

// Read the actual hosted original/native controls without importing their VM
// or SDK harness. Accept only plain literal source: interpolation or escapes
// require an explicit fixture refactor, rather than silently testing other code.
const fixture=readFileSync(new URL('./makecode-arcade-image-values.test.mjs',import.meta.url),'utf8');
const sources=[...fixture.matchAll(/const source=`([\s\S]*?)`;/g)].map(match=>match[1]);
assert.equal(sources.length,2);
for(const source of sources)assert.ok(!source.includes('${')&&!source.includes('\\'));

const creatorFor=source=>{
    const imported=arcadeToPseudocode(source);
    assert.deepEqual(imported.unsupported,[]);
    const creator=new SB3Creator();
    creator.parse(imported.code);
    for(const art of imported.costumes)creator.applyCustomSVG(art.sprite,art.svg);
    assert.deepEqual(creator.warnings,[]);
    return creator;
};
const exportProject=(creator,project)=>{
    const out=projectToArcade(project,{costumeSvg:(target,costume)=>creator.assets.get(costume.assetId)?.data});
    assert.deepEqual(out.unsupported,[]);
    assert.match(out.ts,/function __bwBinaryAdd\(left: any, right: any\): any \{ return left \+ right \}/);
    assert.doesNotMatch(out.ts,/\.join\(/,'Image callers never select an object-to-Array join');
    return out;
};

for(const [index,source] of sources.entries()){
    test(`Image fixture ${index+1} preserves ordinary addition in direct and JSON source round trips`,()=>{
        const creator=creatorFor(source);
        for(const project of [creator.project,JSON.parse(JSON.stringify(creator.project))]){
            const out=exportProject(creator,project);
            const reopened=creatorFor(out.ts);
            exportProject(reopened,reopened.project);
            assert.match(out.ts,/\.clone\(\)/,'the actual clone operation stays emitted');
            assert.match(out.ts,/\.setPixel\(/,'the actual mutation operation stays emitted');
            assert.match(out.ts,/\.getPixel\(/,'the actual observation operation stays emitted');
        }
    });
}

let reopenedFixture;
const reopenedImageProject=()=>{
    if(!reopenedFixture){
        const first=creatorFor(sources[0]),second=creatorFor(exportProject(first,first.project).ts);
        reopenedFixture={json:JSON.stringify(second.project),assets:second.assets};
    }
    return {project:JSON.parse(reopenedFixture.json),assets:reopenedFixture.assets};
};

test('costume-backed Image addition proves the actual wrapped frame selection on first export',()=>{
    const creator=creatorFor(sources[0].replace('image.create(2,1)','img`5 5`'));
    const out=exportProject(creator,creator.project);
    assert.match(out.ts,/Math\.round\(0\)/,'retain the emitted frame-selection operation');
    assert.match(out.ts,/__bwFrames_shared\d+/);
});

test('direct owned Array evidence preserves the original mutable callback receiver and argument',()=>{
    const creator=reopenedImageProject(),stage=creator.project.targets.find(target=>target.isStage);
    let calls=0;
    const options={stageBackground:function(...args){
        calls++;assert.equal(this,options);assert.equal(args.length,1);assert.equal(args[0],stage);
        assert.equal(Object.isFrozen(stage),false);return null;
    }};
    const out=projectToArcade(creator.project,options);
    assert.equal(calls,1);assert.deepEqual(out.unsupported,[]);
});

test('artwork callbacks cannot renew an owned Array proof after a physical source edit',()=>{
    const creator=reopenedImageProject();let calls=0;
    const out=projectToArcade(creator.project,{stageBackground(){
        calls++;
        const assignment=creator.project.targets.flatMap(target=>Object.values(target.blocks)).find(node=>node.opcode==='data_setvariableto'&&node.fields.VARIABLE[0]==='refs');
        assert.ok(assignment);assignment.fields.VARIABLE=[...assignment.fields.VARIABLE];
        return null;
    }});
    assert.equal(calls,1);
    assert.ok(out.unsupported.some(reason=>/current|changed|snapshot/.test(reason)),JSON.stringify(out.unsupported));
});

test('a late ambient mutation expires the exact owned Array proof before publication',()=>{
    const creator=reopenedImageProject(),property='__bwArrayOwnedExportAmbient';let calls=0;
    assert.equal(Object.hasOwn(Array.prototype,property),false);
    try{
        const out=projectToArcade(creator.project,{stageBackground(){
            calls++;Object.defineProperty(Array.prototype,property,{value:1,configurable:true});return null;
        }});
        assert.equal(calls,1);
        assert.ok(out.unsupported.some(reason=>/current|changed|snapshot/.test(reason)),JSON.stringify(out.unsupported));
    }finally{delete Array.prototype[property];}
    assert.deepEqual(projectToArcade(creator.project).unsupported,[],'a new exporter receives a fresh source/proof context');
});

test('direct fallback cannot manufacture owned JSON from getters, toJSON, or repeated source identities',()=>{
    for(const kind of ['getter','toJSON','shared']){
        const creator=reopenedImageProject();
        if(kind==='getter')Object.defineProperty(creator.project,'notJsonData',{get(){return 1;},enumerable:true});
        else if(kind==='toJSON')creator.project.toJSON=()=>({targets:creator.project.targets});
        else{const shared={unused:1};creator.project.firstShared=shared;creator.project.secondShared=shared;}
        const out=projectToArcade(creator.project);
        assert.ok(out.unsupported.some(reason=>reason.includes('Array reference')),kind+': '+JSON.stringify(out.unsupported));
    }
});

test('JSON export also consumes its used Array proof after the last artwork callback',()=>{
    const creator=reopenedImageProject(),json=JSON.stringify(creator.project),property='__bwArrayJsonExportAmbient';
    let calls=0;
    try{
        const out=projectJsonToArcade(json,{stageBackground(stage){
            calls++;assert.equal(Object.isFrozen(stage),true);
            Object.defineProperty(Array.prototype,property,{value:1,configurable:true});return null;
        }});
        assert.equal(calls,1);
        assert.ok(out.unsupported.some(reason=>/current|changed|snapshot/.test(reason)),JSON.stringify(out.unsupported));
    }finally{delete Array.prototype[property];}
    assert.deepEqual(projectJsonToArcade(json).unsupported,[]);
});
