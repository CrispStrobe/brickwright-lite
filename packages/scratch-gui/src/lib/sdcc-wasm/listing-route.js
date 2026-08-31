/**
 * Route the Code tab's generated listing without conflating it with editable
 * assembly. Supported 8051 targets stay in-browser; every other architecture
 * retains the explicitly hosted compiler service.
 */

const LOCAL_8051_TARGETS = new Set([
    'stc12c5a60s2', 'stc12c2052ad', 'stc12c5202ad', 'stc89c52rc', 'stc15f2k60s2'
]);

export const compileTargetForDevice = deviceId => ({
    'arduino-nano': 'atmega328p',
    'arduino-uno': 'atmega328p',
    'atmega328p': 'atmega328p',
    'atmega168p': 'atmega168p',
    'arduino-mega': 'atmega2560',
    'pico': 'rp2040',
    'stm32f030': 'stm32f030',
    'eater6502': 'eater6502'
}[String(deviceId || '').toLowerCase()] || String(deviceId || 'stc12c5a60s2').toLowerCase());

export async function requestGeneratedListing ({code, deviceId, fosc}, {
    compileLocal,
    hostedFetch = globalThis.fetch
}) {
    const target = compileTargetForDevice(deviceId);
    if (LOCAL_8051_TARGETS.has(target)) {
        const out = await compileLocal(code, {target, fosc, disassemble: true});
        if (!out.success) throw new Error(out.error || 'the local compiler refused this program');
        if (!out.listing?.asm) throw new Error('the local compiler returned no linked listing');
        return out;
    }

    const response = await hostedFetch('https://stc-compiler.vercel.app/compile', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
            code,
            language: 'c',
            target,
            format: target === 'rp2040' || target === 'stm32f030' ? 'bin' : 'ihx',
            disassemble: true
        })
    });
    const out = await response.json();
    if (!out.success) throw new Error(out.error || 'the hosted compiler refused this program');
    return out;
}
