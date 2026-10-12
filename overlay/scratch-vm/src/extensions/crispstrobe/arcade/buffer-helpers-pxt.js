// Generated from PXT Arcade 4.2.1 base/buffer.ts, pxt-common-packages (MIT).
// Copyright (c) Microsoft Corporation. See static/licenses/pxt-common-packages.MIT.txt.
// Original source: https://github.com/microsoft/pxt-common-packages/blob/master/libs/base/buffer.ts
// Complete bundled buffer.ts SHA256: 970960b537291a5c8028afda5f210318dd1143de8f3835d4d71efb2ed9359061
// Selected unadapted source SHA256: a5050ac9f5299fb2cd3cf74345859edb371a2802cef4309f9b4bc8428450682e
// Regenerate: node scripts/generate-arcade-buffer-helpers.mjs
// Six indexed Buffer reads use the original getByte shim, including out-of-range zero.
module.exports = function initializePxtBufferHelpers(Buffer) {
var helpers;
(function (helpers) {
    function bufferConcat(a, b) {
        const r = Buffer.create(a.length + b.length);
        r.write(0, a);
        r.write(a.length, b);
        return r;
    }
    helpers.bufferConcat = bufferConcat;
    function bufferEquals(l, r) {
        if (!l || !r)
            return !!l == !!r;
        if (l.length != r.length)
            return false;
        for (let i = 0; i < l.length; ++i) {
            if (l.getByte(i) != r.getByte(i))
                return false;
        }
        return true;
    }
    helpers.bufferEquals = bufferEquals;
    function bufferIndexOf(a, b) {
        for (let i = 0; i <= a.length - b.length; ++i) {
            if (a.getByte(i) == b.getByte(0)) {
                let j = 0;
                while (j < b.length) {
                    if (a.getByte(i + j) != b.getByte(j))
                        break;
                    j++;
                }
                if (j >= b.length)
                    return i;
            }
        }
        return -1;
    }
    helpers.bufferIndexOf = bufferIndexOf;
})(helpers || (helpers = {}));

return helpers;
};
