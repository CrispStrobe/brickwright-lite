/** Physical button inputs share ownership, so releasing a mouse does not release
 * a key still held on the keyboard. Program writes use the existing panel API.
 */
export function releaseMomentaryButtons(panel, name) {
    for (const widget of panel.getWidgets()) {
        if (name !== undefined && widget.name !== name) continue;
        if (widget.type === 'button' && !widget.config.toggle && widget.state.pressed) {
            panel.setButtonInput(widget.name, false);
        }
    }
}

export function clearControllerPanel(panel) {
    releaseMomentaryButtons(panel);
    // A replacement must re-enter Play so the existing view rebinds/synchronizes
    // the restored controls, even if the previous layout was already in Play.
    panel.setMode('edit');
    for (const name of panel.getWidgetNames()) panel.removeWidget(name);
}

/** Tuning settings persist; held keys and other transient input do not. */
export function serializeControllerPanel(panel) {
    const data = panel.toJSON();
    for (const widget of data.widgets) {
        const live = panel.getWidget(widget.name);
        if (['slider', 'dial'].includes(widget.type) && Number.isFinite(live?.state.value)) {
            widget.config.value = live.state.value;
        }
    }
    return data;
}

const normalizedKey = value => String(value || '').toLowerCase();
const isTyping = target => !!target?.closest?.(
    'input:not([type="range"]), textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"], .cm-editor, .CodeMirror'
);

export function createWidgetButtonInputs(panel, {window: host = globalThis.window,
    document: doc = globalThis.document} = {}) {
    const held = new Map();
    const keyboard = new Map();
    let disposed = false;

    const press = (name, source) => {
        const widget = panel.getWidget(name);
        if (disposed || panel.mode !== 'play' || widget?.type !== 'button') return;
        let sources = held.get(name);
        if (!sources) { sources = new Set(); held.set(name, sources); }
        if (sources.has(source)) return;
        sources.add(source);
        if (widget.config.toggle || sources.size === 1) panel.setButtonInput(name, true);
    };
    const release = (name, source) => {
        const sources = held.get(name);
        if (!sources || (source !== undefined && !sources.delete(source))) return;
        if (source === undefined) sources.clear();
        if (sources.size) return;
        held.delete(name);
        const widget = panel.getWidget(name);
        if (widget?.type === 'button' && !widget.config.toggle && widget.state.pressed) panel.setButtonInput(name, false);
    };
    const releaseAll = () => {
        for (const name of [...held.keys()]) release(name);
        keyboard.clear();
    };
    const keyDown = event => {
        if (event.defaultPrevented || event.repeat || event.ctrlKey || event.metaKey || event.altKey ||
            panel.mode !== 'play' || doc?.hidden || isTyping(event.target)) return;
        if (event.target?.closest?.('input[type="range"]') &&
            /^(Arrow|Home$|End$|PageUp$|PageDown$| $)/.test(event.key)) return;
        const key = normalizedKey(event.key);
        if (!key || keyboard.has(key)) return;
        const names = panel.getWidgets().filter(w => w.type === 'button' && w.config.key &&
            normalizedKey(w.config.key) === key).map(w => w.name);
        if (!names.length) return;
        keyboard.set(key, names);
        for (const name of names) press(name, `key:${key}`);
        event.preventDefault();
    };
    const keyUp = event => {
        const key = normalizedKey(event.key), names = keyboard.get(key);
        if (!names) return;
        for (const name of names) release(name, `key:${key}`);
        keyboard.delete(key);
        event.preventDefault();
    };
    const visibility = () => { if (doc.hidden) releaseAll(); };
    const changed = kind => {
        if (panel.mode !== 'play') releaseAll();
        if (kind === 'remove') {
            for (const name of held.keys()) if (!panel.getWidget(name)) held.delete(name);
        }
    };
    host?.addEventListener('keydown', keyDown);
    host?.addEventListener('keyup', keyUp);
    host?.addEventListener('blur', releaseAll);
    doc?.addEventListener('visibilitychange', visibility);
    panel.addListener(changed);
    return {press, release, releaseAll, dispose() {
        if (disposed) return;
        releaseAll();
        disposed = true;
        panel.removeListener(changed);
        host?.removeEventListener('keydown', keyDown);
        host?.removeEventListener('keyup', keyUp);
        host?.removeEventListener('blur', releaseAll);
        doc?.removeEventListener('visibilitychange', visibility);
    }};
}
