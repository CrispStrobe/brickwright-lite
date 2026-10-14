/** Add the enabled AT PS/2 mouse to the guest-visible RTC equipment word. */
export const withI80386MouseCmos = (chips, overrides = []) => chips.map(chip => {
    if (chip.kind !== 'rtc') return chip;
    const cmos = new Uint8Array(0x40);
    for (const [index, value] of chip.initialCmos) cmos[index] = value;
    for (const [index, value] of overrides) cmos[index] = value;
    // Windows checks the BIOS equipment word before using the auxiliary mouse.
    // The 386 config already enables the 8042 mouse hardware; advertise it too.
    cmos[0x14] = 0x05; // VGA plus PS/2 mouse, as in the accepted CLI replay.
    let checksum = 0;
    for (let index = 0x10; index <= 0x2d; index++) checksum = (checksum + cmos[index]) & 0xffff;
    cmos[0x2e] = checksum >>> 8;
    cmos[0x2f] = checksum & 0xff;
    return {...chip, initialCmos: [...cmos.entries()].filter(([, value]) => value !== 0)};
});
