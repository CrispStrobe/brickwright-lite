// Brickwright: load extensions named in the URL on startup, e.g.
//   ?extension=https://host/ext.mjs
// Repeatable (?extension=a&extension=b) or comma-separated. Mirrors Xcratch's
// ?extension= and TurboWarp's URL loading, reusing our existing in-process
// loader (extensionManager.loadExtensionURL → _loadRemoteExtension).
//
// SECURITY: these run in-process with full page access. Anything NOT on our
// trusted gallery host is loaded only after an explicit confirm — a query-param
// link must never silently run arbitrary remote code on someone's machine.

const collectUrls = () => {
    if (typeof window === 'undefined' || !window.location) return [];
    const urls = [];
    for (const raw of new URLSearchParams(window.location.search).getAll('extension')) {
        for (const part of raw.split(',')) {
            const trimmed = part.trim();
            if (trimmed) urls.push(trimmed);
        }
    }
    return urls;
};

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
        if (vm && vm.extensionManager) return resolve(vm);
        if (n <= 0) return reject(new Error('VM not available'));
        return setTimeout(() => check(n - 1), 200);
    };
    check(tries);
});

/**
 * Load any extensions named in the address bar (?extension=<url>) once the VM is
 * ready. Untrusted URLs prompt for confirmation first. No-op if none are present.
 * @returns {void}
 */
export default function initUrlExtensions () {
    const urls = collectUrls();
    if (!urls.length) return;
    waitForVm()
        .then(async vm => {
            const mgr = vm.extensionManager;
            for (const url of urls) {
                try {
                    const trusted = typeof mgr.isTrustedExtensionURL === 'function' &&
                        mgr.isTrustedExtensionURL(url);
                    if (!trusted) {
                        // eslint-disable-next-line no-alert
                        const ok = typeof window.confirm === 'function' && window.confirm(
                            `Load the extension from:\n\n${url}\n\n` +
                            'Only continue if you trust this source — it runs with full access to the editor.'
                        );
                        if (!ok) continue;
                    }
                    // eslint-disable-next-line no-await-in-loop
                    await mgr.loadExtensionURL(url);
                } catch (e) {
                    // eslint-disable-next-line no-console
                    console.error('[brickwright] failed to load URL extension', url, e);
                }
            }
        })
        .catch(() => {
            // VM never came up (e.g. unsupported browser); nothing to load.
        });
}
