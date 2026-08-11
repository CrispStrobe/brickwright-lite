// Board sidecars use 2.54 mm artwork coordinates (8 units per pin pitch).
// The circuit canvas uses 20 world units per breadboard hole. Keep this
// conversion in one place so the drawing, terminals, hit tests and router
// cannot silently disagree about MCU size.
export const BOARD_PIN_PITCH = 20;
export const SIDE_ART_PIN_PITCH = 8;

export function boardGeometry(sidecar) {
  if (!sidecar || !sidecar.w || !sidecar.h) return null;
  const scale = BOARD_PIN_PITCH / SIDE_ART_PIN_PITCH;
  return {scale, w: sidecar.w * scale, h: sidecar.h * scale};
}
