const surfaces = new Map();
const listeners = new Set();
let activeSurface = 'blocks';

const snapshot = () => {
    const surface = surfaces.get(activeSurface);
    return {surface: activeSurface, canUndo: !!(surface && surface.canUndo())};
};

const announce = () => {
    const state = snapshot();
    for (const listener of listeners) listener(state);
};

export const registerUndoSurface = (name, surface) => {
    surfaces.set(name, surface);
    announce();
    return () => {
        if (surfaces.get(name) === surface) surfaces.delete(name);
        announce();
    };
};

export const activateUndoSurface = name => {
    if (name && activeSurface !== name) activeSurface = name;
    announce();
};

export const notifyUndoState = announce;

export const undoActiveSurface = () => {
    const surface = surfaces.get(activeSurface);
    if (!surface || !surface.canUndo()) return false;
    const result = surface.undo();
    announce();
    return result !== false;
};

export const subscribeUndoState = listener => {
    listeners.add(listener);
    listener(snapshot());
    return () => listeners.delete(listener);
};

export const getUndoState = snapshot;
