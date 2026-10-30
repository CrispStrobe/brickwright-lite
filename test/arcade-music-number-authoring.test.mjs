import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import JSZip from 'jszip';
import Creator from '../overlay/scratch-gui/src/lib/sb3-creator-register-art.js';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade,projectJsonToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';

// Use the unchanged native/original-PXT authoring fixture without importing its
// VM, browser or SDK runner into these separate conversion controls.
const fixture=readFileSync(new URL('./makecode-arcade-music.test.mjs',import.meta.url),'utf8');
const match=fixture.match(/const EDITED = `([^`]+)`;/);
assert.ok(match);assert.equal(match[1].includes('${'),false);
const create=source=>{
    const imported=arcadeToPseudocode(source);assert.deepEqual(imported.unsupported,[]);
    const creator=new Creator();creator.parse(imported.code);
    assert.deepEqual(creator.errors,[]);assert.deepEqual(creator.warnings,[]);return creator;
};
const clean=project=>{
    const direct=projectToArcade(project),json=projectJsonToArcade(JSON.stringify(project));
    assert.deepEqual(direct.unsupported,[]);assert.deepEqual(json.unsupported,[]);
    assert.deepEqual(direct.files,json.files);
    assert.match(direct.ts,/music\.setTempo\(/);assert.match(direct.ts,/music\.tempo\(\)/);
    assert.match(direct.ts,/music\.setVolume\(music\.volume\(\)\)/);
    return direct;
};

test('the existing full music authoring fixture exports through both routes and reimports three times',()=>{
    let creator=create(match[1]);
    for(let i=0;i<3;i++)creator=create(clean(creator.project).files);
    clean(creator.project);
});

test('music Number reporters survive a Code rebuild and actual saved SB3 reopening',async()=>{
    const imported=create(match[1]),code=new Creator();code.parse(imported.decompile());
    assert.deepEqual(code.errors,[]);assert.deepEqual(code.warnings,[]);clean(code.project);
    const zip=await JSZip.loadAsync(await(await code.generateSB3()).arrayBuffer());
    const saved=JSON.parse(await zip.file('project.json').async('string'));
    clean(create(clean(saved).files).project);
});
