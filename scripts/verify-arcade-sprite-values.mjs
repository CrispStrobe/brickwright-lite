#!/usr/bin/env node
// Measure sprite value agreement against the unmodified Arcade simulator.
// A translated status is not evidence that numerical/runtime behavior agrees.
import fs from 'node:fs';
import path from 'node:path';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {runProgram} from '../test/helpers/bw-vm.mjs';
import {runPxtArcade} from '../test/helpers/pxt-arcade-runtime.mjs';
const source=`let hero=sprites.create(img\`1\`,SpriteKind.Player)
let centered=hero.toString()
hero.setPosition(12.123,23.456)
let fractional=hero.toString()`;
const expected=await runPxtArcade(source);
const imported=arcadeToPseudocode(source);
const run=await runProgram(imported.code,{frames:20,uploads:imported.costumes,storage:true});
const actual=Object.fromEntries(run.vm.runtime.targets.flatMap(t=>Object.values(t.variables)).map(v=>[v.name.replace(/^Game_/,''),v.value]));
const cases=[['centered','odd-sized sprite creation centering'],['fractional','fixed-point sprite position storage']].map(([name,area])=>({area,variable:name,expected:expected[name],actual:actual[name],status:actual[name]===expected[name]?'agree':'different'}));
const report={generatedAt:new Date().toISOString(),oracle:'complete pinned Arcade simulator and compiler',scope:'authored zero-velocity position fixtures',importUnsupported:imported.unsupported,blockErrors:run.errors,cases};
const out=path.resolve(import.meta.dirname,'../test-results/arcade-sprite-values-gaps-current.json');
fs.writeFileSync(out,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
process.exitCode=cases.some(c=>c.status!=='agree') || imported.unsupported.length || run.errors.length ? 1 : 0;
