// Native Arcade source phases use the actual VM executor and one cooperative
// deadline. Plain Scratch projects retain the synchronous kernel path.
// Program and scene clocks remain owned by their existing runtime services.
const conditionWaits = require('../../../util/bw-source-condition-waits');
function browserTurn() {
    return new Promise(resolve => {
        if(typeof MessageChannel !== 'function') {setTimeout(resolve,0);return;}
        const channel=new MessageChannel();
        channel.port1.onmessage=()=>{channel.port1.close();channel.port2.close();resolve();};
        channel.port2.postMessage(null);
    });
}
const spriteUpdateLoans=new WeakMap();
class ArcadeFramePhase {
    constructor(runtime,ext,{workNow=()=>performance.now(),budgetMs}={}) {
        this.runtime=runtime;this.ext=ext;this.workNow=workNow;this.budgetMs=budgetMs;
        this.generation=0;this.disposed=false;this.active=false;this.notes=[];this.pending=null;
        this.waitTimers=new Map();this.tickYields=new WeakMap();
        this.sourceAuthority=new WeakMap();this.managedLinks=new WeakMap();this.phaseContext=null;
        this.sourceProjectWitness=null;
        this.conditionWaits=conditionWaits.bind(this);
        this.nativeCallbackOpcodes=new Set(ext.getInfo().blocks.filter(b=>b.blockType==='hat').map(b=>'arcade_'+b.opcode));
        this.cancel=()=>{this.conditionWaits.cancel();this.sourceProjectWitness=null;this.generation++;this.pending=null;this.queuedDelta=null;
            for(const wait of this.waitTimers.values())wait.epoch.clearTimeout(wait.handle);this.waitTimers.clear();};
        this.dispose=()=>{this.disposed=true;this.cancel();};
        // Runtime.dispose clears a project during loadProject as well as on
        // teardown. A successful load reuses this runtime and cached extension;
        // only its new generation may resume scheduling. Detached drivers no
        // longer receive this event and cannot be revived by a later load.
        this.loaded=()=>{this.cancel();this.disposed=false;};
        for(const event of ['PROJECT_START','PROJECT_STOP_ALL'])runtime.on(event,this.cancel);
        runtime.on('PROJECT_LOADED',this.loaded);
        runtime.on('RUNTIME_DISPOSED',this.dispose);
    }
    detach() {
        for(const event of ['PROJECT_START','PROJECT_STOP_ALL'])this.runtime.off(event,this.cancel);
        this.runtime.off('PROJECT_LOADED',this.loaded);
        this.runtime.off('RUNTIME_DISPOSED',this.dispose);
        this.dispose();this.conditionWaits.detach();
    }
    linkManagedCall(thread,caller) {
        if(caller)this.managedLinks.set(thread,{caller,generation:this.generation});
    }
    linkSpriteUpdateChild(entry,thread) {
        const loan=spriteUpdateLoans.get(this);
        if(!loan || loan.entry!==entry || loan.used || loan.generation!==this.generation ||
            loan.context!==this.phaseContext || this.disposed || !this.active || !this.phaseContext ||
            thread.target!==loan.target || thread.blockContainer!==loan.target.blocks ||
            thread.topBlock!==loan.definition || !this.runtime.threads.includes(thread))
            throw new Error('Native Sprite update spawned a foreign or duplicate method');
        loan.used=true;this.sourceAuthority.set(thread,this.generation);
    }
    withSpriteUpdate(entry,invoke) {
        if(spriteUpdateLoans.has(this))throw new Error('Native Sprite update activation cannot reenter');
        const witness=this.ext._sdkSpriteUpdates.claim(entry,this);
        const loan={...witness,entry,context:this.phaseContext,used:false};
        spriteUpdateLoans.set(this,loan);
        try {
            const result=invoke();
            if(!loan.used)throw new Error('Native Sprite update did not spawn its managed method');
            return result;
        } finally {spriteUpdateLoans.delete(this);}
    }
    hasSourceProject() {
        if(this.disposed)return false;
        if(this.ext._sdkSpriteUpdates?.hasSceneUpdates())return true;
        const qualifies=opcode=>opcode==='arcade_sourceWhile'||opcode==='arcade_whenSourceStarts'||this.nativeCallbackOpcodes.has(opcode);
        const witness=this.sourceProjectWitness;
        if(witness && this.runtime.targets.includes(witness.target) &&
            witness.target.blocks===witness.blocks && witness.blocks._blocks===witness.table) {
            const entry=Object.getOwnPropertyDescriptor(witness.table,witness.id);
            const opcode=Object.getOwnPropertyDescriptor(witness.block,'opcode');
            if(entry?.enumerable && Object.hasOwn(entry,'value') && entry.value===witness.block &&
                opcode && Object.hasOwn(opcode,'value') && qualifies(opcode.value))return true;
        }
        this.sourceProjectWitness=null;
        for(const target of this.runtime.targets) {
            const blocks=target.blocks,table=blocks?._blocks || {};
            for(const [id,block]of Object.entries(table)) {
                if(block.opcode==='arcade_sourceWhile'||block.opcode==='arcade_whenSourceStarts'||this.nativeCallbackOpcodes.has(block.opcode)) {
                    const entry=Object.getOwnPropertyDescriptor(table,id),opcode=Object.getOwnPropertyDescriptor(block,'opcode');
                    // Native Blocks store enumerable own data entries. Retain only
                    // a current positive witness, never a false graph snapshot or
                    // an accessor/inherited opcode as a cached certificate.
                    if(entry?.enumerable && Object.hasOwn(entry,'value') && entry.value===block &&
                        opcode && Object.hasOwn(opcode,'value') && qualifies(opcode.value))
                        this.sourceProjectWitness={target,blocks,table,id,block};
                    return true;
                }
            }
        }
        return false;
    }
    requestStep(delta) {
        if(this.continuation){const generation=this.generation;return this.continuation.then(()=>
            generation===this.generation&&!this.disposed?this.requestStep(delta):{cancelled:true});}
        if(this.request){
            if(Number.isFinite(delta)&&delta>=0)this.queuedDelta=(this.queuedDelta ?? 0)+delta;
            return this.request;
        }
        const generation=this.generation;
        const request=(async()=>{
            while(this.generation===generation&&!this.disposed){
                const result=await this.step(delta);
                if(!result.exhausted){
                    if(this.generation!==generation||this.disposed)return {cancelled:true};
                    if(this.queuedDelta===null||this.queuedDelta===undefined)return result;
                    delta=this.queuedDelta;this.queuedDelta=null;
                }
                // Retain this physical request across cooperative work quanta.
                // The host clock keeps running; a timer tick cannot steal its
                // pending scene/frame or execute consumed authored yields twice.
                await browserTurn();
            }
            return {cancelled:true};
        })().finally(()=>{if(this.request===request)this.request=null;});
        this.request=request;return request;
    }
    // Real program timers and scene frames are source turns. They never invoke
    // the ordinary Scratch kernel. Source tick yields are released by actual
    // scene frames only; a timer continuation cannot grant another loop tick.
    requestContinuation() {return this._requestSourceTurn();}
    requestSceneFrame(frame) {return this._requestSourceTurn(frame);}
    _requestSourceTurn(frame) {
        if(this.disposed)return Promise.resolve({cancelled:true});
        const generation=this.generation,prior=this.continuation || this.request;
        const request=(async()=>{
            if(prior)await prior;else await Promise.resolve();
            if(generation!==this.generation || this.disposed)return {cancelled:true};
            if(this.active)throw Error('Overlapping Arcade source turn');
            const rt=this.runtime,held=new Set();
            const now=this.ext._programMillis();
            for(const thread of rt.threads){
                const yielded=this.tickYields.get(thread);
                if(!yielded || !this._eligible(thread))continue;
                if(thread.peekStack()!==yielded.block){this.tickYields.delete(thread);continue;}
                if(frame && yielded.time<now && !this.waitTimers.has(thread)&&!this._waitingTimer(thread)){
                    this.tickYields.delete(thread);
                    if(thread.status===thread.constructor.STATUS_YIELD_TICK||thread.status===thread.constructor.STATUS_YIELD)thread.status=thread.constructor.STATUS_RUNNING;
                }else held.add(thread);
            }
            this.active=true;this.graphicsLoops=new WeakMap();let completion,started=false;
            try {
                while(generation===this.generation && !this.disposed) {
                    const interval=Number(rt.currentStepTime) || (rt.compatibilityMode ?
                        rt.constructor.THREAD_STEP_INTERVAL_COMPATIBILITY : rt.constructor.THREAD_STEP_INTERVAL);
                    const budget=this.budgetMs===undefined?interval*0.75:this.budgetMs;
                    if(!Number.isFinite(budget)||budget<=0)throw Error('Arcade phase work budget must be finite and positive');
                    rt.updateCurrentMSecs();
                    const deadline=this.workNow()+budget;
                    this.phaseContext={deadline,held,exhausted:false};
                    const ready=await this._work(held,deadline,generation);
                    if(generation!==this.generation || this.disposed)return {cancelled:true};
                    if(ready && !started && frame){started=true;completion=frame();continue;}
                    if(ready)return {cancelled:false,completion};
                    await browserTurn();
                }
                return {cancelled:true};
            } finally {this.phaseContext=null;this.active=false;}
        })().finally(()=>{if(this.continuation===request)this.continuation=null;});
        this.continuation=request;return request;
    }
    _armSourceWait(thread) {
        const epoch=this.ext._programClockEpoch,context=thread.peekStackFrame()?.executionContext;
        if(!epoch?.timerAuthority || !context?.timer || !this._sourceOwned(thread))return;
        const remaining=context.duration-context.timer.timeElapsed();
        if(!Number.isFinite(remaining))return;
        if(!(remaining>0)&&thread.blockContainer?.getBlock(thread.peekStack())?.opcode!=='control_wait')return;
        const old=this.waitTimers.get(thread);if(old?.context===context && old.timer===context.timer && old.duration===context.duration)return;
        if(old)old.epoch.clearTimeout(old.handle);
        const generation=this.generation,wait={context,timer:context.timer,duration:context.duration,epoch,generation,ready:false};
        wait.handle=epoch.setTimeout(()=>{
            if(generation!==this.generation || this.disposed || this.waitTimers.get(thread)!==wait)return;
            wait.ready=true;return this.requestContinuation();
        },Math.max(0,remaining));wait.handle?.unref?.();this.waitTimers.set(thread,wait);
    }
    _wakeSourceWaits() {
        for(const [thread,wait]of this.waitTimers) {
            if(wait.generation!==this.generation || !this._sourceOwned(thread) ||
                thread.peekStackFrame()?.executionContext!==wait.context || wait.context.timer!==wait.timer || wait.context.duration!==wait.duration){
                wait.epoch.clearTimeout(wait.handle);this.waitTimers.delete(thread);continue;
            }
            if(wait.ready && !this._waitingTimer(thread)){
                if(thread.status===thread.constructor.STATUS_YIELD || thread.status===thread.constructor.STATUS_YIELD_TICK)thread.status=thread.constructor.STATUS_RUNNING;
                this.waitTimers.delete(thread);
            }
        }
    }
    _live(t) {return !t.isKilled&&t.status!==t.constructor.STATUS_DONE&&t.stack.length>0;}
    _waitingTimer(t) {
        const frame=t.peekStackFrame()?.executionContext;
        return frame?.timer && frame.timer.timeElapsed()<frame.duration;
    }
    _loopTickYield(t) {
        return t.peekStackFrame()?.isLoop && t.blockContainer?.getBlock(t.peekStack())?.opcode!=='arcade_sourceWhile' && (this.runtime.redrawRequested || this.graphicsLoops.get(t)?.has(t.peekStack()));
    }
    _rememberGraphics(t) {
        if(!this.runtime.redrawRequested)return;
        let seen=this.graphicsLoops.get(t);if(!seen)this.graphicsLoops.set(t,seen=new Set());
        for(let i=0;i<t.stack.length;i++)if(t.stackFrames[i]?.isLoop && t.blockContainer?.getBlock(t.stack[i])?.opcode!=='arcade_sourceWhile')seen.add(t.stack[i]);
    }
    _callOf(t) {return [...this.ext._functionCalls].find(call=>call.thread===t) || this.managedLinks.get(t);}
    _managedCallerLive(t) {
        const call=this._callOf(t);
        return (!call || call.generation===undefined || call.generation===this.generation) &&
            (!call?.caller || (this._live(call.caller)&&this.runtime.threads.includes(call.caller)));
    }
    _sourceOwned(t,seen=new Set()) {
        if(!t||!this._live(t)||!this.runtime.threads.includes(t)||!this._managedCallerLive(t)||seen.has(t))return false;
        seen.add(t);
        const managed=this._callOf(t);
        if(managed?.caller)return this._sourceOwned(managed.caller,seen);
        if(this.sourceAuthority.get(t)===this.generation)return true;
        const opcode=(t.blockContainer||t.target?.blocks)?.getBlock(t.topBlock)?.opcode;
        // Use actual native HAT metadata, never an arbitrary name prefix.
        // Product integration binds real owned callback dispatch/run identity.
        if(opcode==='arcade_whenSourceStarts'||this.nativeCallbackOpcodes.has(opcode)){
            this.sourceAuthority.set(t,this.generation);return true;
        }
        const call=this._callOf(t);
        if(call&&this._sourceOwned(call.caller,seen)){this.sourceAuthority.set(t,this.generation);return true;}
        return false;
    }
    _eligible(t,seen=new Set()) {
        if(!t||!this._live(t)||!this.runtime.threads.includes(t)||seen.has(t)||!this._managedCallerLive(t))return false;
        if(this._sourceOwned(t))return true;
        seen.add(t);
        if(t.stack.some(id=>t.blockContainer?.getBlock(id)?.opcode==='arcade_sourceWhile'))return true;
        const call=this._callOf(t);
        return !!call?.caller && this._eligible(call.caller,seen);
    }
    _pump() {this._wakeSourceWaits();this.ext._pumpFunctionCalls();this.ext._pumpCreationWaits();this.ext._pumpTerrainWaits();}
    async _work(held,deadline,generation) {
        const rt=this.runtime;
        while(this.generation===generation&&!this.disposed) {
            if(this.workNow()>=deadline)return false;
            this._pump();
            for(const t of [...rt.threads]) {
                if(this.workNow()>=deadline)return false;
                if(!this._live(t)||held.has(t)||!this._eligible(t))continue;
                if(this.conditionWaits.parked(t))continue;
                this.conditionWaits.beforeStep(t);
                if(this._waitingTimer(t)||(this.waitTimers.has(t)&&!this.waitTimers.get(t).ready)){this._armSourceWait(t);held.add(t);continue;}
                if(t.status!==t.constructor.STATUS_RUNNING)continue;
                rt.redrawRequested=false;
                rt.sequencer.activeThread=t;rt.sequencer.stepThread(t);rt.sequencer.activeThread=null;this._rememberGraphics(t);
                this._armSourceWait(t);
                if(!this._waitingTimer(t)&&(t.status===t.constructor.STATUS_YIELD_TICK||this._loopTickYield(t)))this.tickYields.set(t,{time:this.ext._programMillis(),block:t.peekStack()});
                if(t.status===t.constructor.STATUS_YIELD_TICK||this._waitingTimer(t)||(this.waitTimers.has(t)&&!this.waitTimers.get(t).ready)||
                    this._loopTickYield(t))held.add(t);
            }
            this._pump();
            // Flush ready Promise continuations. Unresolved API promises remain
            // blocked, and authored future timers are not retried in this phase.
            await browserTurn();
            if(this.phaseContext?.exhausted || this.workNow()>=deadline)return false;
            if(!rt.threads.some(t=>this._live(t)&&this._eligible(t)&&!held.has(t)&&!this._waitingTimer(t)&&t.status===t.constructor.STATUS_RUNNING))return true;
        }
        return false;
    }
    async step(delta) {
        if(this.disposed)throw Error('Arcade phase driver disposed');
        if(this.active)throw Error('Overlapping Arcade phase turn');
        const rt=this.runtime,ext=this.ext,generation=this.generation;
        const oldStepTime=rt.currentStepTime;
        const interval=Number(rt.currentStepTime) || (rt.compatibilityMode ?
            rt.constructor.THREAD_STEP_INTERVAL_COMPATIBILITY : rt.constructor.THREAD_STEP_INTERVAL);
        const budget=this.budgetMs===undefined ? interval*0.75 : this.budgetMs;
        if(!Number.isFinite(budget)||budget<=0)throw Error('Arcade phase work budget must be finite and positive');
        const deadline=this.workNow()+budget;
        rt.updateCurrentMSecs();
        const originalOrder=[...rt.threads],prior=this.pending,held=prior?.held || new Set();
        this.graphicsLoops=prior?.graphicsLoops || new Map();
        this.active=true;
        // Clear only yields inherited from the previous physical turn. Newly
        // consumed tick yields stay held across the pre/post-frame phases.
        const timedScenes=this.ext._sourceSceneTimers() && this.ext._sceneFrameHost?.active;
        for(const t of originalOrder){if(timedScenes&&this._eligible(t)&&this.tickYields.get(t)?.block===t.peekStack())held.add(t);
            if(!prior && t.status===t.constructor.STATUS_YIELD_TICK){if(timedScenes&&this._eligible(t))held.add(t);else t.status=t.constructor.STATUS_RUNNING;}}
        const parked=new Map(),cancelledParked=new Map();
        const park=()=>{for(const t of held)if(this._live(t)&&t.status!==t.constructor.STATUS_PROMISE_WAIT){parked.set(t,t.status);t.status=t.constructor.STATUS_PROMISE_WAIT;}};
        const unpark=()=>{for(const [t,status]of parked)if(!t.isKilled&&this.generation===generation&&t.status===t.constructor.STATUS_PROMISE_WAIT)t.status=status;parked.clear();};
        const actualStepThread=rt.sequencer.stepThread;
        const context={deadline,held,exhausted:false};this.phaseContext=context;
        const sourceStep=t=>{if(this.generation!==generation||this.disposed){
            if(this._live(t)&&t.status!==t.constructor.STATUS_PROMISE_WAIT){cancelledParked.set(t,t.status);t.status=t.constructor.STATUS_PROMISE_WAIT;}
            return;
        }
        const sourceBefore=this._eligible(t);
        if(sourceBefore && this.conditionWaits.parked(t))return;
        if(sourceBefore)this.conditionWaits.beforeStep(t);
        if(sourceBefore && (held.has(t)||this._waitingTimer(t)||(this.waitTimers.has(t)&&!this.waitTimers.get(t).ready))){held.add(t);park();return;}
        if(sourceBefore && this.workNow()>=deadline){
            context.exhausted=true;
            if(this._live(t)&&t.status!==t.constructor.STATUS_PROMISE_WAIT){parked.set(t,t.status);t.status=t.constructor.STATUS_PROMISE_WAIT;}
            return;
        }
        actualStepThread.call(rt.sequencer,t);this._rememberGraphics(t);if(this._eligible(t)){this._armSourceWait(t);
            if(!this._waitingTimer(t)&&(t.status===t.constructor.STATUS_YIELD_TICK||this._loopTickYield(t)))this.tickYields.set(t,{time:this.ext._programMillis(),block:t.peekStack()});}
        if((sourceBefore||this._eligible(t)) && (t.status===t.constructor.STATUS_YIELD_TICK||this._waitingTimer(t)||(this.waitTimers.has(t)&&!this.waitTimers.get(t).ready)||this._loopTickYield(t))){held.add(t);park();}
        };
        const gate=()=>park();
        try {
            rt.sequencer.stepThread=sourceStep;
            const ready=await this._work(held,deadline,generation);
            if(this.generation!==generation||this.disposed)return {cancelled:true};
            if(!ready){this.pending={held,generation,graphicsLoops:this.graphicsLoops,phase:prior?.phase || 'before',delta:prior?.delta ?? delta};this.notes.push('work budget exhausted before pending phase');return {exhausted:true,phase:this.pending.phase};}
            park();
            if(prior?.phase!=='after'){
            rt.sequencer.stepThread=sourceStep;
            rt.on('ARCADE_FRAME',gate);
            // The ordinary runtime still supplies its frame event and executes
            // new queued frame fibers. Cap this pass to the remaining budget.
            rt.currentStepTime=Math.max(0,(deadline-this.workNow())/0.75);
            rt._stepArcadeKernel(prior?.delta ?? delta);
            rt.off('ARCADE_FRAME',gate);
            unpark();
            }
            await browserTurn();
            if(this.generation!==generation||this.disposed)return {cancelled:true};
            const finished=await this._work(held,deadline,generation);
            if(this.generation!==generation||this.disposed)return {cancelled:true};
            if(!finished){this.pending={held,generation,graphicsLoops:this.graphicsLoops,phase:'after',delta};this.notes.push('work budget exhausted after frame');}else this.pending=null;
            return {cancelled:this.generation!==generation,exhausted:!finished};
        } finally {
            rt.off('ARCADE_FRAME',gate);rt.sequencer.stepThread=actualStepThread;unpark();rt.currentStepTime=oldStepTime;
            for(const [t,status]of cancelledParked)if(rt.threads.includes(t)&&this._live(t)&&t.status===t.constructor.STATUS_PROMISE_WAIT)t.status=status;
            // Status parking preserves ordinary runtime membership. Never
            // reconstruct the thread list or resurrect a removed source thread.
            this.phaseContext=null;this.active=false;
        }
    }
}

module.exports=ArcadeFramePhase;
