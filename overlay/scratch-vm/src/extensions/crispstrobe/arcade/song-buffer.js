// Validate the documented PXT mixer/instrument.ts song stream before its decoder
// reads it. Keep the original bytes: this is a boundary check, not a repair.
module.exports = function validateSongBuffer (bytes) {
    const fail = message => { throw new RangeError(`Invalid Arcade song: ${message}`); };
    if (!(bytes instanceof Uint8Array) || typeof bytes.getNumber !== 'function') fail('expected a PXT buffer');
    const need = (offset, count, end = bytes.length) => {
        if (offset < 0 || offset + count > end) fail(`truncated data at byte ${offset}`);
    };
    const u16 = offset => { need(offset, 2); return bytes[offset] | (bytes[offset + 1] << 8); };
    need(0, 7);
    if (bytes[0] !== 0) fail(`unsupported version ${bytes[0]}`);
    if (!u16(1) || !bytes[3] || !bytes[4] || !bytes[5]) fail('tempo and song dimensions must be positive');
    const ticks = bytes[3] * bytes[4] * bytes[5];
    let offset = 7;
    for (let track = 0; track < bytes[6]; track++) {
        need(offset, 4);
        const flags = bytes[offset + 1];
        if (flags !== 0 && flags !== 1) fail(`unsupported track flags ${flags}`);
        const instrumentLength = u16(offset + 2);
        const instrumentStart = offset + 4;
        const instrumentEnd = instrumentStart + instrumentLength;
        need(instrumentStart, instrumentLength);
        let drumCount = 0;
        const drumSteps = [];
        if (!flags) {
            if (instrumentLength < 28) fail('melodic instrument is shorter than 28 bytes');
        } else {
            let drum = instrumentStart;
            while (drum < instrumentEnd) {
                need(drum, 5, instrumentEnd);
                const steps = bytes[drum];
                need(drum, 5 + steps * 7, instrumentEnd);
                drumSteps.push(steps);
                drumCount++;
                drum += 5 + steps * 7;
            }
        }
        const eventLength = u16(instrumentEnd);
        const eventEnd = instrumentEnd + 2 + eventLength;
        need(instrumentEnd + 2, eventLength);
        let event = instrumentEnd + 2;
        let previousTick = -1;
        while (event < eventEnd) {
            need(event, 5, eventEnd);
            const start = u16(event), end = u16(event + 2), polyphony = bytes[event + 4];
            if (start <= previousTick || start >= ticks || end < start || end > ticks) fail('invalid note event ticks');
            need(event + 5, polyphony, eventEnd);
            if (flags) {
                for (let note = 0; note < polyphony; note++) {
                    const index = bytes[event + 5 + note] & 63;
                    if (index >= drumCount || !drumSteps[index]) fail('note references an absent or empty drum');
                }
            }
            previousTick = start;
            event += 5 + polyphony;
        }
        offset = eventEnd;
    }
    if (offset !== bytes.length) fail('unconsumed trailing bytes');
    return bytes;
};
