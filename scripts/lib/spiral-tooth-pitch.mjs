// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
// Inspect repeated LDraw subpart placements; this is not a physical measurement.
export function repeatedToothPitch(text, subpart) {
 const groups = new Map();
 for (const line of text.split(/\r?\n/)) {
  const fields = line.trim().split(/\s+/);
  if (fields[0] !== '1' || fields.length !== 15 || fields[14].replaceAll('\\', '/').toLowerCase() !== subpart.toLowerCase()) continue;
  const values = fields.slice(2,14).map(Number);
  if (values.some(v => !Number.isFinite(v))) throw new Error('invalid LDraw transform');
  const [x,y,z,...matrix] = values;
  const key = JSON.stringify([y,z,...matrix]);
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push(x);
 }
 const rows = [];
 for (const positions of groups.values()) {
  positions.sort((a,b) => a-b);
  if (positions.length < 3) continue;
  const deltas = positions.slice(1).map((x,i) => x-positions[i]);
  if (deltas.some(x => x <= 0)) throw new Error('duplicate or invalid tooth positions');
  const pitch = deltas[0];
  if (!deltas.every(x => Math.abs(x-pitch) < 1e-7)) throw new Error('uneven tooth placements');
  rows.push({count: positions.length, minX: positions[0], maxX: positions.at(-1), pitchLdu: pitch});
 }
 return rows;
}
