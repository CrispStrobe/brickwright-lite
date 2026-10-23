// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {openFile} from '../scripts/lib/sim-lab-scale-gate.mjs';
test('raw import waits for a new completed load even when reopening the same filename',async()=>{
 const oldWindow=globalThis.window,pane={loadToken:{},session:{old:true},state:{modelFile:'same.ldr'}};
 globalThis.window={__bwSimLab:{_pane:pane,status:'ready'}};
 try{
  await openFile({evaluate:async f=>f(),getByTestId:()=>({setInputFiles:async()=>{}}),waitForFunction:async(fn,name)=>{
   assert.equal(fn(name),false,'the old ready scene is not this import');
   pane.loadToken={};pane.session=null;window.__bwSimLab.status='loading';assert.equal(fn(name),false,'teardown has no new session');
   window.__bwSimLab.status='ready';assert.equal(Boolean(fn(name)),false,'ready with a null session cannot finish');
   pane.session={new:true};assert.equal(fn(name),true,'only the newly loaded scene completes');
  }},{name:'same.ldr',buffer:Buffer.from('0 model')});
 }finally{globalThis.window=oldWindow;}
});
