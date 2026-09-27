import downloadBlob from './download-blob';

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

    const getVm = () => {
        try {
            return window.__brickwrightStore.getState().scratchGui.vm;
        } catch (e) {
            return null;
        }
    };
    const waitForVm = (tries = 100) => new Promise((resolve, reject) => {
        const check = n => {
            const vm = getVm();
            if (vm) return resolve(vm);
            if (n <= 0) return reject(new Error('VM not available'));
            return setTimeout(() => check(n - 1), 200);
        };
        check(tries);
    });

    tauri.event.listen('load-project', async event => {
        try {
            const {name, bytes} = event.payload || {};
            if (!bytes) return;
            const vm = await waitForVm();
            await vm.loadProject(new Uint8Array(bytes).buffer);
            if (window.ReduxStore && name) {
                try {
                    window.ReduxStore.dispatch({
                        type: 'scratch-gui/project-title/SET_PROJECT_TITLE',
                        title: name.replace(/\.sb[23]$/i, '')
                    });
                } catch (e) {
                    // Title is best-effort; ignore if the action shape changes.
                }
            }
        } catch (e) {
            // eslint-disable-next-line no-console
            console.error('[brickwright] load-project failed', e);
        }
    });
}
