// Read-only USB descriptor inspection for the Tang Nano 20K.
//
// This module deliberately stops at properties WebUSB has already exposed. It
// never opens a device, selects a configuration, claims an interface, or sends
// a transfer. USB descriptors can identify the protocol a debugger presents;
// they cannot prove which physical chip implements that protocol.

const textOrNull = value => typeof value === 'string' && value.length ? value : null;

/** Copy the non-invasive identity fields exposed by a USBDevice. */
export function describeUsbDevice (device = {}) {
    return {
        vendorId: Number.isInteger(device.vendorId) ? device.vendorId : null,
        productId: Number.isInteger(device.productId) ? device.productId : null,
        manufacturerName: textOrNull(device.manufacturerName),
        productName: textOrNull(device.productName),
        serialNumber: textOrNull(device.serialNumber)
    };
}

/**
 * Identify the USB protocol that a descriptor is compatible with.
 *
 * The Tang Nano 20K debugger is observed as 0403:6010 and openFPGALoader uses
 * its FT2232 transport. That says nothing reliable about the silicon behind
 * the descriptor: an onboard MCU may emulate the same protocol and IDs.
 */
export function identifyTangNanoTransport (device) {
    const descriptor = describeUsbDevice(device);
    const evidence = [];
    if (descriptor.vendorId !== null) evidence.push(`VID ${hex(descriptor.vendorId)}`);
    if (descriptor.productId !== null) evidence.push(`PID ${hex(descriptor.productId)}`);
    if (descriptor.manufacturerName) evidence.push(`manufacturer ${descriptor.manufacturerName}`);
    if (descriptor.productName) evidence.push(`product ${descriptor.productName}`);

    if (descriptor.vendorId === 0x0403 && descriptor.productId === 0x6010) {
        return {match: 'compatible', protocol: 'ft2232-compatible', physicalBridge: 'unknown',
            descriptor, evidence};
    }
    // These appear in the existing picker, but neither identity alone proves a
    // Tang Nano 20K or the protocol its debugger presents.
    if ((descriptor.vendorId === 0x0403 && descriptor.productId === 0x6011) ||
        descriptor.vendorId === 0x33aa) {
        return {match: 'ambiguous', protocol: null, physicalBridge: 'unknown',
            descriptor, evidence};
    }
    return {match: 'unsupported', protocol: null, physicalBridge: 'unknown',
        descriptor, evidence};
}

/** Inspect devices for which this origin already has permission. Never prompts. */
export async function inspectGrantedUsbDevices (
    usb = (typeof navigator !== 'undefined' ? navigator.usb : null)
) {
    if (!usb || typeof usb.getDevices !== 'function') {
        return {ok: false, code: 'no-webusb',
            reason: 'This environment cannot enumerate already-authorized WebUSB devices.'};
    }
    try {
        const devices = await usb.getDevices();
        return {ok: true, devices: devices.map(identifyTangNanoTransport)};
    } catch (error) {
        return {ok: false, code: 'enumeration-failed',
            reason: error && error.message ? error.message : 'WebUSB device enumeration failed.'};
    }
}

const hex = value => `0x${value.toString(16).padStart(4, '0')}`;
