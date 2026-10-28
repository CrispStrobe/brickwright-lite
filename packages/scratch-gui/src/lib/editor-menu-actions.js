// Small bridge from the shared menus to lazily mounted editors. Providers return
// null while hidden. Keep callbacks in the editor, including native file inputs.
const providers = new Map();
const listeners = new Set();

export const notifyEditorMenuActions = () => {
    for (const listener of listeners) listener();
};

export const subscribeEditorMenuActions = listener => {
    listeners.add(listener);
    listener();
    return () => listeners.delete(listener);
};

export const registerEditorMenuActions = (surface, getActions) => {
    const entry = {getActions};
    if (!providers.has(surface)) providers.set(surface, new Set());
    const entries = providers.get(surface);
    entries.add(entry);
    notifyEditorMenuActions();
    return () => {
        entries.delete(entry);
        if (!entries.size && providers.get(surface) === entries) providers.delete(surface);
        notifyEditorMenuActions();
    };
};

const resolveAction = (surface, name) => {
    let actions = null;
    for (const entry of providers.get(surface) || []) {
        let candidate;
        try { candidate = entry.getActions(); } catch { return null; }
        if (!candidate) continue;
        // Two visible owners are ambiguous; never send a file to the wrong one.
        if (actions) return null;
        actions = candidate;
    }
    return actions && Object.prototype.hasOwnProperty.call(actions, name) ? actions[name] : null;
};

export const editorMenuActionEnabled = (surface, name) => {
    const action = resolveAction(surface, name);
    return !!(action && action.enabled === true && typeof action.run === 'function');
};

export const runEditorMenuAction = (surface, name) => {
    // Re-read current availability at the click, rather than trusting menu state.
    const action = resolveAction(surface, name);
    if (!action || action.enabled !== true || typeof action.run !== 'function') return false;
    action.run();
    return true;
};
