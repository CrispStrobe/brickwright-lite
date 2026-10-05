// ID: Encoding
// Brickwright clean-room implementation of the Base64 project-file block.
// The public .sb3 block shape supplies its id, opcode and argument names.
// The algorithm is the standard RFC 4648 byte encoding, written here without
// loading or copying the TurboWarp extension's implementation.
const ArgumentType = require('../../../extension-support/argument-type');
const BlockType = require('../../../extension-support/block-type');

const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
function toBase64 (value) {
    const bytes = new TextEncoder().encode(String(value));
    let output = '';
    for (let i = 0; i < bytes.length; i += 3) {
        const a = bytes[i];
        const b = bytes[i + 1];
        const c = bytes[i + 2];
        output += alphabet[a >> 2];
        output += alphabet[((a & 3) << 4) | ((b || 0) >> 4)];
        output += i + 1 < bytes.length ? alphabet[((b & 15) << 2) | ((c || 0) >> 6)] : '=';
        output += i + 2 < bytes.length ? alphabet[c & 63] : '=';
    }
    return output;
}

function fromBase64 (value) {
    const text = String(value).replace(/\s/g, '');
    if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(text)) return '';
    const bytes = [];
    for (let i = 0; i < text.length; i += 4) {
        const a = alphabet.indexOf(text[i]);
        const b = alphabet.indexOf(text[i + 1]);
        const c = text[i + 2] === '=' ? 0 : alphabet.indexOf(text[i + 2]);
        const d = text[i + 3] === '=' ? 0 : alphabet.indexOf(text[i + 3]);
        bytes.push((a << 2) | (b >> 4));
        if (text[i + 2] !== '=') bytes.push(((b & 15) << 4) | (c >> 2));
        if (text[i + 3] !== '=') bytes.push(((c & 3) << 6) | d);
    }
    try { return new TextDecoder('utf-8', {fatal: true}).decode(new Uint8Array(bytes)); }
    catch { return ''; }
}

class Encoding {
    getInfo () {
        const args = {string: {type: ArgumentType.STRING, defaultValue: 'hello'},
            code: {type: ArgumentType.STRING, menu: 'encode', defaultValue: 'Base64'}};
        return {id: 'Encoding', name: 'Encoding', color1: '#5375a7', blocks: [
            {opcode: 'encode', blockType: BlockType.REPORTER, text: 'encode [string] as [code]', arguments: args},
            {opcode: 'decode', blockType: BlockType.REPORTER, text: 'decode [string] as [code]', arguments: args}
        ], menus: {encode: {acceptReporters: true, items: ['Base64']}}};
    }
    encode (args) {
        if (String(args.code) !== 'Base64') throw new Error(`Encoding mode ${args.code} is not supported offline`);
        return toBase64(args.string);
    }
    decode (args) {
        if (String(args.code) !== 'Base64') throw new Error(`Encoding mode ${args.code} is not supported offline`);
        return fromBase64(args.string);
    }
}

module.exports = Encoding;
