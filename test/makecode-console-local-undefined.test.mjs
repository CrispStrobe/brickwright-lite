import test from 'node:test';
import assert from 'node:assert/strict';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {CONSOLE_LOCAL_UNDEFINED_SOURCE as source} from './fixtures/arcade/console-local-undefined.mjs';

test('declaration-site Undefined keeps lexical ordering and all-writer refusals',()=>{
 for(const init of ['',':number',':string',':boolean',':any']){
  const result=arcadeToPseudocode(`function read(){let cell${init};return console.inspect(cell)}let result=read()`);
  assert.deepEqual(result.unsupported,[],init);assert.match(result.code,/arcade set local .* to \(undefined value\)/);
 }
 for(const source of ['function read(){var cell;return console.inspect(cell)}let result=read()','function read(){const cell;return console.inspect(cell)}let result=read()','function read(){let cell;let cell;return console.inspect(cell)}let result=read()','function read(){return console.inspect(cell);let cell}let result=read()','function read(){let cell;cell=image.create(1,1);return console.inspect(cell)}let result=read()','function read(){let cell:Image;return console.inspect(cell)}let result=read()','function read(){let cell:image.Font;return console.inspect(cell)}let result=read()','function read(){let cell:number[];return console.inspect(cell)}let result=read()','function read(){if(false){let cell}return console.inspect(cell)}let result=read()'])assert.ok(arcadeToPseudocode(source).unsupported.length,source);
});

test('actual SDK-observed local defaults preserve Undefined through Code, restart, saved projects and export',async()=>{
 const {runArcadeSourceCode}=await import('./helpers/arcade-source-program.mjs');
 const {stepFrames,clearStrayTimers}=await import('./helpers/bw-vm.mjs');
 const imported=arcadeToPseudocode(source);assert.deepEqual(imported.unsupported,[]);assert.deepEqual(imported.warnings,[]);
 const names=['inspectGlobalNumber','inspectGlobalString','inspectGlobalBoolean','inspectGlobalUntyped','inspectLocalNumber','inspectLocalString','inspectLocalBoolean','inspectLocalUntyped','inspectLocalAlias','inspectLocalReturn','inspectLocalBeforeAssignment','inspectLocalExplicitUndefined'];
 const check=run=>{assert.deepEqual(run.errors,[]);const values=Object.fromEntries(run.vm.runtime.targets.flatMap(target=>Object.values(target.variables)).map(variable=>[variable.name,variable.value]));for(const name of names)assert.equal(values[name],'undefined',name);assert.equal(values.inspectLocalKeep,Array(12).fill('undefined').join('|'));assert.equal(values.inspectLocalReady,true);};
 const runs=[],execute=async code=>{const run=await runArcadeSourceCode(code,{frames:0});runs.push(run);await stepFrames(run.vm,1,0);await stepFrames(run.vm,8,20);check(run);return run;};
 try {
  const run=await execute(imported.code);await execute(run.creator.decompile());
  run.vm.stopAll();run.vm.greenFlag();await stepFrames(run.vm,1,0);await stepFrames(run.vm,8,20);check(run);
  const saved=Buffer.from(await(await run.vm.saveProjectSb3()).arrayBuffer());run.vm.stopAll();await run.vm.loadProject(saved);run.vm.runtime.bwArcadeFrameAuthority='manual';run.vm.greenFlag();await stepFrames(run.vm,1,0);await stepFrames(run.vm,8,20);check(run);
  const fresh=await runArcadeSourceCode('SPRITE Placeholder:\nWHEN flag clicked:\n  hide',{frames:0});runs.push(fresh);fresh.vm.stopAll();await fresh.vm.loadProject(saved);fresh.vm.runtime.bwArcadeFrameAuthority='manual';fresh.vm.greenFlag();await stepFrames(fresh.vm,1,0);await stepFrames(fresh.vm,8,20);check(fresh);
  const exported=projectToArcade(JSON.parse(run.vm.toJSON()));assert.deepEqual(exported.unsupported,[]);const again=arcadeToPseudocode(exported.files);assert.deepEqual(again.unsupported,[],exported.ts);await execute(again.code);
 } finally {for(const run of runs){run.vm.stopAll();run.vm.quit();}clearStrayTimers();}
});

test('declaration initialization is opt-in and respects distinct actual local scopes',async()=>{
 const {parseMakeCodeTs}=await import('../overlay/scratch-gui/src/lib/bw-makecode/ts-import.js');
 const {analyseSourceValueProducers}=await import('../overlay/scratch-gui/src/lib/bw-makecode/source-value-producers.js');
 const program=parseMakeCodeTs('let global;function outer(){let cell;function sibling(){let cell:Image;return cell}return cell}');
 const ordinary=analyseSourceValueProducers(program),selected=analyseSourceValueProducers(program,{declaredLocalUndefined:true});
 assert.equal(ordinary.localUndefinedDeclarations.length,0);assert.equal(selected.localUndefinedDeclarations.length,1);
 assert.equal(selected.localUndefinedDeclarations[0],program.body[1].body[0].decls[0]);
 const imported=arcadeToPseudocode('let cell="global";function read(){let cell;return console.inspect(cell)}function other(){let cell="other";return console.inspect(cell)}let local=read();let global=console.inspect(cell);let sibling=other()');
 assert.deepEqual(imported.unsupported,[]);assert.match(imported.code,/undefined value/);
});
