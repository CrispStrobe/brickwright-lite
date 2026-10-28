// Generated from pinned Arcade common-package simulator Buffer hash (MIT).
// Copyright (c) Microsoft Corporation. See static/licenses/pxt-common-packages.MIT.txt.
// Consumed input: packages/scratch-gui/static/makecode/arcade/sim/common-sim.js
// Extracted unadapted functions SHA256: f03f4bd87aab0ce81333d5c62fb3772eeb8b946981834a4d7f25a6705fd26076
// Regenerate: node scripts/generate-arcade-buffers.mjs
module.exports = function initializePxtBufferHash() {
        function fnv1(data) {
            let h = 0x811c9dc5;
            for (let i = 0; i < data.length; ++i) {
                h = Math.imul(h, 0x1000193) ^ data[i];
            }
            return h;
        }
        function hash(buf, bits) {
            bits |= 0;
            if (bits < 1)
                return 0;
            const h = fnv1(buf.data);
            if (bits >= 32)
                return h >>> 0;
            else
                return ((h ^ (h >>> bits)) & ((1 << bits) - 1)) >>> 0;
        }

return hash;
};
