import test from 'node:test';
import assert from 'node:assert/strict';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade,sinkNullLocalDeclarations} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {runProgram} from './helpers/bw-vm.mjs';
import {runPxtArcade} from './helpers/pxt-arcade-runtime.mjs';

// The second-export shape (item 2b): a root `let X: Sprite[] = null`, reset by
// the green-flag script, then overwritten first thing in the parameterless
// startup procedure that the same script calls once.
const program=({prelude='',startup,tail='__bwStartup()',extra=''})=>`let hero=sprites.create(img\`2\`,SpriteKind.Player)
let actors: Sprite[] = null
let found = 0
${prelude}
function __bwStartup () {
${startup}
}
${extra}
${tail}`;
const write='    actors = sprites.allOfKind(SpriteKind.Player)';
const read='    found = actors.indexOf(hero)';
const reasons=async(source,readsNull=false)=>{
    const imported=arcadeToPseudocode(source);
    if(readsNull&&imported.unsupported.length)return {unsupported:imported.unsupported,importRefused:true};
    assert.deepEqual(imported.unsupported,[]);
    const run=await runProgram(imported.code,{frames:5,uploads:imported.costumes,storage:true});
    try{if(!readsNull)assert.deepEqual(run.errors,[]);return projectToArcade(run.creator.project,{costumeSvg:(t,c)=>run.creator.assets.get(c.assetId)?.data});}
    finally{run.vm.stopAll();run.vm.quit();}
};
const refused=out=>out.importRefused||out.unsupported.some(reason=>/Array reference .*requires an actual initialized Array producer/.test(reason));

test('a startup null reset before the sole startup call is dead at reads after the startup overwrite, matching PXT',async()=>{
    const source=program({startup:`${write}\n${read}`});
    const expected=await runPxtArcade(source);assert.equal(expected.found,0);
    const out=await reasons(source);assert.deepEqual(out.unsupported,[]);
    assert.equal((await runPxtArcade(out.ts)).found,expected.found);
});

const nearMisses={
    // The VM reports the null read at run time; the export must still refuse it.
    'read before the overwrite':{startup:`${read}\n${write}`,readsNull:true},
    'conditional overwrite':{startup:`    if (hero.x > 0) {\n    ${write}\n    }\n${read}`},
    'a second startup call':{tail:'__bwStartup()\n__bwStartup()',startup:`${write}\n${read}`},
    'an event handler calls the startup procedure':{tail:'__bwStartup()\ncontroller.A.onEvent(ControllerButtonEvent.Pressed, function () {\n    __bwStartup()\n})',startup:`${write}\n${read}`},
    'a handler writes null again':{tail:'__bwStartup()\ncontroller.A.onEvent(ControllerButtonEvent.Pressed, function () {\n    actors = null\n})',startup:`${write}\n${read}`},
    // Unsafe without the single-caller rule: the update handler's call can be
    // between its overwrite and its read when the later root reset runs.
    'a concurrent caller can interleave a later reset':{startup:`${write}\n    pause(50)\n${read}`,tail:'game.onUpdate(function () {\n    __bwStartup()\n})\npause(20)\nactors = null\n__bwStartup()'},
    // Unsafe without the same-script rule: the handler's call can be between
    // its overwrite and its read when the green-flag reset runs.
    'only a handler calls the startup procedure':{startup:`${write}\n    pause(50)\n${read}`,tail:'game.onUpdate(function () {\n    __bwStartup()\n})\npause(20)\nactors = null'},
    // Unsafe without the green-flag rule: two handler runs interleave, the
    // second one's reset landing between the first one's overwrite and read.
    'a handler resets and calls':{startup:`${write}\n    pause(50)\n${read}`,tail:'game.onUpdate(function () {\n    actors = null\n    __bwStartup()\n})'},
    'the overwrite copies the reset value':{startup:`    actors = actors\n${read}`,readsNull:true},
    'a reader outside the startup procedure':{tail:'__bwStartup()\nfound = actors.indexOf(hero)',startup:write},
};
for(const [name,edit]of Object.entries(nearMisses))test(`near miss stays refused: ${name}`,async()=>{
    assert.ok(refused(await reasons(program(edit),edit.readsNull)),name);
});

test('only a whole top-level first assignment receives a green-flag null local declaration',()=>{
    const sink=(lines,decl='    let v: Sprite[] = null')=>sinkNullLocalDeclarations(['v'],[decl],lines);
    assert.deepEqual(sink(['    a = 1','    v = sprites.allOfKind(0)','    b = v.length']),['    a = 1','    let v: Sprite[] = sprites.allOfKind(0)','    b = v.length']);
    const kept=[
        ['    b = v','    v = c'],                       // read first
        ['    while (x) {','        v = c','    }'],      // nested
        ['    v = v.concat(c)'],                          // self reference
        ['    v = f(function () {','        g()','    })'],// multi-line value
        ['    a = img`','    v = c','`'],                // inside a template literal
        ['    v = img`1`'],                               // ends in a template quote
        ['    vv = 1','    v.push(1)'],                    // first mention is not an assignment
    ];
    for(const lines of kept)assert.deepEqual(sink(lines),['    let v: Sprite[] = null',...lines],lines.join(' / '));
    for(const decl of ['    let v: number = 0','    let v = null','        let v: Sprite[] = null'])
        assert.deepEqual(sink(['    v = c'],decl),[decl,'    v = c'],decl);
});

// The startup reset discount, like every other reset discount, needs an owned
// project snapshot: a mutable project can change after the proof.
test('a startup reset is discounted only for an owned project snapshot',async()=>{
    const {default:Creator}=await import('../overlay/scratch-gui/src/lib/sb3-creator-register-art.js');
    const {createProjectJsonSnapshot}=await import('../overlay/scratch-gui/src/lib/bw-makecode/project-json-snapshot.js');
    const {createArrayReferenceExportAuthority}=await import('../overlay/scratch-gui/src/lib/bw-makecode/array-reference-export-authority.js');
    const imported=arcadeToPseudocode(program({startup:write+'\n'+read}));assert.deepEqual(imported.unsupported,[]);
    const creator=new Creator();creator.parse(imported.code);
    const verdicts=project=>{
        const proof=createArrayReferenceExportAuthority(project),out=[];
        for(const target of project.targets)for(const node of Object.values(target.blocks))
            if(node.opcode==='arrays_referenceIndexOf')out.push(proof.validateInput(target,node).ok);
        return out;
    };
    const owned=verdicts(createProjectJsonSnapshot(JSON.stringify(creator.project)));
    assert.ok(owned.length>0);assert.ok(owned.every(Boolean),'owned snapshot keeps the 2b discount');
    const raw=verdicts(JSON.parse(JSON.stringify(creator.project)));
    assert.equal(raw.length,owned.length);assert.ok(raw.every(ok=>ok===false),'a mutable project gets no startup reset discount');
});
