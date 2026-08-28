/* eslint-env worker */

const ArgumentType = require('../extension-support/argument-type');
const BlockType = require('../extension-support/block-type');
const TargetType = require('../extension-support/target-type');
const Cast = require('../util/cast');
const dispatch = require('../dispatch/worker-dispatch');

class ExtensionWorker {
    constructor () {
        this.nextExtensionId = 0;
        this.initialRegistrations = [];

        dispatch.waitForConnection.then(() => {
            dispatch.call('extensions', 'allocateWorker').then(([id, extension]) => {
                this.workerId = id;
                try {
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
// Tauri bridge. The worker already has its normal network APIs.
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
