/**
 * The bench temperature: the air every part on the board sits in.
 *
 * bw-board solves temperature-dependent parts (a junction's forward drop, a
 * TMP36's default reading) and the chips' own on-die sensors against
 * `board.temperatureC`, which `board.setTemperature(c)` moves. Until task B13
 * nothing in the app called it, so `chip temperature` read 25 °C whatever the
 * program did. The Circuit tab owns the control; this module is its state:
 * one value per viewer, applied to every board the tab shows (the designer's
 * own, which the Scratch VM's reporters read, and a debug runner's while its
 * run lives).
 */

/** The range the datasheets' sensor tables span (−40 °C to +125 °C). */
export const BENCH_MIN_C = -40;
export const BENCH_MAX_C = 125;
export const BENCH_DEFAULT_C = 25;
const STORAGE_KEY = 'bw-bench-temperature';

/** A whole number of degrees inside the range, or null for something that is not a number. */
export function clampBenchTemperature (value) {
    if (value === '' || value === null || typeof value === 'undefined') return null;
    const n = Number(value);
    if (!Number.isFinite(n)) return null;
    return Math.min(BENCH_MAX_C, Math.max(BENCH_MIN_C, Math.round(n)));
}

/** The viewer's last setting, or the default (storage can be absent or throw). */
export function loadBenchTemperature (storage) {
    try {
        const s = storage || (typeof localStorage === 'undefined' ? null : localStorage);
        const c = s ? clampBenchTemperature(s.getItem(STORAGE_KEY)) : null;
        return c === null ? BENCH_DEFAULT_C : c;
    } catch {
        return BENCH_DEFAULT_C;
    }
}

export function saveBenchTemperature (celsius, storage) {
    try {
        const s = storage || (typeof localStorage === 'undefined' ? null : localStorage);
        if (s) s.setItem(STORAGE_KEY, String(celsius));
    } catch { /* private mode: the setting lasts this session */ }
}

/**
 * Put `celsius` on `board` when it differs. Returns true when the board moved.
 * A board without setTemperature (a hardware target, an older engine) is left
 * alone. setTemperature re-solves the circuit, so an unchanged value is not
 * re-applied.
 */
export function applyBenchTemperature (board, celsius) {
    if (!board || typeof board.setTemperature !== 'function') return false;
    if (Number(board.temperatureC) === celsius) return false;
    board.setTemperature(celsius);
    return true;
}
