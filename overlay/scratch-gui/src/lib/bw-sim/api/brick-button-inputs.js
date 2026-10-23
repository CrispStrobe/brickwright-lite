// SPDX-License-Identifier: BSD-3-Clause
// Each pointer/key owns one API hold. Losing the view releases the captured
// holds, rather than looking up similarly named buttons in a newer model.
export const createBrickButtonInputs = ({getApi, onChange = () => {}}) => {
    const held = new Map();
    let revision = 0;
    let disposed = false;
    let releasing = false;
    const release = key => {
        const entry = held.get(key);
        if (!entry) return;
        held.delete(key);
        try { entry.release(); } finally { onChange(); }
    };
    const clear = () => {
        if (releasing) return;
        releasing = true;
        revision++;
        const errors = [];
        try {
            for (const key of [...held.keys()]) {
                try { release(key); } catch (error) { errors.push(error); }
            }
        } finally { releasing = false; }
        if (errors.length) throw new AggregateError(errors, 'Brick button release failed');
    };
    return {
        hold (key, hub, button) {
            if (disposed || releasing) return {ok: false, code: 'closed'};
            if (held.has(key)) return {ok: true};
            const api = getApi();
            const request = revision;
            const result = api?.holdButton(hub, button) || {ok: false, code: 'no-session'};
            if (!result.ok) return result;
            if (disposed || request !== revision || getApi() !== api) {
                result.release();
                return {ok: false, code: 'scene-changed'};
            }
            held.set(key, result);
            onChange();
            if (disposed || request !== revision || held.get(key) !== result) return {ok: false, code: 'scene-changed'};
            return {ok: true};
        },
        release,
        clear,
        dispose () { disposed = true; clear(); }
    };
};
