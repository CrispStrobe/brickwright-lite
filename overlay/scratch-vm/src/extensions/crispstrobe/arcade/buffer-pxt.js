// Generated from pxt-core13.2.1 simulator buffer algorithms (MIT).
// Copyright (c) Microsoft Corporation. See static/licenses/pxt-core.MIT.txt.
// Source: https://github.com/microsoft/pxt/tree/v13.2.1/pxtsim
// Extracted algorithm SHA256: b025f928a8ab0f0b942afe55beb31c7b817956158257017c1c5868f8ba8fa549
// Regenerate: node scripts/generate-arcade-buffers.mjs
module.exports = function initializePxtBuffers() {
const e = {RefObject: class {}, U: {
    userError(message) {throw new Error(message);},
    fromUTF8Array(bytes) {return new TextDecoder().decode(bytes);}
}, throwFailedCastError(_value, type) {throw new TypeError('Expected ' + type);}};
const a = {typeCheck(value) {if (typeof value !== 'string') throw new TypeError('Expected string');}};
let u;
class c extends e.RefObject {
    constructor(e) { super(), this.data = e, this.isStatic = !1; }
    scan(e) { }
    gcKey() { return "Buffer"; }
    gcSize() { return 2 + (this.data.length + 3 >> 2); }
    gcIsStatic() { return this.isStatic; }
    print() { }
    toDebugString() { return u.toHex(this); }
}
e.RefBuffer = c, function (t) { let n; function s(t) { let s = function (t) { switch (t) {
    case n.Int8LE: return -1;
    case n.UInt8LE: return 1;
    case n.Int16LE: return -2;
    case n.UInt16LE: return 2;
    case n.Int32LE: return -4;
    case n.UInt32LE: return 4;
    case n.Int8BE: return -10;
    case n.UInt8BE: return 10;
    case n.Int16BE: return -20;
    case n.UInt16BE: return 20;
    case n.Int32BE: return -40;
    case n.UInt32BE: return 40;
    case n.Float32LE: return 4;
    case n.Float32BE: return 40;
    case n.Float64LE: return 8;
    case n.Float64BE: return 80;
    default: throw e.U.userError("bad format");
} }(t), i = !1; s < 0 && (i = !0, s = -s); let r = !1; return s >= 10 && (r = !0, s /= 10), { size: s, signed: i, swap: r, isFloat: t >= n.Float32LE }; } function i(e) { return new c(new Uint8Array(e)); } function r(e, t) { return 0 <= t && t < e.data.length; } function o(e, t) { return f(e), r(e, t) ? e.data[t] : 0; } function l(t) { t.isStatic && e.U.userError("Writing to read only buffer."); } function u(e, t, n) { f(e), r(e, t) && (l(e), e.data[t] = n); } function d(e, t, n = 0, s = -1) { f(e), n < 0 || n > e.data.length || (s < 0 && (s = e.data.length), s = Math.min(s, e.data.length - n), l(e), e.data.fill(t, n, n + s)); } function h(e, t, n, s, i) { if (n.buffer === e.buffer)
    h(e, t, n.slice(s, s + i), 0, i);
else
    for (let r = 0; r < i; ++r)
        e[t + r] = n[s + r]; } !function (e) { e[e.Int8LE = 1] = "Int8LE", e[e.UInt8LE = 2] = "UInt8LE", e[e.Int16LE = 3] = "Int16LE", e[e.UInt16LE = 4] = "UInt16LE", e[e.Int32LE = 5] = "Int32LE", e[e.Int8BE = 6] = "Int8BE", e[e.UInt8BE = 7] = "UInt8BE", e[e.Int16BE = 8] = "Int16BE", e[e.UInt16BE = 9] = "UInt16BE", e[e.Int32BE = 10] = "Int32BE", e[e.UInt32LE = 11] = "UInt32LE", e[e.UInt32BE = 12] = "UInt32BE", e[e.Float32LE = 13] = "Float32LE", e[e.Float64LE = 14] = "Float64LE", e[e.Float32BE = 15] = "Float32BE", e[e.Float64BE = 16] = "Float64BE"; }(n = t.NumberFormat || (t.NumberFormat = {})), t.fmtInfo = s, t.getNumber = function (e, t, n) { f(e); let i = s(t); if (i.isFloat) {
    let t = e.data.buffer.slice(n, n + i.size);
    if (i.swap) {
        new Uint8Array(t).reverse();
    }
    return 4 == i.size ? new Float32Array(t)[0] : new Float64Array(t)[0];
} let r = 0; for (let t = 0; t < i.size; ++t) {
    r <<= 8;
    let s = i.swap ? n + t : n + i.size - t - 1;
    r |= e.data[s];
} if (i.signed) {
    let e = 32 - 8 * i.size;
    r = r << e >> e;
}
else
    r >>>= 0; return r; }, t.setNumber = function (e, t, n, i) { f(e); let r = s(t); if (r.isFloat) {
    let t = new Uint8Array(r.size);
    4 == r.size ? new Float32Array(t.buffer)[0] = i : new Float64Array(t.buffer)[0] = i, r.swap && t.reverse();
    for (let s = 0; s < r.size; ++s)
        e.data[n + s] = t[s];
    return;
} for (let t = 0; t < r.size; ++t) {
    let s = r.swap ? n + r.size - t - 1 : n + t;
    e.data[s] = 255 & i, i >>= 8;
} }, t.createBuffer = i, t.createBufferFromHex = function (e) { a.typeCheck(e); let t = i(e.length >> 1); for (let n = 0; n < e.length; n += 2)
    t.data[n >> 1] = parseInt(e.slice(n, n + 2), 16); return t.isStatic = !0, t; }, t.isReadOnly = function (e) { return f(e), e.isStatic; }, t.getBytes = function (e) { return f(e), e.data; }, t.getUint8 = function (e, t) { return f(e), o(e, t); }, t.getByte = o, t.setUint8 = function (e, t, n) { f(e), u(e, t, n); }, t.setByte = u, t.length = function (e) { return f(e), e.data.length; }, t.fill = d, t.slice = function (e, t, n) { return f(e), t = Math.min(e.data.length, t), n < 0 && (n = e.data.length), n = Math.min(n, e.data.length - t), new c(e.data.slice(t, t + n)); }, t.toHex = function (e) { f(e); const t = "0123456789abcdef"; let n = ""; for (let s = 0; s < e.data.length; ++s)
    n += t[e.data[s] >> 4], n += t[15 & e.data[s]]; return n; }, t.toString = function (t) { return f(t), e.U.fromUTF8Array(t.data); }; const p = -2147483648; function f(t) { t instanceof c || e.throwFailedCastError(t, "Buffer"); } t.shift = function (e, t, n, s) { f(e), s < 0 && (s = e.data.length - n), n < 0 || n + s > e.data.length || n + s < n || 0 == s || 0 == t || t == p || 0 != s && 0 != t && t != p && (t <= -s || t >= s ? d(e, 0) : (l(e), t < 0 ? (t = -t, h(e.data, n + t, e.data, n, s - t), e.data.fill(0, n, n + t)) : (s -= t, h(e.data, n, e.data, n + t, s), e.data.fill(0, n + s, n + s + t)))); }, t.rotate = function (e, t, n, s) { if (f(e), s < 0 && (s = e.data.length - n), n < 0 || n + s > e.data.length || n + s < n || 0 == s || 0 == t || t == p)
    return; l(e), t < 0 && (t += s << 8), (t %= s) < 0 && (t += s); let i = e.data, r = t, o = 0, a = r, u = s; for (; o != a;) {
    let e = i[o + n];
    i[o++ + n] = i[a + n], i[a++ + n] = e, a == u ? a = r : o == r && (r = a);
} }, t.write = function (e, t, n, s = 0, i = -1) { f(e), f(n), i < 0 && (i = n.data.length), s < 0 || t < 0 || t > e.data.length || (i = Math.min(n.data.length - s, e.data.length - t)) < 0 || (l(e), h(e.data, t, n.data, s, i)); }, t.typeCheck = f; }(u = e.BufferMethods || (e.BufferMethods = {}));

return {RefBuffer: e.RefBuffer, methods: e.BufferMethods};
};
