// Generated from PXT Arcade 4.2.1 base/buffer.ts, pxt-common-packages (MIT).
// Copyright (c) Microsoft Corporation. See static/licenses/pxt-common-packages.MIT.txt.
// Original source: https://github.com/microsoft/pxt-common-packages/blob/master/libs/base/buffer.ts
// Complete bundled buffer.ts SHA256: 970960b537291a5c8028afda5f210318dd1143de8f3835d4d71efb2ed9359061
// Selected unadapted source SHA256: cd4238be0abd87bc12b1d21ca2aca529ece9deb6301f9427e4cb0a6c5c0c0cea
// Regenerate: node scripts/generate-arcade-buffer-helpers.mjs
// Six indexed Buffer reads use the original getByte shim, including out-of-range zero.
module.exports = function initializePxtBufferHelpers(Buffer, NumberFormat) {
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
var Buffer;
(function (Buffer) {
    /**
     * Get the size in bytes of specified number format.
     */
    function sizeOfNumberFormat(format) {
        switch (format) {
            case NumberFormat.Int8LE:
            case NumberFormat.UInt8LE:
            case NumberFormat.Int8BE:
            case NumberFormat.UInt8BE:
                return 1;
            case NumberFormat.Int16LE:
            case NumberFormat.UInt16LE:
            case NumberFormat.Int16BE:
            case NumberFormat.UInt16BE:
                return 2;
            case NumberFormat.Int32LE:
            case NumberFormat.Int32BE:
            case NumberFormat.UInt32BE:
            case NumberFormat.UInt32LE:
            case NumberFormat.Float32BE:
            case NumberFormat.Float32LE:
                return 4;
            case NumberFormat.Float64BE:
            case NumberFormat.Float64LE:
                return 8;
        }
        return 0;
    }
    Buffer.sizeOfNumberFormat = sizeOfNumberFormat;
})(Buffer || (Buffer = {}));

return {...helpers, sizeOfNumberFormat: Buffer.sizeOfNumberFormat};
};
