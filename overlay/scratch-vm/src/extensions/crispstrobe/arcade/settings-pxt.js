// Generated from pinned Arcade 4.2.1 pxt-common-packages Settings/MessagePack (MIT).
// Copyright (c) Microsoft Corporation; see static/licenses/pxt-common-packages.MIT.txt.
// settings.ts SHA256 d9d06674d5d84a6ff07737e59df21172bba0f0069d963b90bed96efe00e85720; base/buffer.ts SHA256 970960b537291a5c8028afda5f210318dd1143de8f3835d4d71efb2ed9359061.
// Original simulator backend SHA256 df926f1368ad2c26abec0dc16d84a9ea13c3d1a1aa69447fb7e8c3721344d1f9.
// Regenerate: node scripts/generate-arcade-settings.mjs
module.exports = {
 initializeSettings(host) {
 const {control,Buffer,NumberFormat,pins,_set,_get,_exists,_remove,_userClean,_list}=host;
var settings;
(function (settings) {
    /**
     * Delete all non-system settings.
     */
    function clear() {
        _userClean();
    }
    settings.clear = clear;
    /**
     * Set named setting to a given buffer.
     */
    function writeBuffer(key, value) {
        if (_set(key, value)) {
            // if we're out of space, clear user storage
            _userClean();
            // and panic - reset should hopefully recreate needed files
            control.panic(920);
        }
    }
    settings.writeBuffer = writeBuffer;
    /**
     * Set named settings to a given string.
     */
    function writeString(key, value) {
        writeBuffer(key, control.createBufferFromUTF8(value));
    }
    settings.writeString = writeString;
    /**
     * Set named settings to a given number.
     */
    function writeNumber(key, value) {
        writeBuffer(key, msgpack.packNumberArray([value]));
    }
    settings.writeNumber = writeNumber;
    /**
     * Set named settings to a given array of numbers.
     */
    function writeNumberArray(key, value) {
        writeBuffer(key, msgpack.packNumberArray(value));
    }
    settings.writeNumberArray = writeNumberArray;
    /**
     * Read named setting as a buffer. Returns undefined when setting not found.
     */
    function readBuffer(key) {
        return _get(key);
    }
    settings.readBuffer = readBuffer;
    /**
     * Read named setting as a string.
     */
    function readString(key) {
        const buf = readBuffer(key);
        if (!buf)
            return undefined;
        else
            return buf.toString();
    }
    settings.readString = readString;
    /**
     * Read named setting as a number.
     */
    function readNumber(key) {
        const buf = readBuffer(key);
        if (!buf)
            return undefined;
        else {
            const nums = msgpack.unpackNumberArray(buf);
            if (nums && nums.length >= 1)
                return nums[0];
            return undefined;
        }
    }
    settings.readNumber = readNumber;
    /**
     * Read named setting as a number.
     */
    function readNumberArray(key) {
        const buf = readBuffer(key);
        if (!buf)
            return undefined;
        else
            return msgpack.unpackNumberArray(buf);
    }
    settings.readNumberArray = readNumberArray;
    /**
     * Return a list of settings starting with a given prefix.
     */
    function list(prefix) {
        if (!prefix)
            prefix = "";
        return _list(prefix);
    }
    settings.list = list;
    /**
     * Remove named setting.
     */
    function remove(key) {
        _remove(key);
    }
    settings.remove = remove;
    /**
     * Check if a named setting exists.
     */
    function exists(key) {
        return _exists(key);
    }
    settings.exists = exists;
})(settings || (settings = {}));
// see http://msgpack.org/ for the spec
// it currently only implements numbers and their sequances
// once we handle any type and typeof expressions we can do more
var msgpack;
(function (msgpack) {
    function tagFormat(tag) {
        switch (tag) {
            case 0xCB: return NumberFormat.Float64BE;
            case 0xCC: return NumberFormat.UInt8BE;
            case 0xCD: return NumberFormat.UInt16BE;
            case 0xCE: return NumberFormat.UInt32BE;
            case 0xD0: return NumberFormat.Int8BE;
            case 0xD1: return NumberFormat.Int16BE;
            case 0xD2: return NumberFormat.Int32BE;
            default:
                return null;
        }
    }
    function packNumberCore(buf, offset, num) {
        let tag = 0xCB;
        if (num == (num << 0) || num == (num >>> 0)) {
            if (-31 <= num && num <= 127) {
                if (buf)
                    buf[offset] = num;
                return 1;
            }
            else if (0 <= num) {
                if (num <= 0xff) {
                    tag = 0xCC;
                }
                else if (num <= 0xffff) {
                    tag = 0xCD;
                }
                else {
                    tag = 0xCE;
                }
            }
            else {
                if (-0x7f <= num) {
                    tag = 0xD0;
                }
                else if (-0x7fff <= num) {
                    tag = 0xD1;
                }
                else {
                    tag = 0xD2;
                }
            }
        }
        let fmt = tagFormat(tag);
        if (buf) {
            buf[offset] = tag;
            buf.setNumber(fmt, offset + 1, num);
        }
        return pins.sizeOf(fmt) + 1;
    }
    /**
     * Unpacks a buffer into a number array.
     */
    function unpackNumberArray(buf, offset = 0) {
        let res = [];
        while (offset < buf.length) {
            let fmt = tagFormat(buf[offset++]);
            if (fmt === null) {
                let v = buf.getNumber(NumberFormat.Int8BE, offset - 1);
                if (-31 <= v && v <= 127)
                    res.push(v);
                else
                    return null;
            }
            else {
                res.push(buf.getNumber(fmt, offset));
                offset += pins.sizeOf(fmt);
            }
            // padding at the end
            while (buf[offset] === 0xc1)
                offset++;
        }
        return res;
    }
    msgpack.unpackNumberArray = unpackNumberArray;
    /**
     * Pack a number array into a buffer.
     * @param nums the numbers to be packed
     */
    function packNumberArray(nums) {
        let off = 0;
        for (let n of nums) {
            off += packNumberCore(null, off, n);
        }
        let buf = Buffer.create(off);
        off = 0;
        for (let n of nums) {
            off += packNumberCore(buf, off, n);
        }
        return buf;
    }
    msgpack.packNumberArray = packNumberArray;
})(msgpack || (msgpack = {}));

 return {settings,msgpack};
 },
 initializeBackend(pxsim) {
 const settings={};
        let currSize = 0;
        const MAX_SIZE = 16 * 1024;
        function encodeKey(key) {
            return "S/" + key;
        }
        function allKeys() {
            const pref = encodeKey("");
            const st = pxsim.board().storedState;
            return Object.keys(st).filter(k => k.slice(0, pref.length) == pref);
        }
        function userKeys() {
            return allKeys().filter(s => s[2] != "#");
        }
        function computeSize() {
            let sz = 0;
            const storage = pxsim.board().storedState;
            for (let k of allKeys()) {
                sz += k.length + storage[k].length;
            }
            currSize = sz;
        }
        function _set(key, buf) {
            key = encodeKey(key);
            const storage = pxsim.board().storedState;
            const prev = storage[key];
            const val = btoa(pxsim.U.uint8ArrayToString(buf.data));
            const newSize = prev == null
                ? currSize + key.length + val.length
                : currSize + val.length - prev.length;
            if (newSize > MAX_SIZE)
                return -1;
            pxsim.board().setStoredState(key, val);
            currSize = newSize;
            return 0;
        }
        settings._set = _set;
        function _remove(key) {
            key = encodeKey(key);
            const storage = pxsim.board().storedState;
            if (storage[key] == null)
                return -1;
            currSize -= key.length + storage[key].length;
            pxsim.board().setStoredState(key, null);
            return 0;
        }
        settings._remove = _remove;
        function _exists(key) {
            return _get(key) != undefined;
        }
        settings._exists = _exists;
        function _get(key) {
            key = encodeKey(key);
            const storage = pxsim.board().storedState;
            const val = storage[key];
            if (val == null)
                return undefined;
            return new pxsim.RefBuffer(pxsim.U.stringToUint8Array(atob(val)));
        }
        settings._get = _get;
        function _userClean() {
            for (let k of userKeys())
                pxsim.board().setStoredState(k, null);
            computeSize();
            // if system keys take more than 25% of space, delete everything
            if (currSize > MAX_SIZE / 4) {
                for (let k of allKeys())
                    pxsim.board().setStoredState(k, null);
                computeSize();
            }
        }
        settings._userClean = _userClean;
        function _list(prefix) {
            const r = new pxsim.RefCollection();
            const emptyPref = encodeKey("");
            for (let k of prefix[0] == "#" ? allKeys() : userKeys()) {
                const n = k.slice(emptyPref.length);
                if (n.slice(0, prefix.length) != prefix)
                    continue;
                r.push(n);
            }
            return r;
        }
        settings._list = _list;
 // Restore capacity accounting for the retained per-program device snapshot.
 computeSize();
 return settings;
 }
};
