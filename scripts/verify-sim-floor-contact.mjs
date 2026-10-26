// SPDX-License-Identifier: BSD-3-Clause
// Standalone retained-output reader. No engine or test-producer imports.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const candidateSha256=createHash('sha256').update(readFileSync(new URL('../overlay/scratch-gui/src/lib/bw-sim/physics/jolt-core.js',import.meta.url))).digest('hex');
const manifest=JSON.parse(readFileSync(new URL('../test/fixtures/bw-sim/floor-contact/manifest.json',import.meta.url)));
const pinSource=readFileSync(new URL('../'+manifest.engine.pinSource,import.meta.url),'utf8');
const pinnedURL=pinSource.match(/const JOLT_PHYSICS_URL = '([^']+)'/)[1];
const pinnedIntegrity=pinSource.match(/const JOLT_PHYSICS_INTEGRITY = '([^']+)'/)[1];
assert.equal(pinnedIntegrity,manifest.engine.integrity);
const text=readFileSync(process.argv[2],'utf8');
const records=[...text.matchAll(/^\s*# FLOOR1436_RESULT (\{.*\})\s*$/gm)].map(m=>JSON.parse(m[1]));
assert.equal(records.length,8,'eight original isolated case reports required');
const expected=[['baseline','drop',0],['candidate','drop',0],['baseline','driven',0],['candidate','driven',0],['candidate','intact',0],...manifest.coldStartsMs.map(ms=>['candidate','held',ms])];
for(let i=0;i<records.length;i++) {
    const r=records[i], [variant,mode,cold]=expected[i];
    assert.deepEqual(r.inputs,manifest.inputs.map(({file,bytes,sha256})=>({file,bytes,sha256})));
    assert.deepEqual(r.engine,{version:manifest.engine.version,resolved:pinnedURL,integrity:manifest.engine.integrity});
    assert.equal(r.schemaVersion,1);assert.equal(r.kernel.variant,variant);assert.equal(r.mode,mode);assert.equal(r.coldMs,cold);
    assert.equal(r.kernel.candidateSha256,candidateSha256);
    assert.equal(r.kernel.effectiveSha256,variant==='baseline'?manifest.kernel.baselineSha256:candidateSha256);
    assert.ok(r.rows.length>1000);assert.ok(r.bodyIds.length>=1);
    assert.ok(Number.isFinite(r.floor.bottom)&&Number.isFinite(r.floor.top)&&r.floor.top>r.floor.bottom);
    let escaped=0,first=null,previous=0,lastEscapeStep=0;
    for(const row of r.rows) {
        assert.equal(row.length,4);assert.ok(row.every(Number.isFinite));
        const [t,top,index,outside]=row;
        assert.ok(Math.abs(t-previous-manifest.dtSeconds)<1e-8,'every fixed step retained');previous=t;
        assert.ok(Number.isInteger(index)&&index>=0&&index<r.bodyIds.length);
        assert.ok(Number.isInteger(outside)&&outside>=0&&outside<r.bodyIds.length);
        if(top<r.floor.bottom-manifest.floorEscapeEpsilonM){escaped++;first??=t;lastEscapeStep=Math.round(t/manifest.dtSeconds);}
        if(variant==='candidate')assert.equal(outside,0);
    }
    assert.equal(r.escapedSteps,escaped);assert.equal(r.firstEscape,first);
    assert.equal(r.observedUntilMs,previous*1000);
    if(variant==='baseline')assert.ok(escaped>0,'old-kernel failure retained');
    else if(mode==='drop'){assert.equal(r.lastEscapeStep,lastEscapeStep);assert.ok(lastEscapeStep<=manifest.compoundRecoveryStepsAllowed);assert.equal(r.colliderCount,9);assert.deepEqual(r.initialVelocity,[0,-20,0]);assert.equal(r.initialHeightM,.25);}else assert.equal(escaped,0,'candidate floor escape is forbidden');
    if(mode==='driven'||mode==='intact'){const [port,degrees,speed]=r.motorCommands[0]||[];assert.equal(port,'A');assert.ok(Math.abs(degrees+600)<2);assert.equal(speed,96);}
    if(mode==='held')assert.deepEqual(r.motorCommands,[]);
    if(mode==='driven'){assert.ok(r.observedUntilMs>=30000);assert.ok(r.maxMotorAngle>.01);}
    if(mode==='intact')assert.ok(r.finishedAt>25000&&r.finishedAt<45000);
    if(mode==='held')assert.ok(r.finishedAt>8000&&r.finishedAt<10000);
    assert.equal(r.programCompleted,r.finishedAt!==null);
}
console.log('Floor-contact retained scalar-series audit PASS: eight cases, old-code failure preserved, Sarrus escapes zero, bounded compound recovery.');
