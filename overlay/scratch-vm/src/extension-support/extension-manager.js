const dispatch = require('../dispatch/central-dispatch');
const log = require('../util/log');
const maybeFormatMessage = require('../util/maybe-format-message');

const BlockType = require('./block-type');
const {pinForURL, pinStatusFor, verifyGallerySource} = require('./gallery-integrity');

// HTTP(S) URLs are candidates for the content-pinned compatibility path. Unpinned URLs are always
// sent to the extension worker; see isTrustedExtensionURL / loadExtensionURL.
const isRemoteExtensionURL = url =>
    typeof url === 'string' && /^https?:\/\//.test(url);

// These extensions are currently built into the VM repository but should not be loaded at startup.
// TODO: move these out into a separate repository?
// TODO: change extension spec so that library info, including extension ID, can be collected through static methods

const builtinExtensions = {
    planetemaths: () => require('../extensions/crispstrobe/planetemaths'),
    arrays: () => require('../extensions/crispstrobe/arrays'),
    // The pin blocks sb3-creator has always emitted for hardware projects. Without
    // this line every one of them failed to load with "Unknown extension: stc12".
    // sb3-creator's bitwise reporters (bitand/bitor/.../shiftright). Without
    // this line the id fell to the SANDBOXED loader: importScripts('bitops')
    // 404'd and the blocks were dropped (gallery sweep, 2026-08-10).
    bitops: () => require('../extensions/crispstrobe/bitops'),
    microbitplus: () => require('../extensions/crispstrobe/microbitplus'),
    arcade: () => require('../extensions/crispstrobe/arcade'),
    stc12: () => require('../extensions/crispstrobe/stc12'),
    stc12live: () => require('../extensions/crispstrobe/stc12live'),
    circuit: () => require('../extensions/crispstrobe/circuit'),
    controller: () => require('../extensions/crispstrobe/controller'),
    // Device convenience blocks: servo, motor, relay, sensors, LCD, NeoPixel.
    // 7 stubs (showdigit, setrgb, setpixel, clearmatrix, devicestate, ircode,
    // whenirreceived) are hidden from the palette; methods remain so saved
    // projects load.  NeoPixel hidden on 12T, servo/motor hidden on STC89 (no PCA).
    devices: () => require('../extensions/crispstrobe/devices'),
    brickwrightTTS: () => require('../extensions/crispstrobe/text2speech'),
    // Our own extensions, hard-bundled (permissive, offline). Kept in the gallery
    // repo too; the bundledIds dedup removes the gallery copy from the picker.
    legopoweredup: () => require('../extensions/crispstrobe/legopoweredup'),
    legoboostunified: () => require('../extensions/crispstrobe/legoboostunified'),
    wedo2unified: () => require('../extensions/crispstrobe/wedo2unified'),
    spikeprime: () => require('../extensions/crispstrobe/spikeprime'),
    spikeprimeble: () => require('../extensions/crispstrobe/spikeprimeble'),
    spikeprimeBTC: () => require('../extensions/crispstrobe/spikeprimeBTC'),
    spikeprimeBridge: () => require('../extensions/crispstrobe/spikeprimeBridge'),
    legospikeprimeBLE: () => require('../extensions/crispstrobe/legospikeprimeBLE'),
    ev3comprehensive: () => require('../extensions/crispstrobe/ev3comprehensive'),
    legoev3direct: () => require('../extensions/crispstrobe/legoev3direct'),
    ev3lms: () => require('../extensions/crispstrobe/ev3lms'),
    legonxt: () => require('../extensions/crispstrobe/legonxt'),
    ev3dev: () => require('../extensions/crispstrobe/ev3dev'),
    universalgamepad: () => require('../extensions/crispstrobe/universalgamepad'),
    csp: () => require('../extensions/crispstrobe/csp'),
    // This is an example that isn't loaded with the other core blocks,
    // but serves as a reference for loading core blocks as extensions.
    coreExample: () => require('../blocks/scratch3_core_example'),
    // These are the non-core built-in extensions.
    pen: () => require('../extensions/scratch3_pen'),
    wedo2: () => require('../extensions/scratch3_wedo2'),
    music: () => require('../extensions/scratch3_music'),
    microbit: () => require('../extensions/scratch3_microbit'),
    text2speech: () => require('../extensions/scratch3_text2speech'),
    translate: () => require('../extensions/scratch3_translate'),
    videoSensing: () => require('../extensions/scratch3_video_sensing'),
    ev3: () => require('../extensions/scratch3_ev3'),
    makeymakey: () => require('../extensions/scratch3_makeymakey'),
    boost: () => require('../extensions/scratch3_boost'),
    gdxfor: () => require('../extensions/scratch3_gdx_for')
};

