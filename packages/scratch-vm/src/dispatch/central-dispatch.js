const SharedDispatch = require('./shared-dispatch');

const log = require('../util/log');
const {CapabilityBroker} = require('../extension-support/capability-broker');
const {createNativePlatformCapability, OPERATION: NATIVE_PLATFORM_OPERATION} =
    require('../extension-support/native-platform-capability');
const CAPABILITY_REFUSAL_CODES = new Set([
    'invalid-session', 'invalid-envelope', 'replayed-request', 'unknown-operation',
    'undeclared-operation', 'invalid-arguments', 'unavailable-operation',
    'operation-failed', 'stale-reply'
]);

const proofMetadataHandler = (args, hostRecord) => {
    if (!hostRecord.proof) throw new Error('Project metadata handler is unavailable');
    return args.field === 'locale' ? 'en' : 'capability-browser-proof';
};

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
        // This deterministic handler is reachable only by the two exact, content-pinned browser-proof
        // identities. Ordinary gallery records never carry `proof`, and there is no runtime setter.
        // `platform.kind.read` is wired only where a native boundary exists. Outside the desktop
        // app the factory returns null, the operation stays UNWIRED, and the broker refuses it as
        // `unavailable-operation` — a browser build fails closed without any branch here claiming
        // to answer for a boundary it does not have.
        const handlers = {'project.metadata.read': proofMetadataHandler};
        const internals = typeof globalThis !== 'undefined' && globalThis.__TAURI_INTERNALS__;
        const nativePlatform = createNativePlatformCapability({
            invoke: internals && typeof internals.invoke === 'function' ?
                internals.invoke.bind(internals) : null
        });
        if (nativePlatform) handlers[NATIVE_PLATFORM_OPERATION] = nativePlatform;
        this.capabilityBroker = new CapabilityBroker(handlers);
        // A read-only window onto the broker's diagnostics for the capability diagnostics panel,
        // which is deliberately import-free (it has to work when the thing being diagnosed is the
        // GUI). This exposes a READ of already-redacted data — the entry type has no field for a
        // digest, a URL, arguments or a result — never the broker itself, so nothing here can
        // declare, allow or revoke anything. Extensions cannot reach it in any case: they run in
        // workers, which do not share this realm.
        if (typeof globalThis !== 'undefined') {
            globalThis.__brickwrightCapabilityDiagnostics = () => this.capabilityBroker.diagnostics();
        }
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

    addWorker (worker, hostRecord) {
        if (this.workers.indexOf(worker) === -1) {
            if (hostRecord && (!Object.isFrozen(hostRecord) || hostRecord.protocol !== 1 ||
                !Number.isInteger(hostRecord.workerId) || typeof hostRecord.source !== 'string')) {
                throw new Error('Extension worker requires a frozen, verified host record');
            }
            // Validate and bind capability declarations before exposing the worker to dispatch.
            if (hostRecord) this.capabilityBroker.attach(worker, hostRecord);
            this.workers.push(worker);
            // Install the host-owned identity before the worker can receive a handshake or send a frame.
            // The complete verified record stays in this WeakMap; only bootstrap necessities cross realms.
            this.workerState.set(worker, {
                hostRecord: hostRecord || null,
                allocated: false,
                initialized: false,
                workerId: hostRecord ? hostRecord.workerId : null,
                extensionIds: new Set()
            });
            worker.onmessage = this._onMessage.bind(this, worker);
            const terminate = this.removeWorker.bind(this, worker);
            if (typeof worker.addEventListener === 'function') {
                worker.addEventListener('error', terminate);
                worker.addEventListener('messageerror', terminate);
            }
            this._remoteCall(worker, 'dispatch', 'handshake', Boolean(hostRecord))
                .then(() => hostRecord && this._remoteCall(worker, 'dispatch', 'bootstrap',
                    hostRecord.protocol, hostRecord.workerId, hostRecord.source))
                .catch(e => {
                    log.error(`Could not handshake with worker: ${JSON.stringify(e)}`);
                    this.removeWorker(worker, e);
                });
        } else {
            log.warn('Central dispatch ignoring attempt to add duplicate worker');
        }
    }

    removeWorker (worker, reason) {
        const state = this.workerState.get(worker);
        if (!state) return;
        this.capabilityBroker.revoke(worker);
        this.workerState.delete(worker);
        this.workers = this.workers.filter(candidate => candidate !== worker);
        for (const service of Object.keys(this.services)) {
            if (this.services[service] === worker) delete this.services[service];
        }
        for (let responseId = 0; responseId < this.callbackWorkers.length; responseId++) {
            if (this.callbackWorkers[responseId] !== worker) continue;
            const callbacks = this.callbacks[responseId];
            delete this.callbackWorkers[responseId];
            delete this.callbacks[responseId];
            if (callbacks) callbacks[1](reason || new Error('Extension worker terminated'));
        }
        if (state.hostRecord && !state.initialized) {
            this.call('extensions', 'onWorkerInit', state.workerId,
                reason || new Error('Extension worker terminated')).catch(error => {
                log.error(`Could not reject terminated extension worker: ${JSON.stringify(error)}`);
            });
        }
        if (typeof worker.terminate === 'function') worker.terminate();
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

    _postCapabilityReply (worker, responseId, result, error) {
        const reply = {responseId};
        if (error) {
            // Error's custom fields are not portable across structured clone. Send a closed plain
            // refusal record so the worker can reliably inspect the reviewed public code.
            reply.error = Object.freeze({
                name: 'CapabilityRefusal',
                code: CAPABILITY_REFUSAL_CODES.has(error.code) ? error.code : 'operation-failed',
                message: typeof error.message === 'string' ? error.message : 'Capability operation failed'
            });
        } else reply.result = result;
        try {
            worker.postMessage(reply);
        } catch (postError) {
            // A dead destination is an expected lifecycle race. A live destination, however, may
            // have exposed a result which is not structured-cloneable: refuse deterministically
            // instead of swallowing the exception and leaving its request promise unresolved.
            if (!this.workerState.has(worker)) {
                log.warn(`Dropped capability reply for terminated worker: ${postError.message}`);
                return;
            }
            const fallback = {
                responseId,
                error: {
                    name: 'CapabilityRefusal',
                    code: 'operation-failed',
                    message: 'Capability result could not cross the worker boundary'
                }
            };
            try {
                worker.postMessage(fallback);
            } catch (fallbackError) {
                this.removeWorker(worker, fallbackError);
            }
        }
    }

    _allowWorkerMessage (worker, message) {
        // Responses to calls the main thread sent to this worker carry no
        // service. They are required for getInfo and opcode results.
        if (!message || typeof message !== 'object') return false;
        if (!message.service) return Number.isInteger(message.responseId);
        const state = this.workerState.get(worker);
        if (!state) return false;
        if (!Array.isArray(message.args)) return false;

        if (message.service === 'dispatch' && message.method === 'setService') {
            if (!state.hostRecord) {
                const service = message.args && message.args[0];
                const match = /^extension\.(\d+)\.(\d+)$/.exec(service);
                if (!state.allocated || state.workerId === null || !match ||
                    state.workerId !== Number(match[1])) return false;
                const owner = this.services[service];
                return !owner || owner === worker;
            }
            const extensionId = message.args && message.args[0];
            if (!Number.isInteger(extensionId) || extensionId < 0 || state.initialized) return false;
            const service = `extension.${state.hostRecord.workerId}.${extensionId}`;
            const owner = this.services[service];
            return !owner || owner === worker;
        }

        if (message.service === 'capabilityBroker' && message.method === 'request') {
            return Boolean(state.hostRecord) && state.initialized &&
                Number.isInteger(message.responseId) && message.responseId >= 0 &&
                Array.isArray(message.args) && message.args.length === 1;
        }
        if (message.service !== 'extensions') return false;
        const args = message.args || [];
        if (!state.hostRecord && message.method === 'allocateWorker') {
            if (state.allocated || state.initialized || args.length) return false;
            state.allocated = true;
            return true;
        }
        if (message.method === 'registerExtensionService') {
            if (!state.hostRecord) return typeof args[0] === 'string' && this.services[args[0]] === worker;
            if (args.length !== 1 || !Number.isInteger(args[0]) || args[0] < 0) return false;
            const service = `extension.${state.hostRecord.workerId}.${args[0]}`;
            return state.extensionIds.has(args[0]) && this.services[service] === worker;
        }
        if (message.method === 'onWorkerInit') {
            if (!state.hostRecord) {
                const id = args[0];
                if (!state.allocated || state.initialized || !Number.isInteger(id) || state.workerId !== id) return false;
                state.initialized = true;
                return true;
            }
            if (state.initialized || args.length > 1) return false;
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
        const state = this.workerState.get(worker);
        if (message.service === 'capabilityBroker' && message.method === 'request') {
            this.capabilityBroker.request(worker, message.args[0]).then(
                result => this._postCapabilityReply(worker, message.responseId, result, null),
                error => this._postCapabilityReply(worker, message.responseId, null, error)
            );
            return;
        }
        if (!state.hostRecord && message.service === 'extensions' && message.method === 'allocateWorker') {
            this.call('extensions', 'allocateWorker').then(result => {
                if (!Array.isArray(result) || !Number.isInteger(result[0])) {
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
        if (message.service === 'dispatch' && message.method === 'setService') {
            if (!state.hostRecord) {
                super._onMessage(worker, event);
                return;
            }
            const extensionId = message.args[0];
            const service = `extension.${state.hostRecord.workerId}.${extensionId}`;
            state.extensionIds.add(extensionId);
            this.setService(service, worker).then(
                () => worker.postMessage({responseId: message.responseId, result: service}),
                error => worker.postMessage({responseId: message.responseId, error})
            );
            return;
        }
        if (message.service === 'extensions' && message.method === 'registerExtensionService') {
            if (!state.hostRecord) {
                super._onMessage(worker, event);
                return;
            }
            const service = `extension.${state.hostRecord.workerId}.${message.args[0]}`;
            this.call('extensions', 'registerExtensionService', service).then(
                result => worker.postMessage({responseId: message.responseId, result}),
                error => worker.postMessage({responseId: message.responseId, error})
            );
            return;
        }
        if (message.service === 'extensions' && message.method === 'onWorkerInit') {
            if (!state.hostRecord) {
                super._onMessage(worker, event);
                return;
            }
            this.call('extensions', 'onWorkerInit', state.hostRecord.workerId, message.args[0]).then(
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
