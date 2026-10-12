// Generated from PXT Arcade 4.2.1 base/buffer.ts, pxt-common-packages (MIT).
// Copyright (c) Microsoft Corporation. See static/licenses/pxt-common-packages.MIT.txt.
// Original source: https://github.com/microsoft/pxt-common-packages/blob/master/libs/base/buffer.ts
// Complete bundled buffer.ts SHA256: 970960b537291a5c8028afda5f210318dd1143de8f3835d4d71efb2ed9359061
// Selected unadapted source SHA256: 71196395cf23baa4c2146b1f8a59524c27df39f1b6e5094cb153b75c83b6c30f
// Regenerate: node scripts/generate-arcade-buffer-helpers.mjs
// Six indexed Buffer reads and one write use original getByte/setByte shims.
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
    function bufferToArray(buf, format) {
        const sz = Buffer.sizeOfNumberFormat(format);
        const len = buf.length - sz;
        const r = [];
        for (let i = 0; i <= len; i += sz)
            r.push(buf.getNumber(format, i));
        return r;
    }
    helpers.bufferToArray = bufferToArray;
})(helpers || (helpers = {}));
var Buffer;
(function (Buffer) {
    /**
     * Create a new buffer initialized to bytes from given array.
     * @param bytes data to initialize with
     */
    function fromArray(bytes) {
        let buf = Buffer.create(bytes.length);
        for (let i = 0; i < bytes.length; ++i)
            buf.setByte(i, bytes[i]);
        return buf;
    }
    Buffer.fromArray = fromArray;
    /**
     * Concatenates all buffers in the list
     */
    function concat(buffers) {
        let len = 0;
        for (let b of buffers)
            len += b.length;
        const r = Buffer.create(len);
        len = 0;
        for (let b of buffers) {
            r.write(len, b);
            len += b.length;
        }
        return r;
    }
    Buffer.concat = concat;
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

return {...helpers, sizeOfNumberFormat: Buffer.sizeOfNumberFormat, fromArray: Buffer.fromArray, concatArrays: Buffer.concat};
};
