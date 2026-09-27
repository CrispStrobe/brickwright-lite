// DOM MouseEvent.button uses middle=1/right=2; PS/2 uses right=2/middle=4.
export const ps2ButtonBit = button => [1, 4, 2][button] || 0;

// A standard three-byte PS/2 packet carries signed eight-bit motion. Leave
// one count of headroom for the guest's sign/overflow interpretation.
export const ps2Delta = value => Math.max(-127, Math.min(127, Math.round(value)));
