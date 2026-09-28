/**
 * Turn a user/native-build artefact into the bytes and address LabWired loads.
 *
 * Intel HEX and UF2 are addressed containers. Throwing that address away is
 * harmless only when their first record happens to be at zero. In particular,
 * a PyBadge MakeCode UF2 normally starts at the bootloader application offset
 * (0x4000); loading those bytes at zero leaves both the vector table and every
 * absolute reference in the wrong place.
 */

const ELF_MAGIC = [0x7f, 0x45, 0x4c, 0x46];
const UF2_MAGIC0 = 0x0a324655;
const UF2_MAGIC1 = 0x9e5d5157;
const UF2_MAGIC_END = 0x0ab16f30;
const UF2_NOFLASH = 0x00000001;

const u32 = (bytes, at) => new DataView(
    bytes.buffer, bytes.byteOffset + at, 4).getUint32(0, true);

const hasMagic = (bytes, magic) => magic.every((b, i) => bytes[i] === b);

function uf2Image (bytes) {
    if (bytes.length < 512 || bytes.length % 512) {
        throw new Error('UF2 firmware must contain complete 512-byte blocks');
    }
    const blocks = [];
    for (let at = 0; at < bytes.length; at += 512) {
        if (u32(bytes, at) !== UF2_MAGIC0 || u32(bytes, at + 4) !== UF2_MAGIC1 ||
            u32(bytes, at + 508) !== UF2_MAGIC_END) {
            throw new Error(`UF2 block ${at / 512} has bad magic`);
        }
        const flags = u32(bytes, at + 8);
        if (flags & UF2_NOFLASH) continue;
        const address = u32(bytes, at + 12);
        const size = u32(bytes, at + 16);
        if (!size || size > 476) throw new Error(`UF2 block ${at / 512} has invalid payload size ${size}`);
        blocks.push({address, data: bytes.subarray(at + 32, at + 32 + size)});
    }
    if (!blocks.length) throw new Error('UF2 firmware has no flash blocks');
    blocks.sort((a, b) => a.address - b.address);
    const address = blocks[0].address;
    let end = address;
    for (const block of blocks) end = Math.max(end, block.address + block.data.length);
    const size = end - address;
    if (size > 4 * 1024 * 1024) throw new Error(`UF2 flash span ${size} is implausibly large`);
    const image = new Uint8Array(size).fill(0xff);
    for (const block of blocks) image.set(block.data, block.address - address);
    return {image, address};
}

function ihexImage (text, flashBytes) {
    const data = new Map();
    let upper = 0;
    let omitted = 0;
    for (const [index, raw] of String(text).split(/\r?\n/).entries()) {
        const line = raw.trim();
        if (!line) continue;
        if (!/^:[0-9a-f]+$/i.test(line) || line.length % 2 !== 1) {
            throw new Error(`Intel HEX line ${index + 1} is malformed`);
        }
        const octets = [];
        for (let i = 1; i < line.length; i += 2) octets.push(parseInt(line.slice(i, i + 2), 16));
        if (octets.length < 5 || octets[0] + 5 !== octets.length ||
            octets.reduce((sum, b) => (sum + b) & 0xff, 0) !== 0) {
            throw new Error(`Intel HEX line ${index + 1} has a bad length or checksum`);
        }
        const count = octets[0];
        const offset = (octets[1] << 8) | octets[2];
        const type = octets[3];
        if (type === 0) {
            for (let i = 0; i < count; i++) {
                const address = upper + offset + i;
                // nRF HEX files can carry UICR at 0x10001000. LabWired's
                // current loader has one PT_LOAD flash segment, so retain the
                // executable flash and omit configuration records explicitly.
                if (address < flashBytes) data.set(address, octets[4 + i]);
                else omitted++;
            }
        } else if (type === 1) {
            break;
        } else if (type === 2) {
            upper = ((octets[4] << 8) | octets[5]) << 4;
        } else if (type === 4) {
            upper = ((octets[4] << 8) | octets[5]) << 16;
        }
    }
    if (!data.size) throw new Error('Intel HEX firmware has no executable flash records');
    let end = 0;
    for (const at of data.keys()) end = Math.max(end, at + 1);
    const image = new Uint8Array(end).fill(0xff);
    for (const [at, byte] of data) image[at] = byte;
    return {image, address: 0, omitted};
}

/**
 * @param {{name?:string,bytes?:Uint8Array|null,text?:string|null}} firmware
 * @param {'microbit_v2'|'pybadge'|'stm32f030'|'arduino_uno'} chipKind
 * @returns {{image:Uint8Array,address?:number,format:string,omitted:number}}
 */
export function labwiredFirmwareImage (firmware, chipKind) {
    const bytes = firmware && firmware.bytes instanceof Uint8Array ? firmware.bytes : null;
    const text = firmware && typeof firmware.text === 'string' ? firmware.text : null;
    if (bytes && hasMagic(bytes, ELF_MAGIC)) return {image: bytes, format: 'elf', omitted: 0};
    if (bytes && bytes.length >= 8 && u32(bytes, 0) === UF2_MAGIC0 && u32(bytes, 4) === UF2_MAGIC1) {
        const out = uf2Image(bytes);
        return {...out, format: 'uf2', omitted: 0};
    }
    if ((text && /^\s*:/.test(text)) || (bytes && bytes[0] === 0x3a)) {
        const source = text || new TextDecoder().decode(bytes);
        const flashBytes = chipKind === 'microbit_v2' ? 512 * 1024 : 2 * 1024 * 1024;
        const out = ihexImage(source, flashBytes);
        return {...out, format: 'hex'};
    }
    if (bytes && bytes.length) {
        return {image: bytes, address: Number.isSafeInteger(firmware.address) ? firmware.address : 0,
            format: 'bin', omitted: 0};
    }
    throw new Error(`${firmware && firmware.name || 'firmware'} is empty or has an unsupported format`);
}
