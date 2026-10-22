// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
import test from 'node:test';import assert from 'node:assert/strict';
import{createPopupTrigger}from'../overlay/scratch-gui/src/components/tw-pseudocode/sim-lab-popup-trigger.js';
const touch={pointerType:'touch',pointerId:7,clientX:960,clientY:74};
test('touch after a canvas gesture activates even without a compatibility click',()=>{
 let n=0;const h=createPopupTrigger(()=>n++);h.onPointerDown(touch);h.onPointerUp(touch);assert.equal(n,1);
 // The previous touch had no click; a fresh touch must still activate exactly once.
 h.onPointerDown(touch);h.onPointerUp(touch);h.onClick({detail:1});assert.equal(n,2);
});
test('a normal touch click is consumed once, then real mouse and keyboard still activate',()=>{
 let n=0;const h=createPopupTrigger(()=>n++);h.onPointerDown(touch);h.onPointerUp(touch);h.onClick({detail:1});assert.equal(n,1);
 h.onPointerDown(touch);h.onPointerUp(touch); // deliberately no synthesized click
 h.onPointerDown({...touch,pointerType:'mouse'});h.onPointerUp({...touch,pointerType:'mouse'});h.onClick({detail:1});assert.equal(n,3);
 h.onClick({detail:0});assert.equal(n,4);
});
test('scrolling, cancelled touches and unmatched pointers do not open the popup',()=>{
 let n=0;const h=createPopupTrigger(()=>n++);
 h.onPointerDown(touch);h.onPointerUp({...touch,clientX:980});h.onClick({detail:1});assert.equal(n,0);
 h.onPointerDown(touch);h.onPointerCancel();h.onPointerUp(touch);h.onClick({detail:1});assert.equal(n,0);
 h.onPointerDown(touch);h.onPointerUp({...touch,pointerId:8});h.onClick({detail:1});assert.equal(n,0);
 h.onPointerDown(touch);h.onPointerUp(touch);h.onClick({detail:1});assert.equal(n,1);
});
