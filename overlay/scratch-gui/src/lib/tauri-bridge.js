// Brickwright: bridge native (Tauri) file-open events into the web VM. When the
// app is launched by opening an .sb3 (file association / share "open with") or a
// deep link, the Rust side reads the file and emits a `load-project` event; here
// we feed it into `window.vm.loadProject`. No-op outside Tauri.
export default function initTauriBridge () {
    const tauri = typeof window !== 'undefined' && window.__TAURI__;
    if (!tauri || !tauri.event || typeof tauri.event.listen !== 'function') return;

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