/**
 * @typedef {object} ArgumentInfo - Information about an extension block argument
 * @property {ArgumentType} type - the type of value this argument can take
 * @property {*|undefined} default - the default value of this argument (default: blank)
 */

/**
 * @typedef {object} ConvertedBlockInfo - Raw extension block data paired with processed data ready for scratch-blocks
 * @property {ExtensionBlockMetadata} info - the raw block info
 * @property {object} json - the scratch-blocks JSON definition for this block
 * @property {string} xml - the scratch-blocks XML definition for this block
 */

/**
 * @typedef {object} CategoryInfo - Information about a block category
 * @property {string} id - the unique ID of this category
 * @property {string} name - the human-readable name of this category
 * @property {string|undefined} blockIconURI - optional URI for the block icon image
 * @property {string} color1 - the primary color for this category, in '#rrggbb' format
 * @property {string} color2 - the secondary color for this category, in '#rrggbb' format
 * @property {string} color3 - the tertiary color for this category, in '#rrggbb' format
 * @property {Array.<ConvertedBlockInfo>} blocks - the blocks, separators, etc. in this category
 * @property {Array.<object>} menus - the menus provided by this category
 */

/**
 * @typedef {object} PendingExtensionWorker - Information about an extension worker still initializing
 * @property {string} extensionURL - the URL of the extension to be loaded by this worker
 * @property {Function} resolve - function to call on successful worker startup
 * @property {Function} reject - function to call on failed worker startup
 */

class ExtensionManager {
    constructor (runtime) {
        /**
         * The ID number to provide to the next extension worker.
         * @type {int}
         */
        this.nextExtensionWorker = 0;

        /**
         * FIFO queue of extensions which have been requested but not yet loaded in a worker,
         * along with promise resolution functions to call once the worker is ready or failed.
         *
         * @type {Array.<PendingExtensionWorker>}
         */
        this.pendingExtensions = [];

        /**
         * Map of worker ID to workers which have been allocated but have not yet finished initialization.
         * @type {Array.<PendingExtensionWorker>}
         */
        this.pendingWorkers = [];

        /**
         * Map of loaded extension URLs/IDs (equivalent for built-in extensions) to service name.
         * @type {Map.<string,string>}
         * @private
         */
        this._loadedExtensions = new Map();

        /**
         * Keep a reference to the runtime so we can construct internal extension objects.
         * TODO: remove this in favor of extensions accessing the runtime as a service.
         * @type {Runtime}
         */
        this.runtime = runtime;

        dispatch.setService('extensions', this).catch(e => {
            log.error(`ExtensionManager was unable to register extension service: ${JSON.stringify(e)}`);
        });
    }

    /**
     * Check whether an extension is registered or is in the process of loading. This is intended to control loading or
     * adding extensions so it may return `true` before the extension is ready to be used. Use the promise returned by
     * `loadExtensionURL` if you need to wait until the extension is truly ready.
     * @param {string} extensionID - the ID of the extension.
     * @returns {boolean} - true if loaded, false otherwise.
     */
    isExtensionLoaded (extensionID) {
        return this._loadedExtensions.has(extensionID);
    }

