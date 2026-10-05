import {inspectBrickwrightState, applyBrickwrightInspection,
    rollbackBrickwrightInspection} from './bw-project-bundle';
import {setProjectTitle} from '../reducers/project-title';
import {setProjectUnchanged} from '../reducers/project-changed';

const native = () => typeof window !== 'undefined' && window.__TAURI__;
const invoke = (command, args) => native().core.invoke(command, args);

const waitForVm = (tries = 100) => new Promise((resolve, reject) => {
    const check = n => {
        const vm = window.__brickwrightStore?.getState()?.scratchGui?.vm;
        if (vm) return resolve(vm);
        if (n <= 0) return reject(new Error('VM not available'));
        return setTimeout(() => check(n - 1), 200);
    };
    check(tries);
});

const nativeLoads = new WeakMap();
const trackedVm = async () => {
    const vm = await waitForVm();
    if (!nativeLoads.has(vm)) {
        const original = vm.loadProject.bind(vm);
        nativeLoads.set(vm, original);
        // Importers, lessons and peer transfers can all replace the project.
        // Unlink the previous on-disk document after any such successful load.
        vm.loadProject = (...args) => Promise.resolve(original(...args)).then(async result => {
            await invoke('clear_project_document').catch(error => {
                // eslint-disable-next-line no-console
                console.warn('[brickwright] could not unlink old project document', error);
            });
            return result;
        });
    }
    return vm;
};

let lastOpen = null;
export const loadNativeProject = async payload => {
    if (!payload?.bytes) return;
    const signature = `${payload.path}:${payload.bytes.length}`;
    if (lastOpen && lastOpen.signature === signature && Date.now() - lastOpen.at < 1000) return;
    if (window.ReduxStore?.getState()?.scratchGui?.projectChanged &&
        !confirm('Replace the current project? Save it first if you want to keep your changes.')) { // eslint-disable-line no-alert
        await invoke('discard_open_project');
        return;
    }
    lastOpen = {signature, at: Date.now()};
    const vm = await trackedVm();
    const buffer = new Uint8Array(payload.bytes).buffer;
    let bundle;
    try {
        const inspection = await inspectBrickwrightState(buffer);
        if (inspection.outcome === 'invalid' || inspection.outcome === 'future') {
            window.dispatchEvent(new CustomEvent('bw-project-bundle-loaded', {detail: inspection}));
            throw new Error(`Brickwright project state ${inspection.outcome}: ${inspection.reason || inspection.report?.action}`);
        }
        bundle = applyBrickwrightInspection(inspection);
        if (bundle.outcome === 'storage-failed') throw new Error(bundle.reason);
        try {
            await nativeLoads.get(vm)(buffer);
        } catch (error) {
            const rollback = rollbackBrickwrightInspection(bundle);
            if (!rollback.rolledBack) error.message += `; auxiliary rollback failed: ${rollback.reason}`;
            throw error;
        }
        window.dispatchEvent(new CustomEvent('bw-project-bundle-loaded', {detail: bundle}));
        await invoke('activate_project_document', {path: payload.path});
        if (payload.name && window.ReduxStore) {
            window.ReduxStore.dispatch(setProjectTitle(payload.name.replace(/\.sb[23]$/i, '')));
            window.ReduxStore.dispatch(setProjectUnchanged());
        }
    } catch (error) {
        await invoke('discard_open_project');
        throw error;
    }
};

export const openNativeProject = async path => {
    const payload = path ? await invoke('open_recent_project', {path}) :
        await invoke('open_project_document');
    if (payload) await loadNativeProject(payload);
};

export const getRecentNativeProjects = () => invoke('recent_projects');

// Native file associations and File menu opens share the loader above.
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

    tauri.event.listen('load-project', async event => {
        try {
            await loadNativeProject(event.payload);
        } catch (e) {
            // eslint-disable-next-line no-console
            console.error('[brickwright] load-project failed', e);
            alert(`Could not open project: ${e.message || e}`); // eslint-disable-line no-alert
        }
    });
    trackedVm().catch(error => {
        // eslint-disable-next-line no-console
        console.warn('[brickwright] project document tracking unavailable', error);
    });
    invoke('pending_project').then(loadNativeProject).catch(e => {
        // eslint-disable-next-line no-console
        console.error('[brickwright] pending project failed', e);
    });
}
