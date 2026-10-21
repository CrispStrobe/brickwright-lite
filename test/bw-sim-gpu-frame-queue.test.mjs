import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createGpuFrameQueue} from '../overlay/scratch-gui/src/lib/bw-sim/view/gpu-frame-queue.js';
function context() {
    let next=0;
    return {SYNC_STATUS:1,SIGNALED:2,SYNC_GPU_COMMANDS_COMPLETE:3,signaled:false,lost:false,deleted:[],
        fenceSync(){return ++next;},deleteSync(f){this.deleted.push(f);},
        getSyncParameter(){return this.signaled?2:0;},isContextLost(){return this.lost;}};
}
const source=readFileSync(new URL('../overlay/scratch-gui/src/lib/bw-sim/view/sim-view3d.js',import.meta.url),'utf8');
const renderMethod=source.slice(source.indexOf('    const render = (snapshot'),source.indexOf('    const dispose = () =>',source.indexOf('    const render = (snapshot')));
function view(gl) {
    const queue=createGpuFrameQueue(gl),drawn=[];let pose=null;
    const noop=()=>{};
    const scope={gpuFrames:queue,resize:noop,onDemand:false,changed:()=>true,
        renderer:{getSize:()=>({x:100,y:100}),render:()=>drawn.push(pose)},
        Vector2:class{},Vector3:class{},applySnapshot:(_b,s)=>{pose=s.pose;},
        built:{scene:{updateMatrixWorld:noop}},chainMotion:null,simBelts:null,pens:null,
        drawingPreview:null,simRopes:null,simHoses:null,followPartId:null,partCentre:noop,
        followFrame:null,massCentre:()=>null,modelBox:()=>({getCenter:()=>null}),
        camera:{updateMatrixWorld:noop},controls:{},updateSensors:noop,pulse:{tick:noop},insight:{update:noop}};
    const render=new Function(...Object.keys(scope),`let dirty=true,followed=null;${renderMethod}return render;`)(...Object.values(scope));
    return{render,drawn,queue};
}
test('the actual Simulate render method coalesces a busy GPU to the latest physical pose',()=>{
    const gl=context(),v=view(gl);
    for(let pose=0;pose<40;pose++)v.render({pose});
    assert.deepEqual(v.drawn,[0],'one frame in flight, no stale-pose backlog');
    assert.equal(v.queue.pending,1);
    gl.signaled=true;v.render({pose:40});
    assert.deepEqual(v.drawn,[0,40],'draw the latest pose when the GPU finishes');
});
test('forced captures retain one covering fence and release it on disposal',()=>{
    const gl=context(),v=view(gl);v.render({pose:0});v.render({pose:1},{force:true});
    assert.deepEqual(v.drawn,[0,1]);assert.equal(v.queue.pending,1);assert.deepEqual(gl.deleted,[1]);
    v.queue.dispose();assert.equal(v.queue.pending,0);assert.deepEqual(gl.deleted,[1,2]);
});
test('lost contexts discard handles without invalid deletion; WebGL without fences keeps rendering',()=>{
    const gl=context(),q=createGpuFrameQueue(gl);q.submitted();gl.lost=true;
    assert.equal(q.busy(),false);q.dispose();assert.deepEqual(gl.deleted,[]);
    const legacy=context();delete legacy.fenceSync;const v=view(legacy);
    v.render({pose:1});v.render({pose:2});assert.deepEqual(v.drawn,[1,2]);assert.equal(v.queue.pending,0);
});
