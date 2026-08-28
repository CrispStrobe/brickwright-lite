const SharedDispatch = require('./shared-dispatch');

const log = require('../util/log');

/**
 * Main-thread broker for Scratch VM workers.
 *
 * Brickwright's extension workers import user-supplied code. Worker isolation
 * removes DOM and Tauri globals, but `postMessage` is still ambient: without
 * this policy, downloaded code could forge dispatch frames and call any method
 * on `runtime`, `gui`, or another registered service. Only the fixed extension
 * registration lifecycle is accepted from a worker.
 */
class CentralDispatch extends SharedDispatch {
    constructor () {
        super();
        this.services = {};
        this.workerClass = (typeof Worker === 'undefined' ? null : Worker);
        this.workers = [];
        this.workerState = new WeakMap();
        this.callbackWorkers = [];
    }

    callSync (service, method, ...args) {
        const {provider, isRemote} = this._getServiceProvider(service);
        if (provider) {
            if (isRemote) throw new Error(`Cannot use 'callSync' on remote provider for service ${service}.`);
            // eslint-disable-next-line prefer-spread
            return provider[method].apply(provider, args);
        }
        throw new Error(`Provider not found for service: ${service}`);
    }

    setServiceSync (service, provider) {
        if (Object.prototype.hasOwnProperty.call(this.services, service)) {
            log.warn(`Central dispatch replacing existing service provider for ${service}`);
        }
        this.services[service] = provider;
    }

    setService (service, provider) {
        try {
            this.setServiceSync(service, provider);
            return Promise.resolve();
        } catch (e) {
            return Promise.reject(e);
        }
    }

    addWorker (worker) {
        if (this.workers.indexOf(worker) === -1) {
            this.workers.push(worker);
            this.workerState.set(worker, {allocated: false, initialized: false, workerId: null});
            worker.onmessage = this._onMessage.bind(this, worker);
            this._remoteCall(worker, 'dispatch', 'handshake').catch(e => {
                log.error(`Could not handshake with worker: ${JSON.stringify(e)}`);
            });
        } else {
            log.warn('Central dispatch ignoring attempt to add duplicate worker');
        }
    }

    _getServiceProvider (service) {
        const provider = this.services[service];
        return provider && {
            provider,
            isRemote: Boolean(this.workerClass && provider instanceof this.workerClass)
        };
    }

    // SharedDispatch historically accepts a response ID from any worker. Bind
    // each outbound call to its actual destination so one downloaded extension
    // cannot guess an ID and answer a call sent to another extension.
    _remoteTransferCall (provider, service, method, transfer, ...args) {
        return new Promise((resolve, reject) => {
            const responseId = this._storeCallbacks(resolve, reject);
            this.callbackWorkers[responseId] = provider;
            // Runtime util contains functions and cannot cross structured clone. Newer VM call
            // sites append realBlockInfo after util, so the historical "last argument" test no
            // longer finds it. Remove the util wherever it occurs while preserving block info.
            // `_prepareBlockInfo` installs its main-thread wrapper as realBlockInfo.func; that
            // wrapper is transport machinery, not extension metadata, and is equally
            // non-cloneable. Copy the following block-info object without that one field.
            const utilIndex = args.findIndex(value => value && typeof value.yield === 'function');
            if (utilIndex !== -1) {
                const realBlockInfo = args[utilIndex + 1];
                args.splice(utilIndex, 1);
                if (realBlockInfo && typeof realBlockInfo === 'object' &&
                    typeof realBlockInfo.func === 'function') {
                    const cloneableBlockInfo = Object.assign({}, realBlockInfo);
                    delete cloneableBlockInfo.func;
                    args[utilIndex] = cloneableBlockInfo;
                }
            }
            const message = {service, method, responseId, args};
            try {
                if (transfer) provider.postMessage(message, transfer);
                else provider.postMessage(message);
            } catch (error) {
                // Structured-clone and terminated-worker failures happen synchronously. Do not
                // retain callbacks which can never receive a response.
                delete this.callbacks[responseId];
                delete this.callbackWorkers[responseId];
                reject(error);
            }
        });
    }

    _rejectWorkerMessage (worker, message, reason) {
        log.warn(`Blocked extension-worker dispatch frame: ${reason}`);
        if (typeof message.responseId !== 'undefined') {
            worker.postMessage({
                responseId: message.responseId,
                error: {message: `Extension worker is not allowed to ${reason}`}
            });
        }
    }

    _allowWorkerMessage (worker, message) {
        // Responses to calls the main thread sent to this worker carry no
        // service. They are required for getInfo and opcode results.
        if (!message || !message.service) return true;
        const state = this.workerState.get(worker);
        if (!state) return false;

        if (message.service === 'dispatch' && message.method === 'setService') {
            const service = message.args && message.args[0];
            const match = /^extension\.(\d+)\.(\d+)$/.exec(service);
            if (!state.allocated || state.workerId === null || !match) return false;
            const workerId = Number(match[1]);
            if (state.workerId !== workerId) return false;
            const owner = this.services[service];
            return !owner || owner === worker;
        }

        if (message.service !== 'extensions') return false;
        const args = message.args || [];
        if (message.method === 'allocateWorker') {
            if (state.allocated || state.initialized || args.length) return false;
            state.allocated = true;
            return true;
        }
        if (message.method === 'registerExtensionService') {
            return typeof args[0] === 'string' && this.services[args[0]] === worker;
        }
        if (message.method === 'onWorkerInit') {
            const id = args[0];
            if (!state.allocated || state.initialized || !Number.isInteger(id)) return false;
            if (state.workerId !== id) return false;
            state.initialized = true;
            return true;
        }
        return false;
    }

    _onMessage (worker, event) {
        const message = event && event.data;
        if (message && !message.service && typeof message.responseId !== 'undefined') {
            const expected = this.callbackWorkers[message.responseId];
            if (!expected || expected !== worker) {
                this._rejectWorkerMessage(worker, message, 'answer a call sent to another worker');
                return;
            }
            delete this.callbackWorkers[message.responseId];
        }
        if (!this._allowWorkerMessage(worker, message)) {
            this._rejectWorkerMessage(worker, message || {},
                `${message && message.service || 'unknown service'}.${message && message.method || 'unknown method'}`);
            return;
        }
        if (message.service === 'extensions' && message.method === 'allocateWorker') {
            // Bind identity from the manager-controlled allocation result, not from a service name
            // chosen later by downloaded code. The promise microtask completes before another
            // worker message can run, so the namespace is fixed before importScripts starts.
            this.call('extensions', 'allocateWorker').then(result => {
                const state = this.workerState.get(worker);
                if (!state || !Array.isArray(result) || !Number.isInteger(result[0])) {
                    throw new Error('Extension worker allocation returned an invalid worker ID');
                }
                state.workerId = result[0];
                return result;
            }).then(
                result => worker.postMessage({responseId: message.responseId, result}),
                error => worker.postMessage({responseId: message.responseId, error})
            );
            return;
        }
        super._onMessage(worker, event);
    }

    _onDispatchMessage (worker, message) {
        if (message.method === 'setService') {
            return this.setService(message.args[0], worker);
        }
        log.error(`Central dispatch received message for unknown method: ${message.method}`);
    }
}

module.exports = new CentralDispatch();
