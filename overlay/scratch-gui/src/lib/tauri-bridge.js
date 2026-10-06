import downloadBlob from './download-blob';
import loadProjectFile from './bw-project-load';
import {setProjectTitle} from '../reducers/project-title';
import {setProjectUnchanged} from '../reducers/project-changed';

// ---------------------------------------------------------------------------------------------
// Native project documents (desktop app): Open, Save, Save As, Recent Projects.
// The Rust side (apps/tauri/src-tauri/src/fileio.rs) owns every path: the web layer can only
// ask it to open a picked or recent file and to save to the document it opened.
// ---------------------------------------------------------------------------------------------

const nativeInvoke = () => {
    const tauri = typeof window !== 'undefined' && window.__TAURI__;
    return tauri && tauri.core && typeof tauri.core.invoke === 'function' ? tauri.core.invoke : null;
};
const guiStore = () => (typeof window !== 'undefined' && window.__brickwrightStore) || null;
const REPLACE_WARNING = 'Replace the current project? Unsaved changes will be lost.';
const PROJECT_EXTENSION = /\.(?:sb[23]?|lms)$/i;

let documentsAvailable = null;
/**
 * True in the desktop app. Phones keep the web file input and the share sheet: a file
 * opened there is a sandbox copy, so there is no document to save back to.
 * @returns {Promise<boolean>} whether File menu Open/Save use native documents
 */
export const nativeDocumentsAvailable = () => {
    const invoke = nativeInvoke();
    if (!invoke) return Promise.resolve(false);
    if (!documentsAvailable) {
        documentsAvailable = Promise.resolve(invoke('is_mobile')).then(mobile => !mobile, () => false);
    }
    return documentsAvailable;
};

/**
 * A native message box that the caller can wait for. The dialog plugin replaces
 * `window.alert` with a call that returns at once, and `window.confirm` with one to a command
 * the plugin no longer has (so it resolves to a Promise, which is always truthy). Both go
 * through `plugin:dialog|message`, the one dialog command the editor's capability grants.
 * @param {string} message text to show
 * @param {boolean} [cancellable] show OK and Cancel
 * @returns {Promise<boolean>} true when the user chose OK
 */
export const nativeMessage = async (message, cancellable = false) => {
    const invoke = nativeInvoke();
    if (!invoke) {
        // eslint-disable-next-line no-alert
        if (cancellable) return window.confirm(message);
        window.alert(message); // eslint-disable-line no-alert
        return true;
    }
    const answer = await Promise.resolve(invoke('plugin:dialog|message', {
        message,
        kind: 'warning',
        buttons: cancellable ? 'OkCancel' : 'Ok'
    })).catch(error => {
        // eslint-disable-next-line no-console
        console.error('[brickwright] message dialog failed', message, error);
        return null;
    });
    return answer === 'Ok';
};

const waitForVm = (tries = 100) => new Promise((resolve, reject) => {
    const check = n => {
        const store = guiStore();
        const vm = store && store.getState().scratchGui.vm;
        if (vm) return resolve(vm);
        if (n <= 0) return reject(new Error('VM not available'));
        return setTimeout(() => check(n - 1), 200);
    };
    check(tries);
});

let nativeLoading = false;
const trackedVms = new WeakSet();
/**
 * Any load that is not a native open (New, an example, a lesson, an importer, the web file
 * input) replaces the project, so Save must stop pointing at the file opened before it.
 * Wrapping `vm.loadProject` covers every such path, including ones added later.
 * @param {object} vm the scratch-vm instance
 * @returns {object} the same vm
 */
const trackDocumentReplacement = vm => {
    if (trackedVms.has(vm)) return vm;
    trackedVms.add(vm);
    const load = vm.loadProject.bind(vm);
    vm.loadProject = (...args) => {
        const native = nativeLoading;
        return load(...args).then(result => {
            const invoke = nativeInvoke();
            if (!native && invoke) {
                Promise.resolve(invoke('clear_project_document')).catch(error => {
                    // eslint-disable-next-line no-console
                    console.warn('[brickwright] could not unlink the previous project file', error);
                });
            }
            return result;
        });
    };
    return vm;
};

