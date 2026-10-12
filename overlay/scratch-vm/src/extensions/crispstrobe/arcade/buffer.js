// A bounded byte-array facade over original PXT simulator Buffer algorithms.
// Uint8Array identity/storage is retained for the mixer and image host adapters.
const {RefBuffer, methods} = require('./buffer-pxt')();
const MAX_BUFFER_BYTES = 1024 * 1024;
const format = value => typeof value === 'string' ?
    (typeof methods.NumberFormat[value] === 'number' ? methods.NumberFormat[value] : Number(value)) : value;

class PxtBuffer extends Uint8Array {
    constructor(...args) {
        const input = args[0];
        let length;
        if (input === undefined) length = 0;
        else if (typeof input === 'number') length = input;
        else if (input instanceof ArrayBuffer) length = args[2] === undefined ?
            input.byteLength - (args[1] || 0) : args[2];
        else if (Array.isArray(input) || ArrayBuffer.isView(input)) length = input.length;
        else throw new TypeError('Expected buffer size or byte storage');
        if (!Number.isFinite(length) || length < 0 || length > MAX_BUFFER_BYTES)
            throw new RangeError('Arcade buffer exceeds byte allocation limit');
        super(...args);
    }
    // A plain Uint8Array view prevents the original slice algorithm from
    // recursively invoking this facade's offset/length overload.
    _reference() {
        const ref = new RefBuffer(new Uint8Array(this.buffer, this.byteOffset, this.length));
        ref.isStatic = this.isStatic === true;
        return ref;
    }
    getNumber(type, offset) {return methods.getNumber(this._reference(), format(type), offset);}
    setNumber(type, offset, value) {methods.setNumber(this._reference(), format(type), offset, value);}
    getByte(offset) {return methods.getByte(this._reference(), offset);}
    isReadOnly() {return methods.isReadOnly(this._reference());}
    setByte(offset, value) {methods.setByte(this._reference(), offset, value);}
    slice(offset = 0, length = -1) {return new PxtBuffer(methods.slice(this._reference(), offset, length).data);}
    write(offset, source, sourceOffset = 0, length = -1) {
        methods.write(this._reference(), offset, source._reference(), sourceOffset, length);
    }
    fill(value, offset = 0, length = -1) {methods.fill(this._reference(), value, offset, length); return this;}
    shift(offset, start = 0, length = -1) {methods.shift(this._reference(), offset, start, length);}
    rotate(offset, start = 0, length = -1) {methods.rotate(this._reference(), offset, start, length);}
    toHex() {return methods.toHex(this._reference());}
    toString() {return methods.toString(this._reference());}
}

// Buffer.fromHex follows the original MIT base/buffer.ts helper, including its
// odd-length behavior. Copyright (c) Microsoft Corporation; retained common-
// packages notice: static/licenses/pxt-common-packages.MIT.txt.
const fromHex = text => {
    if (typeof text !== 'string') throw new TypeError('Expected hex string');
    if (text.length > MAX_BUFFER_BYTES * 2 + 1) throw new RangeError('Arcade buffer exceeds byte allocation limit');
    const out = new PxtBuffer(text.length >> 1), digits = '0123456789abcdef';
    text = text.toLowerCase();
    for (let i = 0; i < text.length; i += 2) {
        const high = digits.indexOf(text.charAt(i)), low = digits.indexOf(text.charAt(i + 1));
        if (high < 0 || low < 0) throw new Error('Invalid hex');
        out[i >> 1] = high << 4 | low;
    }
    return out;
};
// PXT control.createBufferFromUTF8 delegates to U.toUTF8Array/TextEncoder.
// Count the encoder's output first so oversized text cannot allocate byte storage.
const fromUTF8 = text => {
    if (typeof text !== 'string') throw new TypeError('Expected UTF8 text');
    if (text.length > MAX_BUFFER_BYTES) throw new RangeError('Arcade buffer exceeds byte allocation limit');
    let length = 0;
    for (let i = 0; i < text.length; i++) {
        const code = text.charCodeAt(i);
        if (code < 0x80) length++;
        else if (code < 0x800) length += 2;
        else if (code >= 0xd800 && code <= 0xdbff && i + 1 < text.length &&
            text.charCodeAt(i + 1) >= 0xdc00 && text.charCodeAt(i + 1) <= 0xdfff) {
            length += 4;
            i++;
        } else length += 3;
        if (length > MAX_BUFFER_BYTES) throw new RangeError('Arcade buffer exceeds byte allocation limit');
    }
    return new PxtBuffer(new TextEncoder().encode(text));
};
const literal = text => {
    const hex = String(text).replace(/\s/g, '');
    if (!/^(?:[0-9a-f]{2})*$/i.test(hex)) throw new Error('Invalid hexadecimal buffer literal');
    const bytes = fromHex(hex);
    Object.defineProperty(bytes, 'isStatic', {value: true});
    return bytes;
};

module.exports = {PxtBuffer, NumberFormat: methods.NumberFormat, MAX_BUFFER_BYTES, fromHex, fromUTF8, literal};
