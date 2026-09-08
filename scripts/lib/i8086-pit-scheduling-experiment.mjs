// Scoped, benchmark-only batching. The scope must run an owned machine loop;
// arbitrary host reads of public counter fields inside the scope are NOT safe.
// This is why this experiment is not automatically installed in production.
export function createPitSchedulingExperiment(machine) {
    const list = machine._buildAdvanceList();
    const pits = [], cards = [];
    for (let i = 0; i < list.length; i += 2) {
        const device = list[i];
        if (list[i + 1] === 1 && device.counters?.length === 3) pits.push(device);
        else if (list[i + 1] === 0 && device.constructor.name === 'CGACard') cards.push(device);
        else throw new Error('PIT scheduling experiment refuses an unknown advancing device');
    }
    if (pits.length !== 1) throw new Error('PIT scheduling experiment requires one PIT');
    const pit = pits[0];
    const stats = {deferredCalls:0,flushes:0};
    return {stats, run(fn) {
        let pending = 0;
        const advanceMs = pit.advanceMs, advance = pit.advance;
        const restore = [];
        const flush = () => {
            if (!pending) return;
            const ticks = pending; pending = 0; stats.flushes++;
            advance.call(pit,ticks);
        };
        const barrier = (object,name) => {
            if (typeof object[name] !== 'function') return;
            const own = Object.hasOwn(object,name), original = object[name];
            object[name] = function(...args) { flush(); return original.apply(this,args); };
            restore.push(() => { if (own) object[name] = original; else delete object[name]; });
        };
        // Keep exactly the original per-instruction fractional arithmetic.
        // Only binary channel-0 square-wave countdown is deferred. Before an
        // edge, materialize old debt, then process the current call separately.
        pit.advanceMs = function(ms) {
            const exact = ms * this.clockHz / 1000 + this._frac;
            const whole = Math.floor(exact);
            this._frac = exact - whole;
            if (whole <= 0) return;
            const [c,a,b] = this.counters;
            if (a.nullCount && b.nullCount && !c.nullCount && c.mode === 3 && !c.bcd && c.gate &&
                pending + whole < Math.ceil(c.ce / 2) && !machine.hooks.onInstruction) {
                pending += whole; stats.deferredCalls++;
            } else { flush(); advance.call(this,whole); }
        };
        for (const name of ['read','write','getState','setState']) barrier(pit,name);
        for (const counter of pit.counters) for (const name of ['setGate','read','writeData','writeControl','latchCount','latchStatus','getState','setState']) barrier(counter,name);
        // CGA still advances at every instruction. Only its observation
        // callback needs to materialize PIT time before entering host code.
        for (const card of cards) barrier(card.hooks,'onVSync');
        for (const name of ['_in','_out','_serviceInterrupts','saveState']) barrier(machine,name);
        // Interrupt polling must not flush every instruction when no IRQ/NMI
        // is pending. Restore that particular wrapper with a conditional one.
        const originalService = machine._serviceInterrupts;
        const serviceWithoutBarrier = Object.getPrototypeOf(machine)._serviceInterrupts;
        machine._serviceInterrupts = function() {
            if (this._nmiPending || this._pic?.intActive) return originalService.call(this);
            return serviceWithoutBarrier.call(this);
        };
        barrier(machine.cpu,'onInterrupt');
        try { return fn(); }
        finally {
            flush(); pit.advanceMs = advanceMs;
            for (let i = restore.length - 1; i >= 0; i--) restore[i]();
        }
    }};
}
