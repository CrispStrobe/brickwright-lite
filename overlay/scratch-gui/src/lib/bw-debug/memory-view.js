/** Memory presentation policy. Capabilities describe a bus domain, not RAM. */
export function memorySpaces (capabilities, legacy, spacesDeclared = !!capabilities) {
    if (!capabilities && spacesDeclared) return [];
    // Absence evidence cannot override known normalized bounds or permissions.
    const knownSpaces = capabilities && capabilities.spaces;
    if (!spacesDeclared && (!knownSpaces || Object.keys(knownSpaces).length === 0)) return legacy.map(spec => ({...spec,
        addressMin: spec.base || 0, addressMax: (spec.base || 0) + spec.size - 1,
        maxReadBytes: 128, writable: true, explicit: false}));
    return legacy.flatMap(spec => {
        const descriptor = capabilities.spaces && capabilities.spaces[spec.id];
        if (!descriptor || descriptor.read !== true) return [];
        const explicit = Object.prototype.hasOwnProperty.call(descriptor, 'addressSpace');
        return [{...spec,
            addressMin: explicit ? descriptor.addressMin : spec.base || 0,
            addressMax: explicit ? descriptor.addressMax : (spec.base || 0) + spec.size - 1,
            maxReadBytes: explicit ? descriptor.maxReadBytes : 128,
            writable: descriptor.write === true || descriptor.write === 'curated',
            explicit}];
    });
}

export function memoryPage (spec, page = 0) {
    if (!spec || !Number.isSafeInteger(page) || page < 0) return null;
    const size = Math.min(128, spec.maxReadBytes);
    const pages = Math.ceil((spec.addressMax - spec.addressMin + 1) / size);
    if (page >= pages) return null;
    const start = spec.addressMin + page * size;
    return {start, length: Math.min(size, spec.addressMax - start + 1), pages, page};
}

export function memoryJump (spec, text) {
    if (!spec || typeof text !== 'string' || !/^(?:0x)?[0-9a-f]+$/i.test(text.trim())) return null;
    const address = Number.parseInt(text.trim().replace(/^0x/i, ''), 16);
    if (!Number.isSafeInteger(address) || address < spec.addressMin || address > spec.addressMax) return null;
    return Math.floor((address - spec.addressMin) / Math.min(128, spec.maxReadBytes));
}

export function readMemoryPage (runner, spec, page) {
    const request = memoryPage(spec, page);
    if (!request) return {bytes: [], error: 'Memory address is outside the declared space'};
    try {
        const value = runner.readMem(spec.id, request.start, request.length);
        if (value && (value.unsupported || value.refused)) {
            return {...request, bytes: [], error: String(value.unsupported || value.refused)};
        }
        if (!(Array.isArray(value) || value instanceof Uint8Array) || value.length !== request.length ||
            !Array.from(value).every(byte => Number.isInteger(byte) && byte >= 0 && byte <= 255)) {
            return {...request, bytes: [], error: 'Memory read refused or incomplete'};
        }
        return {...request, bytes: Array.from(value), error: null};
    } catch (error) {
        return {...request, bytes: [], error: error && error.message ? error.message : 'Memory read refused'};
    }
}

export function formatMemoryAddress (address, spec) {
    return address.toString(16).toUpperCase().padStart(spec && spec.explicit ? 8 : 4, '0');
}


// Rechecked after asynchronous prompts: the original target/capability session
// must still be current. A new normalized descriptor cannot inherit old rights.
export function memorySessionCurrent (expected, current) {
    return current.mounted !== false && expected.runner === current.runner &&
        expected.capabilities === current.capabilities && expected.spacesDeclared === current.spacesDeclared;
}

export function memoryWritable (spec, phase) {
    return !!spec && spec.writable && !['running', 'stepping', 'building', 'attaching'].includes(phase);
}


// Raw capabilities contribute declaration presence only, never bounds or rights.
export function memorySpacesDeclared (raw) {
    return !!raw && typeof raw === 'object' && 'spaces' in raw;
}
