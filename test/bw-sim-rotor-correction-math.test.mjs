// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {rotorAxialMoment,rotorPairAddition,rotorTensorPlan,rotorComponents,rotorCommonRate} from '../overlay/scratch-gui/src/lib/bw-sim/physics/rotor-inertia.js';

// Independent Gaussian elimination oracle, not the producer's inverse/matrix helpers.
const solve=(matrix,rhs)=>{
    const a=matrix.map((row,i)=>[...row,rhs[i]]);
    for(let j=0;j<a.length;j++){
        let p=j;for(let i=j+1;i<a.length;i++)if(Math.abs(a[i][j])>Math.abs(a[p][j]))p=i;
        [a[j],a[p]]=[a[p],a[j]];const v=a[j][j];assert.ok(Math.abs(v)>1e-16);
        for(let k=j;k<=a.length;k++)a[j][k]/=v;
        for(let i=0;i<a.length;i++)if(i!==j){const f=a[i][j];for(let k=j;k<=a.length;k++)a[i][k]-=f*a[j][k];}
    }
    return a.map(row=>row.at(-1));
};
const mv=(a,v)=>a.map(row=>row.reduce((s,x,i)=>s+x*v[i],0));
const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0);
const plus=(a,b)=>a.map((v,i)=>v+b[i]);
const scale=(a,v)=>a.map(x=>x*v);
const near=(a,b,tol=1e-11)=>assert.ok(Math.abs(a-b)<=tol*Math.max(1,Math.abs(a),Math.abs(b)),`${a} != ${b}`);
const matrixNear=(a,b)=>a.flat().forEach((v,i)=>near(v,b.flat()[i]));
const A=[[4,1,.2],[1,2,.3],[.2,.3,3]],B=[[2,-.4,.1],[-.4,5,.7],[.1,.7,1.5]],axis=[1,2,3].map(v=>v/Math.sqrt(14));

test('rotor effective axial inertia uses inverse tensor, including a rotated anisotropic axis',()=>{
    const expected=1/dot(axis,solve(A,axis));near(rotorAxialMoment(A,axis),expected);
    assert.ok(Math.abs(expected-dot(axis,mv(A,axis)))>.1,'separates effective moment from a^T I a');
});
test('positive symmetric addition gives mu + Jr for either inertia order and extreme ratios',()=>{
    for(const [i1,i2,jr] of [[4,2,.7],[2,4,.7],[2e-3,5e-5,3e-4],[1,1e8,1e-4]]){
        const x=rotorPairAddition(i1,i2,jr),mu=i1*i2/(i1+i2);
        near((i1+x)*(i2+x)/(i1+i2+2*x),mu+jr);assert.ok(x>=0);
    }
    assert.equal(rotorPairAddition(2,4,0),0);
});
test('full common vector conserves anisotropic bare momentum and every relative angular component',()=>{
    const bare=new Map([['a',A],['b',B]]),h={body1:'a',body2:'b',axis1:axis,axis2:axis,jr:.7};
    const d=rotorTensorPlan(bare,[h]),lambda=.2;
    const w1=scale(solve(d.get('a'),axis),-lambda),w2=scale(solve(d.get('b'),axis),lambda);
    const p=plus(mv(A,w1),mv(B,w2)),c=rotorCommonRate([A,B],p);
    const after=plus(mv(A,plus(w1,c)),mv(B,plus(w2,c)));
    after.forEach(v=>near(v,0));
    plus(w2,scale(w1,-1)).forEach((v,i)=>near(plus(w2,c)[i]-plus(w1,c)[i],v));
    const scalar=scale(axis,-dot(p,axis)/dot(axis,mv(A.map((r,i)=>r.map((v,j)=>v+B[i][j])),axis)));
    assert.ok(Math.hypot(...plus(mv(A,plus(w1,scalar)),mv(B,plus(w2,scalar))))>1e-4,'scalar common-axis correction is a detected mutation');
    const wanted=lambda/(1/(dot(axis,solve(A,axis))+dot(axis,solve(B,axis)))+.7);
    near(dot(axis,plus(w2,scale(w1,-1))),wanted);
});
test('configuration and removal rebuild shared bodies without history or input mutation',()=>{
    const bare=new Map([['a',A],['b',B],['c',A]]),snapshot=JSON.stringify([...bare]);
    const hs=[{body1:'a',body2:'b',axis1:axis,axis2:axis,jr:.7},{body1:'b',body2:'c',axis1:[0,1,0],axis2:[0,1,0],jr:.2}];
    const original=rotorTensorPlan(bare,hs),again=rotorTensorPlan(bare,hs);
    for(const id of bare.keys())matrixNear(original.get(id),again.get(id));
    const removed=rotorTensorPlan(bare,hs.map(h=>({...h,jr:0})));
    for(const [id,a] of bare)matrixNear(removed.get(id),a);
    const restored=rotorTensorPlan(bare,hs);for(const id of bare.keys())matrixNear(restored.get(id),original.get(id));
    assert.equal(JSON.stringify([...bare]),snapshot);
});
test('one moving endpoint receives Jr in either orientation; world and kinematic have no tensor',()=>{
    for(const absent of ['world','kinematic'])for(const swap of [false,true]){
        const h={body1:swap?absent:'a',body2:swap?'a':absent,axis1:axis,axis2:axis,jr:.7};
        const d=rotorTensorPlan(new Map([['a',A]]),[h]);assert.equal(d.size,1);
        matrixNear(d.get('a'),A.map((r,i)=>r.map((v,j)=>v+.7*axis[i]*axis[j])));
    }
});
test('shared dynamic rotors form one free component; any nondynamic rotor endpoint anchors it',()=>{
    const h=(body1,body2,jr=1)=>({body1,body2,jr}),dynamic=new Set(['a','b','c']);
    const free=rotorComponents(dynamic,[h('a','b'),h('b','c')]);
    assert.equal(free.length,1);assert.deepEqual(new Set(free[0].ids),dynamic);assert.equal(free[0].anchored,false);
    for(const end of ['world','kinematic'])assert.equal(rotorComponents(dynamic,[h('a','b'),h('b','c'),h('c',end)])[0].anchored,true);
    assert.deepEqual(rotorComponents(dynamic,[h('a','b',0)]),[]);
});
