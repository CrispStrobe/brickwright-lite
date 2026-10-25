import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,copyFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const root=path.resolve(import.meta.dirname,'..'),hook=path.join(root,'scripts/lib/register-gui-scope.mjs');
const relative='src/lib/bw-makecode/procedure-constraint-export.js';
const run=(file,scope,loader=false)=>spawnSync(process.execPath,[...(loader?['--import',hook]:[]),'--input-type=module','-e',`import(${JSON.stringify(pathToFileURL(file).href)}).then(({prepareProcedureConstraintExport:prepare})=>{const result=prepare({targets:[]});if(!result)throw Error('missing prepared model');console.log('resolved');})`],{encoding:'utf8',env:{...process.env,BW_INTEGRATED_ROOT:scope},timeout:10000});

test('overlay-only Procedure exporter resolves its exact shared model with the pure-test loader',()=>{
 const empty=mkdtempSync(path.join(tmpdir(),'procedure-overlay-empty-'));
 try{
  const result=run(path.join(root,'overlay/scratch-gui',relative),empty,true);
  assert.equal(result.status,0,result.stdout+result.stderr);assert.match(result.stdout,/resolved/);
 }finally{rmSync(empty,{recursive:true,force:true});}
});

test('installed Procedure exporter uses the real node_modules VM model without overlay or loader fallback',()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'procedure-installed-layout-')),gui=path.join(dir,'packages/scratch-gui'),source=path.join(gui,relative),model=path.join(gui,'node_modules/scratch-vm/src/util/bw-procedure-constraint-model.js');
 try{
  mkdirSync(path.dirname(source),{recursive:true});mkdirSync(path.dirname(model),{recursive:true});
  writeFileSync(path.join(gui,'package.json'),'{}');writeFileSync(path.join(gui,'node_modules/scratch-vm/package.json'),'{"name":"scratch-vm","version":"0.0.0"}');
  for(const name of ['procedure-constraint-export.js','console-capture-provenance.js'])copyFileSync(path.join(root,'overlay/scratch-gui/src/lib/bw-makecode',name),path.join(path.dirname(source),name));
  copyFileSync(path.join(root,'overlay/scratch-vm/src/util/bw-procedure-constraint-model.js'),model);
  assert.deepEqual(readFileSync(model),readFileSync(path.join(root,'overlay/scratch-vm/src/util/bw-procedure-constraint-model.js')));
  const result=run(source,gui);assert.equal(result.status,0,result.stdout+result.stderr);assert.match(result.stdout,/resolved/);
  // A tracked packages/scratch-vm sibling is not the installed overlay. Its
  // presence must never hide a missing dependency in the production layout.
  const decoy=path.join(dir,'packages/scratch-vm/src/util/bw-procedure-constraint-model.js');mkdirSync(path.dirname(decoy),{recursive:true});copyFileSync(model,decoy);rmSync(model);
  for(const loader of [false,true]){const missing=run(source,gui,loader);assert.notEqual(missing.status,0);assert.match(missing.stderr,/ERR_MODULE_NOT_FOUND/);}
 }finally{rmSync(dir,{recursive:true,force:true});}
});

test('an unrelated importer cannot borrow the overlay-only model mapping',()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'procedure-foreign-importer-')),file=path.join(dir,'foreign.mjs');
 try{
  writeFileSync(file,"import model from 'scratch-vm/src/util/bw-procedure-constraint-model.js'; export const prepareProcedureConstraintExport = () => model;");
  const result=run(file,dir,true);assert.notEqual(result.status,0);assert.match(result.stderr,/ERR_MODULE_NOT_FOUND/);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