    /**
     * Synchronously load an internal extension (core or non-core) by ID. This call will
     * fail if the provided id is not does not match an internal extension.
     * @param {string} extensionId - the ID of an internal extension
     */
    loadExtensionIdSync (extensionId) {
        if (!Object.prototype.hasOwnProperty.call(builtinExtensions, extensionId)) {
            log.warn(`Could not find extension ${extensionId} in the built in extensions.`);
            return;
        }

        /** @TODO dupe handling for non-builtin extensions. See commit 670e51d33580e8a2e852b3b038bb3afc282f81b9 */
        if (this.isExtensionLoaded(extensionId)) {
            const message = `Rejecting attempt to load a second extension with ID ${extensionId}`;
            log.warn(message);
            return;
        }

        const extension = builtinExtensions[extensionId]();
        const extensionInstance = new extension(this.runtime);
        const serviceName = this._registerInternalExtension(extensionInstance);
        this._loadedExtensions.set(extensionId, serviceName);
    }

    /**
     * Load an extension by URL or internal extension ID
     * @param {string} extensionURL - the URL for the extension to load OR the ID of an internal extension
     * @returns {Promise} resolved once the extension is loaded and initialized or rejected on failure
     */
    loadExtensionURL (extensionURL) {
        if (Object.prototype.hasOwnProperty.call(builtinExtensions, extensionURL)) {
            /** @TODO dupe handling for non-builtin extensions. See commit 670e51d33580e8a2e852b3b038bb3afc282f81b9 */
            if (this.isExtensionLoaded(extensionURL)) {
                const message = `Rejecting attempt to load a second extension with ID ${extensionURL}`;
                log.warn(message);
                return Promise.resolve();
            }

            const extension = builtinExtensions[extensionURL]();
            const extensionInstance = new extension(this.runtime);
            const serviceName = this._registerInternalExtension(extensionInstance);
            this._loadedExtensions.set(extensionURL, serviceName);
            return Promise.resolve();
        }

        // Brickwright: a BARE ID that is not a builtin is a missing implementation,
        // not a URL. Treating it as one spawned a sandbox worker whose
        // importScripts('<id>') 404'd as a page error on every project load
        // (id 'devices', example 53, 2026-08-10). Warn once, loudly, and skip —
        // the blocks stay dropped either way until the extension exists.
        if (!/^(https?:|data:|blob:|\.|\/)/.test(extensionURL)) {
            log.warn(`Unknown extension id "${extensionURL}" — no builtin and not a URL; skipping.`);
            return Promise.resolve();
        }

        // Only exact, content-pinned gallery URLs retain the in-process compatibility adapter.
        // Everything else — including a new file on the same Pages host — is imported by the VM's
        // worker and therefore cannot see the DOM or Tauri IPC. Hostname and a confirm dialog are
        // not isolation boundaries.
        if (isRemoteExtensionURL(extensionURL) && pinForURL(extensionURL)) {
            return this._loadTrustedRemoteExtension(extensionURL);
        }

        return this._loadSandboxedExtension(extensionURL);
    }

    /**
     * Load an unpinned extension in the Scratch VM worker.
     * @param {string} extensionURL - URL imported inside the worker
     * @returns {Promise} resolved once the worker has registered its extension
     */
    _loadSandboxedExtension (extensionURL) {
        return new Promise((resolve, reject) => {
            // If we `require` this at the global level it breaks non-webpack targets, including tests
            const worker = new Worker('./extension-worker.js');

            this.pendingExtensions.push({extensionURL, resolve, reject});
            dispatch.addWorker(worker);
        });
    }

    /**
     * Whether a URL names exact reviewed gallery content (loads without a user prompt). A hostname
     * alone is not trust: new entries and URL variants use the custom-URL path; changed pinned bytes
     * are refused after fetch and before evaluation.
     * @param {string} extensionURL - candidate URL
     * @returns {boolean} true only for an exact URL in the shipped pin map
     */
    isTrustedExtensionURL (extensionURL) {
        return Boolean(pinForURL(extensionURL));
    }

