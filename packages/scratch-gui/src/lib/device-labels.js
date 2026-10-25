/**
 * Canonical device-slug → human label map.
 * ONE source for every UI surface that shows device names:
 * pseudocode-importer chip row, ExamplesBrowser cards, etc.
 *
 * `label`  — full display name (ExamplesBrowser, tooltips)
 * `short`  — compact chip label (Code-tab chip row, ≤6 chars ideal)
 * `de`     — German variant, only where the EN label is not a proper noun
 */
const DEVICE_DATA = {
  'stc12c5a60s2':  { label: 'STC12',          short: 'STC12'  },
  'stc89c52rc':    { label: 'STC89',           short: 'STC89'  },
  'stc15f2k60s2':  { label: 'STC15',           short: 'STC15'  },
  'arduino-uno':   { label: 'Arduino Uno',     short: 'Uno'    },
  'arduino-nano':  { label: 'Arduino Nano',    short: 'Nano'   },
  'arduino-mega':  { label: 'Arduino Mega',    short: 'Mega'   },
  'atmega168p':    { label: 'ATmega168P',      short: '168P'   },
  'atmega328p':    { label: 'ATmega328P',      short: '328P'   },
  'atmega2560':    { label: 'ATmega2560',      short: '2560'   },
  'pico':          { label: 'Pico',            short: 'Pico'   },
  'attiny85':      { label: 'ATtiny85',        short: 't85'    },
  'attiny88':      { label: 'ATtiny88',        short: 't88'    },
  'attiny13':      { label: 'ATtiny13',        short: 't13'    },
  'attiny2313':    { label: 'ATtiny2313',      short: 't2313'  },
  'eater6502':     { label: '6502 Breadboard', short: '6502', de: '6502 Steckbrett' },
  'gpascal':       { label: 'G-Pascal',        short: 'GPasc'  },
  'z80':           { label: 'Z80',             short: 'Z80'    },
  'microbit':      { label: 'micro:bit',       short: 'µ:bit'  },
};

/** Full display labels — { slug: string } */
export const DEVICE_LABELS = Object.fromEntries(
  Object.entries(DEVICE_DATA).map(([k, v]) => [k, v.label])
);

/** Compact chip labels for space-constrained UI — { slug: string } */
export const DEVICE_CHIP_LABELS = Object.fromEntries(
  Object.entries(DEVICE_DATA).map(([k, v]) => [k, v.short])
);

/** German labels where they differ from EN (proper nouns stay the same) */
export const DEVICE_LABELS_DE = Object.fromEntries(
  Object.entries(DEVICE_DATA)
    .map(([k, v]) => [k, v.de || v.label])
);

/** Look up any device label, with optional locale */
export function deviceLabel(slug, { short: useShort = false, locale = 'en' } = {}) {
  const d = DEVICE_DATA[slug];
  if (!d) return slug;
  if (useShort) return d.short;
  if (/^de/i.test(locale) && d.de) return d.de;
  return d.label;
}
