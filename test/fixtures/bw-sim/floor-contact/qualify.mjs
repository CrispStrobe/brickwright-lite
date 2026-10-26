// SPDX-License-Identifier: BSD-3-Clause
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {performance} from 'node:perf_hooks';
import {sha256} from './kernel-source.mjs';
const candidateSha256=sha256(readFileSync(new URL('../../../../overlay/scratch-gui/src/lib/bw-sim/physics/jolt-core.js',import.meta.url)));
const manifest=JSON.parse(readFileSync(new URL('./manifest.json',import.meta.url)));
export function qualifyFloorContact(t) {
    const started=performance.now(), originals=[];
    for(const [variant,mode,cold] of [['baseline','drop',0],['candidate','drop',0],['baseline','driven',0],['candidate','driven',0],['candidate','intact',0],...manifest.coldStartsMs.map(ms=>['candidate','held',ms])]) {
        const remaining=manifest.wallLimitTotalMs-(performance.now()-started);
        assert.ok(remaining>0,'total qualification wall bound');
        const child=spawnSync(process.execPath,[
            '--import','./scripts/lib/register-gui-scope.mjs',
            '--import',fileURLToPath(new URL('./register-kernel.mjs',import.meta.url)),
            fileURLToPath(new URL('./actor.mjs',import.meta.url)),mode,String(cold),manifest.qualificationTestEntry
        ],{cwd:new URL('../../../../',import.meta.url),encoding:'utf8',timeout:Math.min(remaining,manifest.wallLimitPerCaseMs),
            maxBuffer:manifest.maxOutputBytesPerCase,env:{...process.env,BW_FLOOR_KERNEL_VARIANT:variant}});
        // Preserve actual child failures, including a baseline that fails before the race is observed.
        assert.equal(child.error,undefined,child.error?.message);
        assert.equal(child.status,0,child.stdout+'\n'+child.stderr);
        const records=child.stdout.split('\n').filter(line=>line.startsWith('FLOOR1436_RESULT '));
        assert.equal(records.length,1,'one original report per isolated process');
        t.diagnostic(records[0]);originals.push(records[0]);
        const r=JSON.parse(records[0].slice('FLOOR1436_RESULT '.length));
        assert.equal(r.schemaVersion,manifest.schemaVersion);
        assert.equal(r.kernel.candidateSha256,candidateSha256);
        assert.equal(r.kernel.effectiveSha256,variant==='baseline'?manifest.kernel.baselineSha256:candidateSha256);
        assert.ok(r.rows.length>1000,'nonvacuous fixed-step observation');
        assert.equal(r.mode,mode);assert.equal(r.coldMs,cold);
        if(mode==='driven'||mode==='intact') {
            assert.ok(r.motorCommands.length>0,'original program actually requests a drive');
            const [port,degrees,speed]=r.motorCommands[0];
            assert.equal(port,'A');assert.ok(Math.abs(degrees+600)<2);assert.equal(speed,96);
        }
        if(mode==='held')assert.deepEqual(r.motorCommands,[]);
        if(mode==='driven') {assert.ok(r.observedUntilMs>=30000);assert.ok(r.maxMotorAngle>.01,'actual motor motion');}
        if(variant==='baseline') {assert.ok(r.escapedSteps>0,'the exact old kernel must reproduce floor loss');assert.ok(r.insideEscapedSteps>0,'the old kernel must lose ground while over its footprint');}
        else {if(mode==='drop'){assert.ok(r.lastEscapeStep<=manifest.compoundRecoveryStepsAllowed,'compound recovers within the predeclared 20-step bound');assert.equal(r.colliderCount,9);}else assert.equal(r.escapedSteps,manifest.sarrusEscapedStepsAllowed,'no dynamic body fully escapes the floor');assert.ok(r.rows.every(row=>row[3]===0),'candidate stays within the qualified floor footprint');}
    }
    return originals;
}