    /**
     * Why a URL is or is not trusted, for the UI to word its warning with.
     * @param {string} extensionURL - candidate URL
     * @returns {string} 'pinned', 'unpinned' (a plain gallery URL we have no pin for) or 'foreign'
     */
    pinStatusFor (extensionURL) {
        return pinStatusFor(extensionURL);
    }

    /**
     * Fetch content-pinned gallery source and load it unsandboxed via the compatibility adapter.
     * @param {string} extensionURL - an https URL to the extension's .js source
     * @returns {Promise} resolved once the extension is registered
     */
    _loadTrustedRemoteExtension (extensionURL) {
        if (this.isExtensionLoaded(extensionURL)) {
            log.warn(`Rejecting attempt to load a second extension with URL ${extensionURL}`);
            return Promise.resolve();
        }
        // require lazily so non-webpack/test targets that never hit this branch don't need it
        const makeCrispExtension = require('../extensions/crispstrobe/adapter');
        return fetch(extensionURL)
            .then(res => {
                if (!res.ok) throw new Error(`HTTP ${res.status} loading ${extensionURL}`);
                return res.arrayBuffer();
            })
            .then(async bytes => {
                await verifyGallerySource(extensionURL, bytes);
                const source = new TextDecoder('utf-8', {fatal: true}).decode(bytes);
                const Extension = makeCrispExtension(source);
                const extensionInstance = new Extension(this.runtime);
                const serviceName = this._registerInternalExtension(extensionInstance);
                // Key by both the URL (what the library UI checks) and the extension's own id.
                this._loadedExtensions.set(extensionURL, serviceName);
                const info = extensionInstance.getInfo && extensionInstance.getInfo();
                if (info && info.id) this._loadedExtensions.set(info.id, serviceName);
            });
    }

    /**
     * Regenerate blockinfo for any loaded extensions
     * @returns {Promise} resolved once all the extensions have been reinitialized
     */
    refreshBlocks () {
        // Deduplicate: an extension loaded by URL is keyed by both URL and ID,
        // so iterating values() would call getInfo twice for the same service.
        const allPromises = Array.from(new Set(this._loadedExtensions.values())).map(serviceName =>
            dispatch.call(serviceName, 'getInfo')
                .then(info => {
                    info = this._prepareExtensionInfo(serviceName, info);
                    dispatch.call('runtime', '_refreshExtensionPrimitives', info);
                })
                .catch(e => {
                    log.error(`Failed to refresh built-in extension primitives: ${JSON.stringify(e)}`);
                })
        );
        return Promise.all(allPromises);
    }

    allocateWorker () {
        const id = this.nextExtensionWorker++;
        const workerInfo = this.pendingExtensions.shift();
        this.pendingWorkers[id] = workerInfo;
        return [id, workerInfo.extensionURL];
    }

    /**
     * Synchronously collect extension metadata from the specified service and begin the extension registration process.
     * @param {string} serviceName - the name of the service hosting the extension.
     */
    registerExtensionServiceSync (serviceName) {
        const info = dispatch.callSync(serviceName, 'getInfo');
        this._registerExtensionInfo(serviceName, info);
    }

    /**
     * Collect extension metadata from the specified service and begin the extension registration process.
     * @param {string} serviceName - the name of the service hosting the extension.
     */
    registerExtensionService (serviceName) {
        dispatch.call(serviceName, 'getInfo').then(info => {
            this._registerExtensionInfo(serviceName, info);
        });
    }

    /**
     * Called by an extension worker to indicate that the worker has finished initialization.
     * @param {int} id - the worker ID.
     * @param {*?} e - the error encountered during initialization, if any.
     */
    onWorkerInit (id, e) {
        const workerInfo = this.pendingWorkers[id];
        delete this.pendingWorkers[id];
        if (e) {
            workerInfo.reject(e);
        } else {
            workerInfo.resolve(id);
        }
    }

    /**
     * Register an internal (non-Worker) extension object
     * @param {object} extensionObject - the extension object to register
     * @returns {string} The name of the registered extension service
     */
    _registerInternalExtension (extensionObject) {
        const extensionInfo = extensionObject.getInfo();
        const fakeWorkerId = this.nextExtensionWorker++;
        const serviceName = `extension_${fakeWorkerId}_${extensionInfo.id}`;
        dispatch.setServiceSync(serviceName, extensionObject);
        dispatch.callSync('extensions', 'registerExtensionServiceSync', serviceName);
        return serviceName;
    }

