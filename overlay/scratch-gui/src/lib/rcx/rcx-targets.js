/**
 * Where `runtime.rcxDownload` sends a compiled `.rcx` image: the IR tower (the
 * real brick, lib/rcx-download-hook.js) or a VIRTUAL target a host registered —
 * the Robot Lab's simulated RCX ("Robot Lab RCX", hubs/rcx/rcx-lab-target.js).
 *
 * THE TARGET IS CHOSEN, NEVER FALLEN BACK TO. `runtime.rcxDownloadTarget` holds
 * the user's explicit choice (default: the tower), and a download names its
 * target only through that choice or `options.target`. A chosen target that is
 * not registered (the Lab's scene has no RCX any more) is a refusal saying so,
 * not a silent download to the other one: a program meant for the simulation
 * must not reach a real robot on the desk, and the reverse.
 *
 * A target is {id, name: {en, de}, download(bytes, options) -> Promise<{ok, log}>}.
 */

/** The real brick through the IR tower: the hook's own path. */
export const TOWER_TARGET = 'tower';

const targetsOf = runtime => {
    if (!runtime.rcxTargets) runtime.rcxTargets = new Map();
    return runtime.rcxTargets;
};

/**
 * Registers a virtual download target. Returns the function that removes it again
 * (and, if it was the chosen target, goes back to the tower — an explicit reset,
 * shown in the UI as the selection changing, not a fallback at download time).
 */
export const registerRcxTarget = (runtime, target) => {
    if (!runtime || !target || typeof target.download !== 'function' || !target.id || target.id === TOWER_TARGET) {
        throw new TypeError('an RCX download target needs an id (not "tower") and download(bytes, options)');
    }
    targetsOf(runtime).set(target.id, target);
    return () => {
        if (targetsOf(runtime).get(target.id) !== target) return;
        targetsOf(runtime).delete(target.id);
        if (runtime.rcxDownloadTarget === target.id) runtime.rcxDownloadTarget = TOWER_TARGET;
    };
};

/** The registered virtual targets, [{id, name}], for a target picker. */
export const rcxTargets = runtime => [...targetsOf(runtime || {}).values()].map(({id, name}) => ({id, name}));

/** The user's choice: TOWER_TARGET or a registered target's id. */
export const selectRcxTarget = (runtime, id) => {
    if (id !== TOWER_TARGET && !targetsOf(runtime).has(id)) throw new Error(`no RCX download target '${id}'`);
    runtime.rcxDownloadTarget = id;
    return id;
};

/** The chosen target's id (the tower unless something was chosen). */
export const rcxTargetOf = runtime => (runtime && runtime.rcxDownloadTarget) || TOWER_TARGET;

/**
 * A download to a virtual target, or null when the download is the tower's.
 * @returns {null|Promise<{ok: boolean, log: string}>}
 */
export const virtualDownload = (runtime, bytes, options = {}) => {
    const id = options.target || rcxTargetOf(runtime);
    if (id === TOWER_TARGET) return null;
    const target = targetsOf(runtime).get(id);
    if (!target) return Promise.resolve({ok: false, log: `the RCX download target '${id}' is not available (nothing was sent)`});
    return Promise.resolve().then(() => target.download(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes), options))
        .catch(e => ({ok: false, log: String((e && e.message) || e)}));
};