let lastOpen = null;
/**
 * Load a project the native side read (Open dialog, Recent Projects, file association) and,
 * once the VM accepted it, make it the document Save writes back to.
 * @param {{name: string, bytes: Array<number>, path: string}} payload from fileio.rs
 * @returns {Promise<boolean>} whether the project was loaded
 */
export const loadNativeProject = async payload => {
    const invoke = nativeInvoke();
    if (!invoke || !payload || !payload.bytes) return false;
    // The same association can arrive as the event and as the pending project.
    const signature = `${payload.path}:${payload.bytes.length}`;
    if (lastOpen && lastOpen.signature === signature && Date.now() - lastOpen.at < 1000) return false;
    const store = guiStore();
    if (store && store.getState().scratchGui.projectChanged &&
        !(await nativeMessage(REPLACE_WARNING, true))) {
        await invoke('discard_open_project');
        return false;
    }
    lastOpen = {signature, at: Date.now()};
    const vm = trackDocumentReplacement(await waitForVm());
    nativeLoading = true;
    try {
        await loadProjectFile(vm, new Uint8Array(payload.bytes).buffer, payload.name);
    } catch (error) {
        await Promise.resolve(invoke('discard_open_project')).catch(() => {});
        throw error;
    } finally {
        nativeLoading = false;
    }
    await invoke('activate_project_document', {path: payload.path});
    if (store) {
        if (payload.name) {
            store.dispatch(setProjectTitle(payload.name.replace(PROJECT_EXTENSION, '').substring(0, 100)));
        }
        store.dispatch(setProjectUnchanged());
    }
    return true;
};

/**
 * File > Load from your computer, or a Recent Projects entry.
 * @param {string} [path] a path from `recentNativeProjects`; omitted, the Open dialog asks
 * @returns {Promise<boolean>} whether a project was loaded
 */
export const openNativeProject = async path => {
    const invoke = nativeInvoke();
    const payload = path ?
        await invoke('open_recent_project', {path}) :
        await invoke('open_project_document');
    return payload ? loadNativeProject(payload) : false;
};

/**
 * @returns {Promise<Array<{name: string, path: string}>>} newest first, existing files only
 */
export const recentNativeProjects = () => nativeInvoke()('recent_projects');

/**
 * Save the project as a native document.
 * @param {string} filename suggested name, `.sb3`
 * @param {Blob} content the project archive
 * @param {'save'|'saveAs'} mode `save` writes back to the open document when there is one
 * @returns {Promise<{saved: boolean, name: ?string}>} `name` is the file actually written
 */
export const saveNativeProject = async (filename, content, mode) => {
    const invoke = nativeInvoke();
    const bytes = Array.from(new Uint8Array(await content.arrayBuffer()));
    const result = await invoke('save_project_document', {filename, bytes, mode});
    if (!result.conflict) return result;
    // The file changed on disk since it was opened here (another device, another app).
    // Never overwrite it: save this version under a new name, which becomes the document.
    await nativeMessage(`"${result.name}" was changed outside Brickwright since you opened it. ` +
        'Choose where to save your version as a separate file, so both are kept.');
    return invoke('save_project_document', {
        filename: filename.replace(/\.sb3$/i, ' (my copy).sb3'),
        bytes,
        mode: 'saveAs'
    });
};

/**
 * Bridge native Tauri events and capabilities into the web editor. No-op in a
 * normal browser apart from installing the common artifact/costume handlers.
 * @returns {void}
 */
