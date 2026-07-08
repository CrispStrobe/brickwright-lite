// Brickwright: bridge native (Tauri) file-open events into the web VM. When the
// app is launched by opening an .sb3 (file association / share "open with") or a
// deep link, the Rust side reads the file and emits a `load-project` event; here
// we feed it into `window.vm.loadProject`. No-op outside Tauri.
export default function initTauriBridge () {
    const tauri = typeof window !== 'undefined' && window.__TAURI__;
    if (!tauri) return;

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
