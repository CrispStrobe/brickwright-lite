/**
 * What licence each MakeCode firmware base is under, and whether the EMULATOR
 * may run it.
 *
 * A "base" is the precompiled C++ runtime pxt links a program onto
 * (pxt-runtime.js). Downloading one to a real board is one thing: every vendor
 * clause below is met by what the file is FOR — firmware flashed onto that
 * vendor's chip. Emulating one is another. lite's emulator (labwired) executes
 * the image on something that is not the vendor's chip, and its debugger
 * disassembles it, and several of these images carry code whose licence allows
 * neither:
 *   - Nordic SoftDevice / MBR / bootloader (micro:bit V2: S113 at 0x1000, the
 *     MBR at 0, the bootloader at 0x77000; micro:bit V1 and Calliope mini: S110
 *     v8 at 0x1000, MBR at 0, bootloader at 0x3C000) — nRF5 SDK licence
 *     "4. ... must only be used with a Nordic Semiconductor ASA integrated
 *     circuit. 5. Any software provided in binary form under this license must
 *     not be reverse engineered, decompiled, modified and/or disassembled.";
 *     S110 Licence Agreement "to use the SoftDevice solely in connection with a
 *     Nordic integrated circuit" and "shall not ... disassemble".
 *   - Microchip/Atmel ASF4 (SAMD51) — "may only be redistributed and used in
 *     connection with an Atmel microcontroller product".
 *   - Raspberry Pi Pico double_v1_rom_shim.S (RP2040) — "a non-exclusive license
 *     to use the software solely on a Raspberry Pi Pico device" (or GPLv2; it
 *     is BSD-3-Clause upstream since pico-sdk 73e71969, but the codal-rp2040
 *     pin predates that).
 * The owner's rule: the emulator never executes or disassembles such code. So
 * every base is classified here by the sha256 of its BYTES — not pxt's sha,
 * which names the build REQUEST and is the same for Microsoft's build and ours —
 * and emulatorBaseVerdict() refuses anything that is not 'clean', by name.
 *
 *   clean            built from source with the licence gate
 *                    (scripts/makecode/firmware-licence-gate.mjs) passing on its
 *                    linker map: no chip-restricted byte in the image.
 *   chip-restricted  carries the named component.
 *   unaudited        no linker map was examined (a cloud build, or not gated
 *                    yet) — refused like chip-restricted: an unproven base does
 *                    not run.
 *
 * The official bases stay the DOWNLOAD path; nothing here touches it.
 */

const NORDIC_V2 = 'Nordic S113 SoftDevice (0x1000-0x1B3FF), MBR (0x0-0xAFF) and bootloader (0x77000)';
const NORDIC_V1 = 'Nordic S110 v8 SoftDevice (0x1000-0x16917), MBR (0x0-0x7BF) and bootloader (0x3C000)';
const NRF5_LICENCE = 'nRF5 SDK licence: "must only be used with a Nordic Semiconductor ASA integrated circuit"; binaries "must not be reverse engineered, decompiled, modified and/or disassembled"';
const S110_LICENCE = 'S110 Licence Agreement: "to use the SoftDevice solely in connection with a Nordic integrated circuit"; no disassembly';
const ASF4 = 'Microchip/Atmel ASF4 (via codal-samd)';
const ASF4_LICENCE = 'Atmel licence: "may only be redistributed and used in connection with an Atmel microcontroller product"';
const PICO_SHIM = 'Raspberry Pi Pico double_v1_rom_shim.S (via codal-rp2040\'s pico-sdk)';
const PICO_SHIM_LICENCE = '"a non-exclusive license to use the software solely on a Raspberry Pi Pico device" (or GPLv2)';
const NORDIC_UICR = 'Nordic codal-microbit-v2 lib/uicr.o record (8 bytes at 0x10001014: bootloader and MBR-params addresses)';

/**
 * Every base lite can serve, by sha256 of the served .hex bytes.
 * {target, base, source, classification, component?, licence?}
 */
