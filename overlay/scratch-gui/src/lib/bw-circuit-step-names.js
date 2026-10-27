// History list names for the Circuit tab. bw-circuit-ui keeps its undo history
// as whole-circuit JSON snapshots without saying what changed, so a step is
// named by comparing a snapshot with the one before it ("Add resistor",
// "Remove wire", "Move led"). Loaded with the history coordinator, after the
// first paint; names are cached per snapshot pair, since snapshots never change.

const cache = new Map();
const MAX_CACHE = 400;

const parse = json => {
    try {
        return JSON.parse(json);
    } catch (e) {
        return null;
    }
};

const kindOf = part => String(part.kind || part.type || 'part').replace(/[_-]+/g, ' ');

/**
 * @param {string} before snapshot JSON
 * @param {string} after the next snapshot JSON
 * @returns {string} what the step from `before` to `after` did
 */
export const circuitStepName = (before, after) => {
    const key = `${before.length}:${after.length}:${before.slice(-64)}|${after.slice(-64)}`;
    const cached = cache.get(key);
    if (cached && cached.before === before && cached.after === after) return cached.name;
    const a = parse(before), b = parse(after);
    let name = 'Edit';
    if (a && b) {
        const oldParts = new Map((a.parts || []).map(part => [part.id, part]));
        const newParts = new Map((b.parts || []).map(part => [part.id, part]));
        const added = [...newParts.values()].filter(part => !oldParts.has(part.id));
        const removed = [...oldParts.values()].filter(part => !newParts.has(part.id));
        const wireKey = wire => JSON.stringify(wire);
        const oldWires = new Set((a.wires || []).map(wireKey));
        const newWires = new Set((b.wires || []).map(wireKey));
        const wiresAdded = [...newWires].filter(wire => !oldWires.has(wire)).length;
        const wiresRemoved = [...oldWires].filter(wire => !newWires.has(wire)).length;
        const changed = [...newParts.values()].filter(part => oldParts.has(part.id));
        const moved = changed.filter(part => oldParts.get(part.id).x !== part.x || oldParts.get(part.id).y !== part.y);
        const rotated = changed.filter(part => (oldParts.get(part.id).rotation || 0) !== (part.rotation || 0));
        const edited = changed.filter(part => JSON.stringify(oldParts.get(part.id).params) !== JSON.stringify(part.params));
        const one = (verb, parts) => (parts.length === 1 ? `${verb} ${kindOf(parts[0])}` : `${verb} ${parts.length} parts`);
        if (added.length) name = one('Add', added);
        else if (removed.length) name = one('Remove', removed);
        else if (wiresAdded && !wiresRemoved) name = wiresAdded === 1 ? 'Add wire' : `Add ${wiresAdded} wires`;
        else if (wiresRemoved && !wiresAdded) name = wiresRemoved === 1 ? 'Remove wire' : `Remove ${wiresRemoved} wires`;
        else if (wiresAdded) name = 'Rewire';
        else if (rotated.length) name = one('Rotate', rotated);
        else if (moved.length) name = one('Move', moved);
        else if (edited.length) name = one('Change', edited);
        else if (a.vcc !== b.vcc) name = 'Change supply';
    }
    if (cache.size > MAX_CACHE) cache.clear();
    cache.set(key, {before, after, name});
    return name;
};

/**
 * @param {Array<string>} stack bw-circuit-ui History snapshots
 * @param {number} cursor index of the current snapshot
 * @returns {{past: Array<string>, future: Array<string>}} oldest first / next redo first
 */
export const circuitSteps = (stack, cursor) => {
    const names = [];
    for (let i = 1; i < stack.length; i++) names.push(circuitStepName(stack[i - 1], stack[i]));
    return {past: names.slice(0, Math.max(0, cursor)), future: names.slice(Math.max(0, cursor))};
};
