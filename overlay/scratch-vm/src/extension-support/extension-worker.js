/* eslint-env worker */

const ArgumentType = require('../extension-support/argument-type');
const BlockType = require('../extension-support/block-type');
const TargetType = require('../extension-support/target-type');
const Cast = require('../util/cast');
const dispatch = require('../dispatch/worker-dispatch');

// Network fetch/import is part of the documented sandbox contract, but WebSocket would let
// downloaded code dial Brickwright's native Scratch-Link service on 127.0.0.1:20111 (or a legacy
// desktop Scratch Link on 20110) and regain Bluetooth without the dispatch broker. There is no
// caller identity on that socket, so remove the constructor at its actual prototype owner before
// importing remote code. Patching only `global.WebSocket` would be bypassable through the global's
// prototype chain.
const blockWebSockets = () => {
    if (typeof global.WebSocket !== 'function') return;
    let owner = global;
    while (owner && !Object.prototype.hasOwnProperty.call(owner, 'WebSocket')) {
        owner = Object.getPrototypeOf(owner);
    }
    if (!owner) throw new Error('Could not locate the worker WebSocket constructor');
    const BlockedWebSocket = function WebSocket () {
        throw new Error('WebSocket is unavailable in sandboxed extensions');
    };
    for (const state of ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED']) {
        Object.defineProperty(BlockedWebSocket, state, {value: global.WebSocket[state]});
    }
    Object.defineProperty(owner, 'WebSocket', {
        value: BlockedWebSocket,
        configurable: false,
        writable: false
    });
    if (global.WebSocket !== BlockedWebSocket) {
        throw new Error('Could not lock the worker WebSocket constructor');
    }
};

class ExtensionWorker {
    constructor () {
        this.nextExtensionId = 0;
        this.initialRegistrations = [];

        dispatch.waitForConnection.then(() => {
            dispatch.call('extensions', 'allocateWorker').then(([id, extension]) => {
                this.workerId = id;
                try {
                    blockWebSockets();
                    importScripts(extension);
                    const initialRegistrations = this.initialRegistrations;
                    this.initialRegistrations = null;
                    Promise.all(initialRegistrations)
                        .then(() => dispatch.call('extensions', 'onWorkerInit', id));
                } catch (e) {
                    dispatch.call('extensions', 'onWorkerInit', id, e);
                }
            });
        });

        this.extensions = [];
    }

    register (extensionObject) {
        const extensionId = this.nextExtensionId++;
        this.extensions.push(extensionObject);
        const serviceName = `extension.${this.workerId}.${extensionId}`;
        const promise = dispatch.setService(serviceName, extensionObject)
            .then(() => dispatch.call('extensions', 'registerExtensionService', serviceName));
        if (this.initialRegistrations) this.initialRegistrations.push(promise);
        return promise;
    }
}

const translate = Object.assign(
    message => (message && typeof message === 'object' ? (message.default || '') : message),
    {setup: () => {}}
);
const extensionWorker = new ExtensionWorker();

// Deliberately small. These values support ordinary sandbox-compatible
// TurboWarp/Scratch extensions without granting the editor runtime, DOM, or
// Tauri bridge. HTTP(S) fetch/import remains available; raw WebSockets do not,
// because the app's native Scratch-Link bridge itself is a loopback socket.
global.Scratch = {
    ArgumentType,
    BlockType,
    TargetType,
    Cast,
    translate,
    fetch: (...args) => fetch(...args),
    extensions: {
        register: extensionWorker.register.bind(extensionWorker),
        unsandboxed: false,
        isPenguinMod: false
    }
};
