// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// Webpack loader for the Robot Lab part catalogue (src/lib/bw-sim/part-meta/parts.json):
// `parts.json?core` is the file with only its hand-made parts, `parts.json?derived` with
// only the parts scripts/derive-part-meta.mjs derived from LDraw (`"derived": true`).
// One source of truth, two modules: src/lib/bw-sim/sim-lab.js bundles the core in the
// Sim Lab chunk and imports the derived rest as its own chunk when Build opens or a
// model needs it. Every other key of the file (version, references) is kept in both.

module.exports = function partsSubset (source) {
    const which = (this.resourceQuery || '').replace(/^\?/, '');
    if (which !== 'core' && which !== 'derived') throw new Error(`parts-subset-loader: ?core or ?derived, not '${this.resourceQuery}'`);
    const json = JSON.parse(source);
    const parts = json.parts.filter(p => Boolean(p.derived) === (which === 'derived'));
    return `export default ${JSON.stringify({...json, parts})};\n`;
};
