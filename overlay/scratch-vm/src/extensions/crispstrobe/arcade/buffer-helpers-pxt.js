// Generated from PXT Arcade 4.2.1 base/buffer.ts, pxt-common-packages (MIT).
// Copyright (c) Microsoft Corporation. See static/licenses/pxt-common-packages.MIT.txt.
// Original source: https://github.com/microsoft/pxt-common-packages/blob/master/libs/base/buffer.ts
// Complete bundled buffer.ts SHA256: 970960b537291a5c8028afda5f210318dd1143de8f3835d4d71efb2ed9359061
// Selected unadapted source SHA256: 021b895e50ef945a7a042ea926523cca6c9aed1c4056d4c094f2d8e1d99fcfe6
// Regenerate: node scripts/generate-arcade-buffer-helpers.mjs
// Nine indexed Buffer reads and four writes use original getByte/setByte shims.
// Ten string-index reads use the original PXT String_.charAt boundary.
module.exports = function initializePxtBufferHelpers(Buffer, NumberFormat) {
const create = Buffer.create;
var helpers;
(function (helpers) {
    helpers._b64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
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
    function bufferToBase64(buf) {
        const len = buf.length;
        let r = "";
        for (let i = 0; i < len; i += 3) {
            const x0 = buf.getByte(i);
            r += helpers._b64.charAt(x0 >> 2);
            if (i + 1 >= len) {
                r += helpers._b64.charAt((x0 & 3) << 4) + "==";
            }
            else {
                const x1 = buf.getByte(i + 1);
                r += helpers._b64.charAt((x0 & 3) << 4 | (x1 >> 4));
                if (i + 2 >= len) {
                    r += helpers._b64.charAt((x1 & 15) << 2) + "=";
                }
                else {
                    const x2 = buf.getByte(i + 2);
                    r += helpers._b64.charAt((x1 & 15) << 2 | (x2 >> 6));
                    r += helpers._b64.charAt(x2 & 63);
                }
            }
        }
        return r;
    }
    helpers.bufferToBase64 = bufferToBase64;
})(helpers || (helpers = {}));
var Buffer;
(function (Buffer) {
    function b64Idx(c) {
        if (c === undefined || c == "=")
            return -1;
        // handle base64url
        if (c == "-")
            return 62;
        if (c == "_")
            return 63;
        const r = helpers._b64.indexOf(c);
        if (r < 0)
            throw "Invalid Base64";
        return r;
    }
    function fromBase64Core(trg, b64) {
        const len = b64.length;
        let dp = 0;
        for (let i = 0; i < len; i += 4) {
            const x0 = b64Idx(b64.charAt(i));
            const x1 = b64Idx(b64.charAt(i + 1));
            const x2 = b64Idx(b64.charAt(i + 2));
            const x3 = b64Idx(b64.charAt(i + 3));
            if (x0 < 0 || x1 < 0)
                throw "Invalid Base64";
            if (trg)
                trg.setByte(dp, (x0 << 2) | (x1 >> 4));
            dp++;
            if (x2 >= 0) {
                if (trg)
                    trg.setByte(dp, (x1 << 4) | (x2 >> 2));
                dp++;
                if (x3 >= 0) {
                    if (trg)
                        trg.setByte(dp, (x2 << 6) | x3);
                    dp++;
                }
            }
            else {
                if (x3 >= 0 || i + 4 < len)
                    throw "Invalid Base64";
            }
        }
        return dp;
    }
    /**
     * Create a new buffer, decoding a Base64 string
     */
    function fromBase64(b64) {
        const sz = fromBase64Core(null, b64);
        const res = create(sz);
        fromBase64Core(res, b64);
        return res;
    }
    Buffer.fromBase64 = fromBase64;
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

return {...helpers, sizeOfNumberFormat: Buffer.sizeOfNumberFormat, fromArray: Buffer.fromArray, concatArrays: Buffer.concat, fromBase64: Buffer.fromBase64};
};
