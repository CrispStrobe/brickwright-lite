// Diagnostic preference: applied only when constructing a NEW project machine.
// Never changes a live target or selects an experimental execution backend.
export const I8086_MEMORY_KEY = 'bw-i8086-memory';
let sessionMode;
export function getI8086MemoryMode () {
    if (sessionMode) return sessionMode;
    try { return globalThis.localStorage?.getItem(I8086_MEMORY_KEY) === 'reference' ? 'reference' : 'optimized'; }
    catch { return 'optimized'; }
}
export function setI8086MemoryMode (mode) {
    if (!['optimized', 'reference'].includes(mode)) throw new Error('Unknown 8086 memory mode');
    sessionMode = mode;
    try { globalThis.localStorage?.setItem(I8086_MEMORY_KEY, mode); return true; }
    catch { return false; }
}
export function withI8086MemoryPreference (config) {
    return getI8086MemoryMode() === 'reference' ? {...config, fastWords: false} : config;
}
