// Selected Microsoft PXT simulator event queue / base EventContext profile.
// Microsoft source is MIT; see control-event-source/LICENSE and INTEGRATION.md.
// Callback execution is injected: this module never retains a registration
// thread, synthesizes input, advances time, or runs a Scratch sequencer itself.
module.exports = function createControlEvents({dispatch, enqueue, paused = () => false, onError = error => {throw error;}}) {
    if (typeof dispatch !== 'function' || typeof enqueue !== 'function')throw new TypeError('Events require dispatch and continuation scheduling');
    let generation = 0, nextNotifyEvent = 1024;
    const queues = new Map();
    const contexts = new Set();
    let activeContext;
    const key = (source, value) => `${source}:${value}`;
    const queue = (source, value) => {
        const id = key(source, value);
        if (!queues.has(id))queues.set(id, {handlers: [], pending: [], waiters: [], changes: [], busy: false});
        return queues.get(id);
    };
    const change = (q, handlers) => {
        if (q.busy)q.changes.push(handlers);
        else q.handlers = handlers;
    };
    const invoke = async (wrapper, payload, epoch) => {
        // Context replacement changes the wrapper's field. Once a dispatch
        // starts, its actual callable/registration is held for that invocation.
        const handler = wrapper.handler;
        if (handler != null && epoch === generation)await dispatch(handler, payload);
    };
    const drain = async (q, epoch) => {
        q.busy = true;
        try {
            while (q.pending.length && epoch === generation) {
                const events = q.pending;
                q.pending = [];
                for (const payload of events)for (const handler of q.handlers) {
                    if (epoch !== generation)return;
                    await invoke(handler, payload, epoch);
                }
            }
        } finally {
            if (epoch === generation) {
                q.busy = false;
                for (const handlers of q.changes)q.handlers = handlers;
                q.changes = [];
            }
        }
    };
    const push = async (q, payload, epoch, notifyOne = false) => {
        if (epoch !== generation)return;
        const waiters = notifyOne ? q.waiters.splice(0, 1) : q.waiters;
        if (!notifyOne)q.waiters = [];
        // Waiters are notified before testing whether this queue has handlers.
        for (const waiter of waiters)waiter.resolve(payload);
        if (waiters.length)await Promise.resolve();
        if (epoch !== generation)return;
        // The selected SDK uses >5, not >=5, before adding a pending event.
        if (!q.handlers.length || q.pending.length > 5)return;
        q.pending.push(payload);
        if (!q.busy)await drain(q, epoch);
    };
    const matching = (source, value) => {
        const result = [queues.get(key(0, 0))];
        if (value)result.push(queues.get(key(0, value)));
        if (source)result.push(queues.get(key(source, 0)));
        if (source && value)result.push(queues.get(key(source, value)));
        return result;
    };
    const listen = (source, value, wrapper) => change(queue(source, value), [wrapper]);
    const register = (source, value, handler, flags = 16) => {
        if (handler == null)throw new TypeError('Event registration requires a callable');
        if (!activeContext) {listen(source, value, {handler, flags});return;}
        const id = key(source, value);
        const old = activeContext.handlers.get(id);
        if (old) {old.handler = handler;old.flags = flags;}
        else {
            const wrapper = {source, value, handler, flags};
            activeContext.handlers.set(id, wrapper);
            listen(source, value, wrapper);
        }
    };
    return {
        register,
        allocate() {return nextNotifyEvent++;},
        registerInternal(source, value, handler) {listen(source, value, {handler});},
        registerContext(context, source, value, handler, flags = 16) {
            if (!contexts.has(context))throw new TypeError('Foreign event context');
            const id = key(source, value), old = context.handlers.get(id);
            if (old) {old.handler = handler;old.flags = flags;}
            else {
                const wrapper = {source, value, handler, flags};context.handlers.set(id, wrapper);
                if (context === activeContext)listen(source, value, wrapper);
            }
        },
        // Enqueue rather than await: a source raise returns before its callback.
        raise(source, value, payload = null) {
            if (paused())return;
            const notifyOne = source === 1022;
            if (notifyOne)source = 1023;
            const epoch = generation, targets = matching(source, value);
            enqueue(async () => {
                try {for (const target of targets) {if (epoch !== generation)return;if (target)await push(target, payload, epoch, notifyOne);else await Promise.resolve();}}
                catch (error) {if (epoch === generation)onError(error);}
            });
        },
        wait(source, value) {
            const q = queue(source, value), epoch = generation;
            return new Promise(resolve => q.waiters.push({resolve: payload => {if (epoch === generation)resolve(payload);}, cancel: () => resolve(undefined)}));
        },
        createContext() {const context = {handlers: new Map()};contexts.add(context);return context;},
        activate(context) {
            if (context != null && !contexts.has(context))throw new TypeError('Foreign event context');
            if (context === activeContext)return;
            if (activeContext)for (const handler of activeContext.handlers.values())listen(handler.source, handler.value, {handler: null});
            activeContext = context;
            if (context)for (const handler of context.handlers.values())listen(handler.source, handler.value, handler);
        },
        cancel() {
            generation++;nextNotifyEvent = 1024;
            // Wait promises must settle on Stop/load so they do not retain old
            // fibers. Their generation guard keeps authored continuation inert.
            for (const q of queues.values())for (const waiter of q.waiters)waiter.cancel();
            queues.clear();contexts.clear();activeContext = undefined;
        }
    };
};
