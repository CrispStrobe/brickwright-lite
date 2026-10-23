// SPDX-License-Identifier: BSD-3-Clause
import test from 'node:test';
import assert from 'node:assert/strict';
import {createMeasurementHistory, measurementPlotGeometry} from '../overlay/scratch-gui/src/lib/bw-sim/measurements/history.js';
const d = (id = 'a', extra = {}) => ({id, kind: 'speed', label: id, targets: [id], visible: true, ...extra});
const fixture = () => {
    const history = createMeasurementHistory(), session = {}, definitions = [d()];
    const add = (time, value, extra = {}) => history.update({session, definitions, selected: ['a'],
        rows: [{id: 'a', available: value !== null, value}], time, ...extra}).get('a');
    return {history, session, definitions, add};
};
test('128-point cap and finite simulated-time window use exact irregular observation times', () => {
    const {add} = fixture(); let points;
    for (let i = 0; i < 200; i++) points = add(i * 101, i / 2);
    assert.equal(points.length, 127); // 12800ms / 101ms: last127 observations fit.
    assert.deepEqual(points[0], {time: 7373, value: 36.5});
    assert.deepEqual(points.at(-1), {time: 20099, value: 99.5});
    const f = fixture();for(let i=0;i<300;i++) points=f.add(i*100,i);
    assert.equal(points.length,128);assert.equal(points[0].time,17200);
});
test('sub-interval renders do not sample, and a fresh final paused reply replaces the endpoint', () => {
    const {add} = fixture(); add(0,1); add(100,2);
    assert.deepEqual(add(130,3),[{time:0,value:1},{time:100,value:2}]);
    assert.deepEqual(add(150,4,{paused:true}),[{time:0,value:1},{time:150,value:4}]);
    assert.deepEqual(add(150,5,{paused:true}),[{time:0,value:1},{time:150,value:5}]);
});
test('wall-clock changes and stale row rerenders never create or retimestamp samples', () => {
    const {history,session,definitions}=fixture(),rows=[{id:'a',available:true,value:3}];
    const request={session,definitions,selected:['a'],rows,time:100};
    history.update(request);
    assert.deepEqual(history.update({...request,time:99999}).get('a'),[{time:100,value:3}]);
    assert.deepEqual(history.update({...request,rows:[...rows],time:200}).get('a'),[{time:100,value:3},{time:200,value:3}]);
});
test('unavailable and nonfinite values are real gaps and never become invented zeroes', () => {
    const {add}=fixture();add(0,2);add(100,null);add(200,NaN);add(300,4);
    const points=add(400,5);assert.deepEqual(points.map(p=>p.value),[2,null,null,4,5]);
    const g=measurementPlotGeometry(points);assert.deepEqual(g.segments.map(s=>s.length),[1,2]);
    assert.equal(g.min,2);assert.equal(g.max,5);
});
test('time regression, session replacement and changed target or binding isolate histories', () => {
    const f=fixture();f.add(100,1);assert.deepEqual(f.add(0,2),[{time:0,value:2}]);
    assert.deepEqual(f.add(100,3,{session:{}}),[{time:100,value:3}]);
    f.add(200,4);assert.deepEqual(f.add(300,5,{definitions:[d('a',{targets:['other']})]}),[{time:300,value:5}]);
    assert.deepEqual(f.add(400,6,{definitions:[d('a',{targets:['other'],binding:'new'})]}),[{time:400,value:6}]);
});
test('replay hides and clears histories; live return refuses replay-era rows', () => {
    const f=fixture();f.add(0,1);assert.deepEqual(f.add(100,2,{replaying:true}),[]);
    assert.deepEqual(f.add(200,3,{replaying:true}),[]);
    assert.deepEqual(f.add(200,3),[]);
    assert.deepEqual(f.add(300,4),[{time:300,value:4}]);
});
test('only four selected visible definitions collect; removal and hiding release state', () => {
    const f=fixture(),definitions='abcde'.split('').map(id=>d(id));
    const request={session:f.session,definitions,selected:['a','b','c','d','e'],time:0,
        rows:definitions.map((x,i)=>({id:x.id,available:true,value:i}))};
    assert.deepEqual([...f.history.update(request).keys()],['a','b','c','d']);
    const hidden=definitions.map(x=>({...x,visible:x.id!=='a'}));
    assert.deepEqual([...f.history.update({...request,definitions:hidden,time:100,rows:[...request.rows]}).keys()],['b','c','d','e']);
    assert.equal(f.history.update({...request,definitions:[],time:200}).size,0);
});
test('invalid timestamps refuse observation and snapshots cannot mutate retained samples', () => {
    const f=fixture();f.add(0,1);assert.deepEqual(f.add(Infinity,2),[{time:0,value:1}]);
    assert.deepEqual(f.add(-1,2),[{time:0,value:1}]);
    const points=f.add(100,3);points[0].value=999;points.push({time:50,value:999});
    assert.deepEqual(f.add(200,4),[{time:0,value:1},{time:100,value:3},{time:200,value:4}]);
});
test('constant and empty plots have finite geometry without connecting unavailable endpoints', () => {
    assert.equal(measurementPlotGeometry([{time:0,value:null}]).min,null);
    const g=measurementPlotGeometry([{time:0,value:null},{time:100,value:0},{time:200,value:0},{time:300,value:null}]);
    assert.ok(g.segments.flat(2).every(Number.isFinite));assert.equal(g.segments.length,1);
    assert.equal(g.start,0);assert.equal(g.end,300);assert.ok(g.low<0&&g.high>0);
});

test('extreme finite values cannot overflow plot coordinates', () => {
    for (const values of [[-1e308,1e308],[Number.MAX_VALUE,Number.MAX_VALUE]]) {
        const g=measurementPlotGeometry(values.map((value,i)=>({time:i*100,value})));
        assert.ok(g.segments.flat(2).every(Number.isFinite));
        assert.ok(Number.isFinite(g.low)&&Number.isFinite(g.high));
    }
});
