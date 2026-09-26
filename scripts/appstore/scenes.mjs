/**
 * WHAT A BRICKWRIGHT SCREENSHOT SHOULD SHOW, as data.
 *
 * Kept apart from the capture driver so a gate can read the scene list without
 * a browser: test/appstore-screenshots.test.mjs asserts the shape, the sizes
 * against Apple's current requirements, and that captions exist in every
 * locale. A scene list nobody can check is how a store listing ends up with
 * five screenshots of the same empty workspace.
 *
 * THE RULE FOR "INTERESTING": every scene must show the app DOING something
 * only this app does. A blank editor is a screenshot of Scratch; a breadboard
 * wired to a running 6502, a CP/M prompt that actually booted, and a gate-level
 * circuit being simulated are screenshots of Brickwright. So each scene here
 * carries the interaction a person would perform before the view is worth
 * looking at, and `settle` is how long the thing takes to become true.
 *
 * @module
 */

/**
 * Apple's current sizes (App Store Connect, 2026-09). The CSS viewport is the
 * device's POINT size and `scale` does the rest, so the app lays itself out as
 * a phone or a tablet rather than as a very large desktop window — the mistake
 * that produces a screenshot of a desktop UI scaled down until it is unreadable.
 */
export const DEVICES = Object.freeze([
    {
        suffix: 'iphone',
        displayType: 'APP_IPHONE_67',
        viewport: {width: 440, height: 956},
        scale: 3,
        pixels: [1320, 2868]
    },
    {
        suffix: 'ipad',
        displayType: 'APP_IPAD_PRO_3GEN_129',
        viewport: {width: 1032, height: 1376},
        scale: 2,
        pixels: [2064, 2752]
    },
    {
        // The same app record carries macOS (release.yml uploads that build on
        // the same tag), and a Mac listing needs its own set.
        suffix: 'mac',
        displayType: 'APP_DESKTOP',
        viewport: {width: 1440, height: 900},
        scale: 2,
        pixels: [2880, 1800]
    }
]);

/** The locales the store listing is written in — see docs/app-store-metadata.md. */
export const LOCALES = Object.freeze(['en-US', 'de-DE']);

/**
 * Captions for the App Store listing, per scene and locale. Not burned into the
 * PNG — Apple takes the image alone — but written here so the listing copy and
 * the picture it belongs to cannot drift apart, and so a reviewer can see what
 * each shot is meant to prove.
 */
export const SCENES = Object.freeze([
    {
        id: '01-blocks',
        needsFpga: false,
        settle: 2500,
        caption: {
            'en-US': 'Blocks that drive real hardware',
            'de-DE': 'Blöcke, die echte Hardware steuern'
        }
    },
    {
        id: '02-circuit',
        needsFpga: false,
        settle: 3000,
        caption: {
            'en-US': 'A breadboard that simulates, wire by wire',
            'de-DE': 'Ein Steckbrett, das Draht für Draht simuliert'
        }
    },
    {
        id: '03-code',
        needsFpga: false,
        settle: 2000,
        caption: {
            'en-US': 'The same program as readable code',
            'de-DE': 'Dasselbe Programm als lesbarer Code'
        }
    },
    {
        id: '04-machine',
        needsFpga: false,
        settle: 3000,
        // MEASURED (2026-09-26), and the first reading of it was WRONG, so the
        // mechanism is written down rather than the symptom.
        //
        // `body` has `min-width: 1024px`: the app does not lay out below that
        // at all. On a 440pt phone the LAYOUT viewport becomes 1024x2225 while
        // the VISUAL viewport stays 440x956, and this modal is
        // `position: fixed; inset: 0` — pinned to the layout viewport, so its
        // buttons sit outside the visible area until the user pans. Playwright
        // cannot pan a visual viewport to a fixed element (scrollIntoViewIfNeeded
        // is a no-op on `position: fixed`), so the click times out.
        //
        // A PERSON CAN reach it, by panning. This is an automation limit, not
        // proof of an unusable control — the earlier note here claimed the
        // latter and was wrong. The real finding is the min-width, which is
        // recorded in docs/app-store-metadata.md because it decides what every
        // iPhone screenshot of this app can possibly show.
        skipDevices: ['iphone'],
        caption: {
            'en-US': 'Boot a real operating system — CP/M 2.2, in the browser',
            'de-DE': 'Ein echtes Betriebssystem starten — CP/M 2.2, im Browser'
        }
    },
    {
        id: '05-fpga',
        needsFpga: true,
        settle: 3000,
        caption: {
            'en-US': 'Build a circuit from gates and watch it settle',
            'de-DE': 'Eine Schaltung aus Gattern bauen und ihr beim Einschwingen zusehen'
        }
    }
]);

/** Scenes this build can actually produce. A flag-off build has no FPGA tab. */
export const scenesFor = ({fpga = false, device = null} = {}) => SCENES.filter(s =>
    (fpga || !s.needsFpga) &&
    !(device && (s.skipDevices || []).includes(device)));

/** Every (device, locale, scene) the run should produce. Pure; the gate counts it. */
export const shotList = ({fpga = false} = {}) => {
    const out = [];
    for (const device of DEVICES) {
        for (const locale of LOCALES) {
            for (const scene of scenesFor({fpga, device: device.suffix})) {
                out.push({
                    name: `${scene.id}-${device.suffix}-${locale}.png`,
                    scene: scene.id,
                    locale,
                    displayType: device.displayType,
                    pixels: device.pixels
                });
            }
        }
    }
    return out;
};
