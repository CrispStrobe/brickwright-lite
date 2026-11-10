// SPDX-License-Identifier: BSD-3-Clause
/**
 * The ONE serialization of `bw-circuit-autosave` the host writes when it
 * flushes the Designer's circuit (circuit-tab.jsx, on hide).
 *
 * It must equal bw-circuit-ui's own debounced autosave byte for byte. That
 * rule, since bw-circuit-ui 9d7a9a26: write non-empty circuits, OR any circuit
 * while a file owns the canvas; and while a file owns it, carry the resolved
 * engine nets (`saved.nets = circuit.resolvedNets`).
 *
 * When the host kept the older rule (plain toJSON, no nets), two writers
 * produced two different records for the SAME unchanged circuit. Opening a
 * project switches the active tab, which hides the Circuit tab and runs the
 * host flush — so opening a project whose sidecar is REFUSED (future version,
 * invalid JSON) still rewrote the known circuit record from the nets form to
 * the plain form. The refusal left the project untouched in memory but not in
 * storage, and whether it showed depended on which writer ran last.
 *
 * @param {object} circuit - the Designer's Circuit (toJSON, resolvedNets)
 * @param {boolean} fileLoaded - the `bw-circuit-file-loaded` ownership marker
 * @returns {string|null} the record to store, or null when nothing is written
 */
const circuitAutosaveRecord = (circuit, fileLoaded) => {
    const data = circuit && typeof circuit.toJSON === 'function' ? circuit.toJSON() : null;
    if (!data || !Array.isArray(data.parts)) return null;
    if (!(data.parts.length > 0 || fileLoaded)) return null;
    if (fileLoaded) data.nets = circuit.resolvedNets;
    return JSON.stringify(data);
};

const readFileLoadedMarker = storage => {
    try { return storage.getItem('bw-circuit-file-loaded') === '1'; } catch (e) { return false; }
};

export {circuitAutosaveRecord, readFileLoadedMarker};