export const BASE_LICENCES = Object.freeze({
    // micro:bit — pxt-microbit 9.1.1 built/hexcache (Microsoft's cloud builds, shipped in the npm tarball).
    '648fece987592f8530ec321b91c562c93379d2a59e2e601374629417c8f35ef1': {target: 'microbit', base: 'V2 {core, radio, microphone}', source: 'pxt-microbit 9.1.1 hexcache (354b97da…)', classification: 'chip-restricted', component: NORDIC_V2, licence: NRF5_LICENCE},
    'a5c187b6772222173376ca5ce42e003c59f21563c95ce12fe2b4eb13984313d8': {target: 'microbit', base: 'V2 {core, bluetooth, microphone}', source: 'pxt-microbit 9.1.1 hexcache (8b83cd59…)', classification: 'chip-restricted', component: NORDIC_V2, licence: NRF5_LICENCE},
    'bb04445c25e8c1cba8d291de1c646fa22608276673625aedc6941787a73245c0': {target: 'microbit', base: 'V1 {core, radio, microphone}', source: 'pxt-microbit 9.1.1 hexcache (949fbd03…)', classification: 'chip-restricted', component: NORDIC_V1, licence: S110_LICENCE},
    '72b52b93ac20d0d7e2e54873333cb9da374a4bb2a9a280315e96a24bdc35bea0': {target: 'microbit', base: 'V1 {core, bluetooth, microphone}', source: 'pxt-microbit 9.1.1 hexcache (4cc31a5b…)', classification: 'chip-restricted', component: NORDIC_V1, licence: S110_LICENCE},
    // micro:bit — OUR emulator bases (scripts/build-makecode-emu-bases.mjs; pinned in sync-makecode-runtime.mjs EMU_BASES).
    '93892ba327fc49240cdbad3cc3b53358765467fb1d06f47a98a32fb0242a910e': {target: 'microbit', base: 'V2 {core, radio}, Bluetooth-free', source: 'built from source (137d8c97…)', classification: 'clean'},
    '9c5e1cc82148ebe4d825ce7134a61a81fe577a46b64eefb6dc8d3b798f683e53': {target: 'microbit', base: 'V2 {core, radio, microphone}, Bluetooth-free', source: 'built from source (354b97da…)', classification: 'clean'},
    // Calliope mini — pxt-calliope 3.0.30 built/hexcache (DAL on nRF51822; served on the makecode-boards lane).
    '9b17c978b6bf230e5fcc0ecbc521c757eedf4ec09610a4869c9ee7fab720cb36': {target: 'calliopemini', base: '02a9349f…', source: 'pxt-calliope 3.0.30 hexcache', classification: 'chip-restricted', component: NORDIC_V1, licence: S110_LICENCE},
    'c209b8cebbdaddab759654707957a58dfd721963794788c5c68ca0db6446943d': {target: 'calliopemini', base: 'bd5886ba…', source: 'pxt-calliope 3.0.30 hexcache', classification: 'chip-restricted', component: NORDIC_V1, licence: S110_LICENCE},
    // LEGO EV3 — MakeCode's cloud build (cdn.makecode.com/compile/9630f4e8….hex), an ARM Linux ELF
    // for the brick. Its sources and the decoded ELF were inspected 2026-09-25 (pxt MIT, glibc start
    // files under their linking exception, no vendor code) but no LINKER MAP was, so: unaudited.
    '39cd6ff7e0b2b1db2018470f881053e8f13bc05148ffb1b7c9178c74b22e5fec': {target: 'ev3', base: '{ev3}', source: 'MakeCode CDN (9630f4e8…)', classification: 'unaudited'},
    // Circuit Playground Express — MakeCode's cloud build (1a8dde8a…), codal-samd on SAMD21: its source
    // set (codal-circuit-playground v2.0.4, codal-samd 5bd6b93) links 14 ASF4 samd21 files.
    'a3fa24bbf0c37ffce26e3e62713fc24517cb0d99c8e15e11e713ba2f20740297': {target: 'adafruit', base: '{circuit-playground}', source: 'MakeCode CDN (1a8dde8a…)', classification: 'chip-restricted', component: ASF4, licence: ASF4_LICENCE},
    // Arcade — MakeCode's cloud builds (cdn.makecode.com/compile/<sha>.hex).
    '9055c740a7282afe5ecf1b151a0f1cc4d0cb48c09d4e9e32472c056b889c0daf': {target: 'arcade', base: 'rp2040', source: 'MakeCode CDN', classification: 'chip-restricted', component: PICO_SHIM, licence: PICO_SHIM_LICENCE},
    'e07518572d4c43f77d90eef6c7c76878daf3940ec16201319aab8b013f890166': {target: 'arcade', base: 'samd51', source: 'MakeCode CDN', classification: 'chip-restricted', component: ASF4, licence: ASF4_LICENCE},
    '842c30c5fc1db2346a949837c2e21acdb57937aa0a82f4d505725e995ff02b97': {target: 'arcade', base: 'samd51adafruit', source: 'MakeCode CDN', classification: 'chip-restricted', component: ASF4, licence: ASF4_LICENCE},
    'd2c9e20091c3e27ff38fb279fe89b169ea430c4b64023181e8924d41d601ee1d': {target: 'arcade', base: 'stm32f401', source: 'MakeCode CDN', classification: 'unaudited'},
    '7c3cf6220ffe6ee325c19c96ce6103e69b2e0735127f9ff1e7110889f3bbbd25': {target: 'arcade', base: 'n3', source: 'MakeCode CDN', classification: 'unaudited'},
    '285daaa7bb94e3de58808e0a167e9fad9ccad87089812d8b7159f37ff4ee798f': {target: 'arcade', base: 'gdk', source: 'MakeCode CDN', classification: 'unaudited'},
    'b5d63295e30ad891835adfcb7b7b381c8905aab39d3f6b9916bcf34fbff4756c': {target: 'arcade', base: 'n4', source: 'MakeCode CDN', classification: 'unaudited'},
    // Arcade — our from-source builds (scripts/build-makecode-arcade-bases.mjs). Linker maps audited 2026-09-25.
    'ac1e891bd6d451ca83e97f452f97050cb07322ba6c7d75af88ab761bd323fd2f': {target: 'arcade', base: 'rp2040', source: 'built from source', classification: 'chip-restricted', component: PICO_SHIM, licence: PICO_SHIM_LICENCE},
    '5d617fdaa6d88466c23ef8e9c708ecf2495df165b6a23bbf53c658bb08c6357f': {target: 'arcade', base: 'samd51', source: 'built from source', classification: 'chip-restricted', component: ASF4, licence: ASF4_LICENCE},
    '9c2310bd5a65f0543c69a076e51a4067c803202a39228f3a7de41451be0da9ca': {target: 'arcade', base: 'samd51adafruit', source: 'built from source', classification: 'chip-restricted', component: ASF4, licence: ASF4_LICENCE},
    '446ba6c78a13b43335f68a54b3c53413b37e67c7bb12c18ceea8dfe3128ec560': {target: 'arcade', base: 'stm32f401', source: 'built from source', classification: 'unaudited'},
    'f27c91352f8208869ae9e8bb5479a258127e1d4b005df9cf780974ce737b8455': {target: 'arcade', base: 'n3', source: 'built from source', classification: 'chip-restricted', component: NORDIC_UICR, licence: NRF5_LICENCE},
    '6d120bcf68a9aae42f81aa40092dd57122c2cfa673426a68e0f22fffbed32cca': {target: 'arcade', base: 'gdk', source: 'built from source', classification: 'chip-restricted', component: NORDIC_UICR, licence: NRF5_LICENCE}
});

