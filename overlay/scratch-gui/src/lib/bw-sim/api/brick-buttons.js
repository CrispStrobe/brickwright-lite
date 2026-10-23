// SPDX-License-Identifier: BSD-3-Clause
// Button input goes through each brick's public input methods. A held UI input
// owns a release for that brick/session, never a lookup in a replacement model.
const EV3 = Object.freeze(['up', 'enter', 'down', 'right', 'left', 'back']);
const NXT = Object.freeze(['exit', 'right', 'left', 'enter']);
const SPIKE = Object.freeze(['left', 'center', 'right', 'bluetooth']);

const adapterFor = (record, session) => {
    const hub = record.hub;
    if (!hub) return null;
    if (record.profile === 'ev3' && typeof hub.pressButton === 'function' && typeof hub.button === 'function') {
        return {owner: hub, names: EV3, code: i => i + 1,
            read: i => hub.button(i + 1), write: (i, down) => hub.pressButton(i + 1, down)};
    }
    if (record.profile === 'nxt' && typeof hub.pressButton === 'function' && typeof hub.readButton === 'function') {
        return {owner: hub, names: NXT, code: i => i,
            read: i => Boolean(hub.readButton(i, false)?.pressed), write: (i, down) => hub.pressButton(i, down)};
    }
    const state = hub.hubState;
    if (!session.lockstep && state?.data?.buttons && typeof state.changed === 'function') {
        const names = SPIKE.filter(name => typeof state.data.buttons[name] === 'boolean');
        if (names.length) return {owner: state, names, code: i => names[i],
            read: i => state.data.buttons[names[i]], write: (i, down) => {
                state.data.buttons[names[i]] = down;
                state.changed();
            }};
    }
    if (['lwp3', 'wedo2'].includes(hub.protocol) && typeof hub.pressButton === 'function' && typeof hub.readButton === 'function') {
        return {owner: hub, names: ['button'], code: () => 0,
            read: () => Boolean(hub.readButton(0)?.pressed), write: (i, down) => hub.pressButton(0, down)};
    }
    return null;
};

export const createBrickButtonControls = ({getSession, noSession, refuse, ensureRunning}) => {
    const owned = new Map();
    let releasing = false;
    const available = session => (session?.hubs || []).flatMap(record => {
        const adapter = adapterFor(record, session);
        return adapter ? [{record, adapter}] : [];
    });
    const find = (ref, button) => {
        const session = getSession();
        if (!session) return {error: noSession()};
        const record = typeof ref === 'string' ? session.hubs.find(h => h.id === ref) : null;
        if (!record) return {error: refuse('no-brick', {ref: typeof ref === 'string' ? ref : '?'})};
        const adapter = adapterFor(record, session);
        if (!adapter) return {error: refuse('no-buttons', {hub: record.id})};
        const index = typeof button === 'number' && Number.isInteger(button) ?
            adapter.names.findIndex((name, i) => adapter.code(i) === button) :
            typeof button === 'string' ? adapter.names.indexOf(button.toLowerCase()) : -1;
        if (index < 0) return {error: refuse('bad-button', {hub: record.id,
            ref: typeof button === 'string' || typeof button === 'number' ? button : '?', list: adapter.names.join(', ')})};
        return {session, record, hub: record.hub, profile: record.profile, adapter, index};
    };
    const mapOf = owner => {
        if (!owned.has(owner)) owned.set(owner, new Map());
        return owned.get(owner);
    };
    const drop = entry => {
        const map = owned.get(entry.adapter.owner);
        if (map?.get(entry.index) !== entry) return false;
        map.delete(entry.index);
        if (!map.size) owned.delete(entry.adapter.owner);
        return true;
    };
    const restore = entry => {
        if (!drop(entry) || !entry.wrote || entry.adapter.read(entry.index) !== true) return;
        const now = getSession();
        // SPIKE state can deliberately be reused by a new model. Its new owner
        // wins; an old pointer/key release must not write into that new model.
        const sameIncarnation = now === entry.session && entry.record.hub === entry.hub && entry.record.profile === entry.profile;
        if (now && !sameIncarnation && available(now).some(x => x.adapter.owner === entry.adapter.owner)) return;
        entry.adapter.write(entry.index, entry.baseline);
    };
    const entryOf = found => {
        const {adapter, index, session} = found;
        const map = mapOf(adapter.owner);
        let entry = map.get(index);
        if (!entry || entry.session !== session || entry.hub !== found.hub || entry.profile !== found.profile) {
            entry = {...found, baseline: Boolean(adapter.read(index)), wrote: false, manual: false, holds: new Set()};
            map.set(index, entry);
        }
        return entry;
    };
    const isCurrent = found => {
        if (getSession() !== found.session || !found.session.hubs.includes(found.record) ||
            found.record.hub !== found.hub || found.record.profile !== found.profile) return false;
        const now = adapterFor(found.record, found.session);
        return now && now.owner === found.adapter.owner && now.names[found.index] === found.adapter.names[found.index] &&
            now.code(found.index) === found.adapter.code(found.index);
    };
    const activate = found => {
        if (ensureRunning) ensureRunning();
        if (!isCurrent(found)) return refuse('scene-changed');
        return null;
    };
    const press = (ref, button, down = true) => {
        if (releasing) return refuse('buttons-unavailable');
        const found = find(ref, button);
        if (found.error) return found.error;
        if (typeof down !== 'boolean') return refuse('bad-button-state');
        if (down) {
            const error = activate(found);
            if (error) return error;
        }
        const entry = entryOf(found);
        entry.holds.clear();
        entry.manual = down;
        if (Boolean(found.adapter.read(found.index)) !== down) {
            entry.wrote = true;
            found.adapter.write(found.index, down);
        }
        if (!down) drop(entry);
        if (!isCurrent(found)) { restore(entry); return refuse('scene-changed'); }
        return {ok: true, hub: found.record.id, button: found.adapter.names[found.index],
            pressed: Boolean(found.adapter.read(found.index))};
    };
    const hold = (ref, button) => {
        if (releasing) return refuse('buttons-unavailable');
        const found = find(ref, button);
        if (found.error) return found.error;
        const error = activate(found);
        if (error) return error;
        const entry = entryOf(found);
        const token = {};
        entry.holds.add(token);
        if (!found.adapter.read(found.index)) {
            entry.wrote = true;
            found.adapter.write(found.index, true);
        }
        if (!isCurrent(found)) { restore(entry); return refuse('scene-changed'); }
        return {ok: true, release () {
            if (!entry.holds.delete(token)) return;
            if (!entry.holds.size && !entry.manual) restore(entry);
        }};
    };
    return {
        list: () => available(getSession()).map(({record, adapter}) => ({hub: record.id, profile: record.profile,
            buttons: adapter.names.map((name, i) => ({name, index: adapter.code(i), pressed: Boolean(adapter.read(i))}))})),
        press, hold,
        releaseAll () {
            if (releasing) return;
            releasing = true;
            const errors = [];
            try {
                const entries = [...owned.values()].flatMap(map => [...map.values()]);
                for (const entry of entries) {
                    try { restore(entry); } catch (error) { errors.push(error); }
                    entry.holds.clear();
                }
            } finally { releasing = false; }
            if (errors.length) throw new AggregateError(errors, 'brick button release failed');
        }
    };
};
