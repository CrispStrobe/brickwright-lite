// SPDX-License-Identifier: BSD-3-Clause
/**
 * The ONE serialization of `bw-circuit-autosave` the host writes when it
 * flushes the Designer's circuit (circuit-tab.jsx, on hide).
 *
 * It must equal bw-circuit-ui's own record (its model/autosave-record.js)
 * byte for byte: write non-empty circuits, or any circuit while a file owns
 * the canvas, and carry engine nets ONLY for a file that brought its own nets.
 * The stored record says which: bw-circuit-ui's load write includes `nets`
 * exactly when the file did.
 *
 * Two record shapes for one unchanged circuit was the I5 defect: opening a
 * project switches the active tab, which hides and later remounts the
 * Designer, so opening a project whose sidecar is REFUSED (future version,
 * invalid JSON) still rewrote the known circuit record — a wire-based file
 * restored without nets came back with resolved nets added.
 *
 * @param {object} circuit - the Designer's Circuit (toJSON, resolvedNets)
 * @param {{fileLoaded: boolean, fileNets: boolean}} owner
 * @returns {string|null} the record to store, or null when nothing is written
 */
const circuitAutosaveRecord = (circuit, {fileLoaded = false, fileNets = false} = {}) => {
    const data = circuit && typeof circuit.toJSON === 'function' ? circuit.toJSON() : null;
    if (!data || !Array.isArray(data.parts)) return null;
    if (!(data.parts.length > 0 || fileLoaded)) return null;
    const saved = {...data};
    if (fileLoaded && fileNets && Array.isArray(circuit.resolvedNets)) saved.nets = circuit.resolvedNets;
    return JSON.stringify(saved);
};

/** Ownership as bw-circuit-ui recorded it: the marker, and whether the file carried nets. */
const readCircuitOwner = storage => {
    let fileLoaded = false;
    let fileNets = false;
    try {
        fileLoaded = storage.getItem('bw-circuit-file-loaded') === '1';
        const stored = fileLoaded ? JSON.parse(storage.getItem('bw-circuit-autosave') || 'null') : null;
        fileNets = !!stored && Array.isArray(stored.nets) && stored.nets.length > 0;
    } catch (e) { /* unreadable storage: plain record */ }
    return {fileLoaded, fileNets};
};

export {circuitAutosaveRecord, readCircuitOwner};