    /**
     * Sanitize extension info then register its primitives with the VM.
     * @param {string} serviceName - the name of the service hosting the extension
     * @param {ExtensionInfo} extensionInfo - the extension's metadata
     * @private
     */
    _registerExtensionInfo (serviceName, extensionInfo) {
        extensionInfo = this._prepareExtensionInfo(serviceName, extensionInfo);
        dispatch.call('runtime', '_registerExtensionPrimitives', extensionInfo).catch(e => {
            log.error(`Failed to register primitives for extension on service ${serviceName}:`, e);
        });
    }

    /**
     * Modify the provided text as necessary to ensure that it may be used as an attribute value in valid XML.
     * @param {string} text - the text to be sanitized
     * @returns {string} - the sanitized text
     * @private
     */
    _sanitizeID (text) {
        return text.toString().replace(/[<"&]/, '_');
    }

    /**
     * Apply minor cleanup and defaults for optional extension fields.
     * TODO: make the ID unique in cases where two copies of the same extension are loaded.
     * @param {string} serviceName - the name of the service hosting this extension block
     * @param {ExtensionInfo} extensionInfo - the extension info to be sanitized
     * @returns {ExtensionInfo} - a new extension info object with cleaned-up values
     * @private
     */
    _prepareExtensionInfo (serviceName, extensionInfo) {
        extensionInfo = Object.assign({}, extensionInfo);
        if (!/^[a-z0-9]+$/i.test(extensionInfo.id)) {
            throw new Error('Invalid extension id');
        }
        extensionInfo.name = extensionInfo.name || extensionInfo.id;
        extensionInfo.blocks = extensionInfo.blocks || [];
        extensionInfo.targetTypes = extensionInfo.targetTypes || [];
        extensionInfo.blocks = extensionInfo.blocks.reduce((results, blockInfo) => {
            try {
                let result;
                switch (blockInfo) {
                case '---': // separator
                    result = '---';
                    break;
                default: // an ExtensionBlockMetadata object
                    result = this._prepareBlockInfo(serviceName, blockInfo);
                    break;
                }
                results.push(result);
            } catch (e) {
                // TODO: more meaningful error reporting
                log.error(`Error processing block: ${e.message}, Block:\n${JSON.stringify(blockInfo)}`);
            }
            return results;
        }, []);
        extensionInfo.menus = extensionInfo.menus || {};
        extensionInfo.menus = this._prepareMenuInfo(serviceName, extensionInfo.menus);
        return extensionInfo;
    }

    /**
     * Prepare extension menus. e.g. setup binding for dynamic menu functions.
     * @param {string} serviceName - the name of the service hosting this extension block
     * @param {Array.<MenuInfo>} menus - the menu defined by the extension.
     * @returns {Array.<MenuInfo>} - a menuInfo object with all preprocessing done.
     * @private
     */
    _prepareMenuInfo (serviceName, menus) {
        const menuNames = Object.getOwnPropertyNames(menus);
        for (let i = 0; i < menuNames.length; i++) {
            const menuName = menuNames[i];
            let menuInfo = menus[menuName];

            // If the menu description is in short form (items only) then normalize it to general form: an object with
            // its items listed in an `items` property.
            if (!menuInfo.items) {
                menuInfo = {
                    items: menuInfo
                };
                menus[menuName] = menuInfo;
            }
            // If `items` is a string, it should be the name of a function in the extension object. Calling the
            // function should return an array of items to populate the menu when it is opened.
            if (typeof menuInfo.items === 'string') {
                const menuItemFunctionName = menuInfo.items;
                const serviceObject = dispatch.services[serviceName];
                // Bind the function here so we can pass a simple item generation function to Scratch Blocks later.
                menuInfo.items = this._getExtensionMenuItems.bind(this, serviceObject, menuItemFunctionName);
            }
        }
        return menus;
    }

    /**
     * Fetch the items for a particular extension menu, providing the target ID for context.
     * @param {object} extensionObject - the extension object providing the menu.
     * @param {string} menuItemFunctionName - the name of the menu function to call.
     * @returns {Array} menu items ready for scratch-blocks.
     * @private
     */
    _getExtensionMenuItems (extensionObject, menuItemFunctionName) {
        // Fetch the items appropriate for the target currently being edited. This assumes that menus only
        // collect items when opened by the user while editing a particular target.
        const editingTarget = this.runtime.getEditingTarget() || this.runtime.getTargetForStage();
        const editingTargetID = editingTarget ? editingTarget.id : null;
        const extensionMessageContext = this.runtime.makeMessageContextForTarget(editingTarget);

        // TODO: Fix this to use dispatch.call when extensions are running in workers.
        const menuFunc = extensionObject[menuItemFunctionName];
        const menuItems = menuFunc.call(extensionObject, editingTargetID).map(
            item => {
                item = maybeFormatMessage(item, extensionMessageContext);
                switch (typeof item) {
                case 'object':
                    return [
                        maybeFormatMessage(item.text, extensionMessageContext),
                        item.value
                    ];
                case 'string':
                    return [item, item];
                default:
                    return item;
                }
            });

        if (!menuItems || menuItems.length < 1) {
            throw new Error(`Extension menu returned no items: ${menuItemFunctionName}`);
        }
        return menuItems;
    }

    /**
     * Apply defaults for optional block fields.
     * @param {string} serviceName - the name of the service hosting this extension block
     * @param {ExtensionBlockMetadata} blockInfo - the block info from the extension
     * @returns {ExtensionBlockMetadata} - a new block info object which has values for all relevant optional fields.
     * @private
     */
    _prepareBlockInfo (serviceName, blockInfo) {
        blockInfo = Object.assign({}, {
            blockType: BlockType.COMMAND,
            terminal: false,
            blockAllThreads: false,
            arguments: {}
        }, blockInfo);
        blockInfo.opcode = blockInfo.opcode && this._sanitizeID(blockInfo.opcode);
        blockInfo.text = blockInfo.text || blockInfo.opcode;

        switch (blockInfo.blockType) {
        case BlockType.EVENT:
            if (blockInfo.func) {
                log.warn(`Ignoring function "${blockInfo.func}" for event block ${blockInfo.opcode}`);
            }
            break;
        case BlockType.BUTTON:
            if (blockInfo.opcode) {
                log.warn(`Ignoring opcode "${blockInfo.opcode}" for button with text: ${blockInfo.text}`);
            }
            break;
        default: {
            if (!blockInfo.opcode) {
                throw new Error('Missing opcode for block');
            }

            const funcName = blockInfo.func ? this._sanitizeID(blockInfo.func) : blockInfo.opcode;

            const getBlockInfo = blockInfo.isDynamic ?
                args => args && args.mutation && args.mutation.blockInfo :
                () => blockInfo;
            const callBlockFunc = (() => {
                if (dispatch._isRemoteService(serviceName)) {
                    return (args, util, realBlockInfo) =>
                        dispatch.call(serviceName, funcName, args, util, realBlockInfo);
                }

                // avoid promise latency if we can call direct
                const serviceObject = dispatch.services[serviceName];
                if (!serviceObject[funcName]) {
                    // The function might show up later as a dynamic property of the service object
                    log.warn(`Could not find extension block function called ${funcName}`);
                }
                return (args, util, realBlockInfo) =>
                    serviceObject[funcName](args, util, realBlockInfo);
            })();

            blockInfo.func = (args, util) => {
                const realBlockInfo = getBlockInfo(args);
                // TODO: filter args using the keys of realBlockInfo.arguments? maybe only if sandboxed?
                return callBlockFunc(args, util, realBlockInfo);
            };
            break;
        }
        }

        return blockInfo;
    }
}

module.exports = ExtensionManager;