/** The licence record of a base, by the sha256 of its bytes (null: unknown bytes). */
export function baseLicence (sha256) {
    return BASE_LICENCES[String(sha256 || '').toLowerCase()] || null;
}

/**
 * May the EMULATOR run this base? {ok: true, licence} or
 * {ok: false, code, reason} — code 'CHIP_RESTRICTED_BASE' names the component
 * and its licence; 'UNAUDITED_BASE' / 'UNKNOWN_BASE' say why there is no proof
 * it is clean. Only 'clean' passes.
 */
export function emulatorBaseVerdict (sha256) {
    const l = baseLicence(sha256);
    if (!l) {
        return {ok: false, code: 'UNKNOWN_BASE',
            reason: `firmware base ${sha256} is not classified in base-licences.js — the emulator runs only bases proven clean`};
    }
    if (l.classification === 'clean') return {ok: true, licence: l};
    if (l.classification === 'chip-restricted') {
        return {ok: false, code: 'CHIP_RESTRICTED_BASE', licence: l,
            reason: `the ${l.target} ${l.base} base (${l.source}) contains ${l.component}, licensed for use only with the vendor's chip ` +
                `(${l.licence}) — it is for downloading to a real board; the emulator runs the Bluetooth-free bases built from source`};
    }
    return {ok: false, code: 'UNAUDITED_BASE', licence: l,
        reason: `the ${l.target} ${l.base} base (${l.source}) has not been audited for chip-restricted code — the emulator runs only bases proven clean`};
}
