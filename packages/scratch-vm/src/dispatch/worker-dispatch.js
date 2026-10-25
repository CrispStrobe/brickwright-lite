const SharedDispatch = require('./shared-dispatch');

const log = require('../util/log');

// Capture the transport before downloaded source runs. The public worker
// messaging globals are removed before evaluation, while this closure retains
// the only channel which can emit or receive broker protocol frames.
const workerGlobal = typeof self === 'undefined' ? null : self;
const sendToHost = workerGlobal && workerGlobal.postMessage.bind(workerGlobal);
const listenToHost = workerGlobal && workerGlobal.addEventListener.bind(workerGlobal);
const closeWorker = workerGlobal && workerGlobal.close.bind(workerGlobal);
const hostTransport = sendToHost ? Object.freeze({postMessage: sendToHost}) : null;

class WorkerDispatch extends SharedDispatch {
    constructor () {
        super();
        this._connectionPromise = new Promise(resolve => {
            this._onConnect = resolve;
        });
        this._bootstrapHandler = null;
        this._bootstrapped = false;
        this._nextCapabilityRequestId = 0;
        this.services = {};
        this._onMessage = this._onMessage.bind(this, hostTransport);
        if (listenToHost) listenToHost('message', this._onMessage);
    }

    get waitForConnection () {
        return this._connectionPromise;
    }

    setBootstrapHandler (handler) {
        if (this._bootstrapHandler) throw new Error('Extension bootstrap handler is already installed');
        this._bootstrapHandler = handler;
    }

    lockSourceMessaging () {
        if (!workerGlobal) return;
        for (const name of ['postMessage', 'onmessage', 'addEventListener', 'removeEventListener']) {
            Object.defineProperty(workerGlobal, name, {
                value: undefined,
                configurable: false,
                writable: false
            });
        }
    }

    requestCapability (operation, args) {
        return this.waitForConnection.then(hostBound => {
            if (!hostBound) throw new Error('Capabilities require a verified gallery worker');
            const envelope = Object.freeze({
                protocol: 1,
                requestId: this._nextCapabilityRequestId++,
                operation,
                args
            });
            return this._remoteCall(hostTransport, 'capabilityBroker', 'request', envelope);
        });
    }

    setExtensionService (workerId, extensionId, provider) {
        if (!Number.isInteger(workerId) || !Number.isInteger(extensionId) || extensionId < 0) {
            return Promise.reject(new Error('Invalid extension service identity'));
        }
        const service = `extension.${workerId}.${extensionId}`;
        if (Object.prototype.hasOwnProperty.call(this.services, service)) {
            log.warn(`Worker dispatch replacing existing service provider for ${service}`);
        }
        this.services[service] = provider;
        // The host derives the public namespace from its WeakMap identity. The frame carries no
        // worker ID or service name which downloaded code could use as an authority claim.
        return this.waitForConnection.then(() => this._remoteCall(hostTransport, 'dispatch', 'setService', extensionId));
    }

    setService (service, provider) {
        if (Object.prototype.hasOwnProperty.call(this.services, service)) {
            log.warn(`Worker dispatch replacing existing service provider for ${service}`);
        }
        this.services[service] = provider;
        return this.waitForConnection.then(() => this._remoteCall(hostTransport, 'dispatch', 'setService', service));
    }

    _getServiceProvider (service) {
        const provider = this.services[service];
        return {provider: provider || hostTransport, isRemote: !provider};
    }

    _onDispatchMessage (worker, message) {
        switch (message.method) {
        case 'handshake':
            return Promise.resolve(this._onConnect(Boolean(message.args[0])));
        case 'bootstrap':
            if (this._bootstrapped || !this._bootstrapHandler) {
                return Promise.reject(new Error('Invalid extension worker bootstrap'));
            }
            this._bootstrapped = true;
            return Promise.resolve(this._bootstrapHandler(...message.args));
        case 'terminate':
            setTimeout(() => closeWorker(), 0);
            return Promise.resolve();
        default:
            log.error(`Worker dispatch received message for unknown method: ${message.method}`);
        }
    }
}

module.exports = new WorkerDispatch();
