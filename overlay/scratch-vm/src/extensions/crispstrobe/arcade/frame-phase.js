// Native Arcade source phases use the actual VM executor and one cooperative
// deadline. Plain Scratch projects retain the synchronous kernel path.
// Program and scene clocks remain owned by their existing runtime services.
function browserTurn() {
    return new Promise(resolve => {
        if(typeof MessageChannel !== 'function') {setTimeout(resolve,0);return;}
        const channel=new MessageChannel();
        channel.port1.onmessage=()=>{channel.port1.close();channel.port2.close();resolve();};
        channel.port2.postMessage(null);
    });
}
class ArcadeFramePhase {
    constructor(runtime,ext,{workNow=()=>performance.now(),budgetMs}={}) {
        this.runtime=runtime;this.ext=ext;this.workNow=workNow;this.budgetMs=budgetMs;
        this.generation=0;this.disposed=false;this.active=false;this.notes=[];this.pending=null;
        this.sourceAuthority=new WeakMap();this.managedLinks=new WeakMap();this.phaseContext=null;
        this.nativeCallbackOpcodes=new Set(ext.getInfo().blocks.filter(b=>b.blockType==='hat').map(b=>'arcade_'+b.opcode));
        this.cancel=()=>{this.generation++;this.pending=null;this.queuedDelta=null;};
        this.dispose=()=>{this.disposed=true;this.cancel();};
        for(const event of ['PROJECT_START','PROJECT_STOP_ALL','PROJECT_LOADED'])runtime.on(event,this.cancel);
        runtime.on('RUNTIME_DISPOSED',this.dispose);
    }
    detach() {
        for(const event of ['PROJECT_START','PROJECT_STOP_ALL','PROJECT_LOADED'])this.runtime.off(event,this.cancel);
        this.runtime.off('RUNTIME_DISPOSED',this.dispose);
        this.dispose();
    }
    linkManagedCall(thread,caller) {
        if(caller)this.managedLinks.set(thread,{caller,generation:this.generation});
    }
    hasSourceProject() {
        if(this.disposed)return false;
        return this.runtime.targets.some(target=>Object.values(target.blocks?._blocks || {}).some(block=>
            block.opcode==='arcade_sourceWhile'||block.opcode==='arcade_whenSourceStarts'||this.nativeCallbackOpcodes.has(block.opcode)));
    }
    requestStep(delta) {
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
    _pump() {this.ext._pumpFunctionCalls();this.ext._pumpCreationWaits();this.ext._pumpTerrainWaits();}
    async _work(held,deadline,generation) {
        const rt=this.runtime;
        while(this.generation===generation&&!this.disposed) {
            if(this.workNow()>=deadline)return false;
            this._pump();
            for(const t of [...rt.threads]) {
                if(this.workNow()>=deadline)return false;
                if(!this._live(t)||held.has(t)||!this._eligible(t))continue;
                if(this._waitingTimer(t)){held.add(t);continue;}
                if(t.status!==t.constructor.STATUS_RUNNING)continue;
                rt.redrawRequested=false;
                rt.sequencer.activeThread=t;rt.sequencer.stepThread(t);rt.sequencer.activeThread=null;this._rememberGraphics(t);
                if(t.status===t.constructor.STATUS_YIELD_TICK||this._waitingTimer(t)||
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
        for(const t of originalOrder)if(!prior && t.status===t.constructor.STATUS_YIELD_TICK)t.status=t.constructor.STATUS_RUNNING;
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
        if(sourceBefore && (held.has(t)||this._waitingTimer(t))){held.add(t);park();return;}
        if(sourceBefore && this.workNow()>=deadline){
            context.exhausted=true;
            if(this._live(t)&&t.status!==t.constructor.STATUS_PROMISE_WAIT){parked.set(t,t.status);t.status=t.constructor.STATUS_PROMISE_WAIT;}
            return;
        }
        actualStepThread.call(rt.sequencer,t);this._rememberGraphics(t);
        if((sourceBefore||this._eligible(t)) && (t.status===t.constructor.STATUS_YIELD_TICK||this._waitingTimer(t)||this._loopTickYield(t))){held.add(t);park();}
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