export default function initTauriBridge () {
    const tauri = typeof window !== 'undefined' && window.__TAURI__;

    // One export route for extension-generated photos/scan archives and future
    // code/firmware artifacts. In a browser downloadBlob downloads; in Tauri it
    // uses Save As or the mobile OS share sheet.
    if (typeof window !== 'undefined' && !window.__brickwrightArtifactExportInstalled) {
        window.__brickwrightArtifactExportInstalled = true;
        window.addEventListener('bw-export-artifact', event => {
            const {filename, blob} = event.detail || {};
            if (filename && blob instanceof Blob) downloadBlob(filename, blob);
        });
        window.addEventListener('bw-camera-add-costume', async event => {
            const {dataUrl, name = 'camera photo', dataFormat = 'jpg'} = event.detail || {};
            if (!dataUrl) return;
            try {
                const vm = window.__brickwrightStore.getState().scratchGui.vm;
                const targetId = vm.editingTarget && vm.editingTarget.id;
                const match = /^data:[^;,]+;base64,(.*)$/.exec(dataUrl);
                if (!match) throw new Error('camera photo is not a base64 data URL');
                const binary = window.atob(match[1]);
                const bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
                const storage = vm.runtime.storage;
                const asset = storage.createAsset(
                    storage.AssetType.ImageBitmap,
                    dataFormat,
                    bytes,
                    null,
                    true
                );
                const md5 = `${asset.assetId}.${dataFormat}`;
                await vm.addCostume(md5, {
                    name,
                    dataFormat,
                    bitmapResolution: 1,
                    asset,
                    assetId: asset.assetId,
                    md5
                }, targetId);
            } catch (e) {
                // eslint-disable-next-line no-console
                console.error('[brickwright] add camera costume failed', e);
            }
        });
    }

    if (!tauri) return;

    if (tauri.core && typeof tauri.core.invoke === 'function') {
        const invoke = tauri.core.invoke;
        const depth = {
            available: false,
            running: false,
            label: 'RGB only',
            async refresh () {
                const status = await invoke('plugin:depth-capture|status').catch(() => null);
                if (status) Object.assign(this, status);
                return this;
            },
            async start () {
                await invoke('plugin:depth-capture|start');
                this.running = true;
            },
            capture (quality = 0.92) {
                return invoke('plugin:depth-capture|capture', {quality});
            },
            async stop () {
                await invoke('plugin:depth-capture|stop');
                this.running = false;
            }
        };
        window.__BRICKWRIGHT_DEPTH__ = depth;
        depth.refresh();
    }

    // Open external links (help pages, credits, "report a bug", extension docs)
    // in the system browser. Without this, clicking such a link navigates the
    // whole webview away from the editor — there is no back button, so the app
    // looks broken. Covers <a target=_blank>, cross-origin http(s) anchors, and
    // window.open. Uses tauri-plugin-opener via the global invoke.
    if (tauri.core && typeof tauri.core.invoke === 'function') {
        const openExternal = url => {
            try {
                tauri.core.invoke('plugin:opener|open_url', {url});
            } catch (e) {
                // best-effort; ignore
            }
        };
        const isExternal = href => {
            if (!href) return false;
            try {
                const u = new URL(href, window.location.href);
                return (u.protocol === 'http:' || u.protocol === 'https:') &&
                    u.origin !== window.location.origin;
            } catch (e) {
                return false;
            }
        };
        document.addEventListener('click', e => {
            const a = e.target && e.target.closest && e.target.closest('a[href]');
            if (!a) return;
            if (a.target === '_blank' || isExternal(a.getAttribute('href'))) {
                e.preventDefault();
                openExternal(a.href);
            }
        }, true);
        const nativeOpen = window.open;
        window.open = (url, ...rest) => {
            if (url && isExternal(url)) {
                openExternal(String(url));
                return null;
            }
            return nativeOpen ? nativeOpen.call(window, url, ...rest) : null;
        };
    }

    if (!tauri.event || typeof tauri.event.listen !== 'function') return;

    tauri.event.listen('load-project', event => {
        loadNativeProject(event.payload).catch(e => {
            // eslint-disable-next-line no-console
            console.error('[brickwright] load-project failed', e);
            nativeMessage(`Could not open the project: ${e.message || e}`);
        });
    });
    // A cold launch read its file before this listener existed.
    Promise.resolve().then(() => tauri.core.invoke('pending_project'))
        .then(payload => payload && loadNativeProject(payload))
        .catch(e => {
            // eslint-disable-next-line no-console
            console.error('[brickwright] pending project failed', e);
            nativeMessage(`Could not open the project: ${e.message || e}`);
        });
    waitForVm().then(trackDocumentReplacement)
        .catch(e => {
            // eslint-disable-next-line no-console
            console.warn('[brickwright] project document tracking unavailable', e);
        });
}
