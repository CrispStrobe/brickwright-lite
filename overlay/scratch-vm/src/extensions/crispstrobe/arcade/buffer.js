// A bounded byte-array facade over original PXT simulator Buffer algorithms.
// Uint8Array identity/storage is retained for the mixer and image host adapters.
const {RefBuffer, methods} = require('./buffer-pxt')();
const MAX_BUFFER_BYTES = 1024 * 1024;
const format = value => typeof value === 'string' ? methods.NumberFormat[value] : value;

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
    _reference() {return new RefBuffer(new Uint8Array(this.buffer, this.byteOffset, this.length));}
    getNumber(type, offset) {return methods.getNumber(this._reference(), format(type), offset);}
    setNumber(type, offset, value) {methods.setNumber(this._reference(), format(type), offset, value);}
    getByte(offset) {return methods.getByte(this._reference(), offset);}
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

module.exports = {PxtBuffer, NumberFormat: methods.NumberFormat, MAX_BUFFER_BYTES};
