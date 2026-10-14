#!/usr/bin/env node
/**
 * Install Brickwright's app icons into the generated mobile projects.
 *
 * THE DEFECT
 * ----------
 * `tauri ios init` and `tauri android init` template TAURI'S OWN logo into the
 * generated project and never look at `src-tauri/icons/ios/` or
 * `src-tauri/icons/android/`, which is where `tauri icon` put ours. Because
 * `gen/` is gitignored, CI regenerates the project on every run, so every build
 * shipped Tauri's logo. On TestFlight that is the icon testers see. The robot has
 * been in the repo since the app was scaffolded (2026-07-08) and the project
 * generated on 2026-08-04 still carried the default, which is how long this went
 * unnoticed — the icon is the one thing no test looks at and everyone sees.
 *
 * Run it after `tauri <platform> init` and before the build:
 *   node scripts/patch-mobile-icons.mjs ios
 *   node scripts/patch-mobile-icons.mjs android
 *
 * Idempotent, and loud: a source file with no destination means the template's
 * icon set has changed shape, and silently copying the subset that still matches
 * would leave Tauri's logo at the sizes that did not.
 */
import {copyFileSync, existsSync, readdirSync, readFileSync, statSync} from 'node:fs';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');                       // apps/tauri
const icons = join(root, 'src-tauri/icons');

const die = msg => {
    console.error(`patch-mobile-icons: ${msg}`);
    process.exit(1);
};

const PLATFORMS = {
    ios: {
        // One flat directory of PNGs named exactly as the appiconset's
        // Contents.json lists them.
        from: join(icons, 'ios'),
        to: join(root, 'src-tauri/gen/apple/Assets.xcassets/AppIcon.appiconset'),
        headline: 'AppIcon-512@2x.png',
        init: 'tauri ios init'
    },
    android: {
        // A res/ tree of mipmap-<density>/ PNGs.
        from: join(icons, 'android'),
        to: join(root, 'src-tauri/gen/android/app/src/main/res'),
        headline: 'mipmap-xxxhdpi/ic_launcher.png',
        init: 'tauri android init',
        // `tauri icon` also emits an ADAPTIVE icon (a foreground drawable over a
        // colour) which the generated project does not use — it has no
        // mipmap-anydpi-v26 at all, so API 26+ falls back to ic_launcher.png,
        // which after this script is the robot. Introducing the adaptive icon
        // would be a redesign, not a repair: its background colour is #fff, so
        // the launcher would show the robot on white instead of on its teal.
        // Skipped deliberately and by name, so a NEW unmatched file still stops
        // the script.
        skip: new Set(['mipmap-anydpi-v26/ic_launcher.xml', 'values/ic_launcher_background.xml'])
    }
};

const platform = process.argv[2];
const spec = PLATFORMS[platform];
if (!spec) die(`usage: patch-mobile-icons.mjs <${Object.keys(PLATFORMS).join('|')}>`);
if (!existsSync(spec.from)) die(`no source icons at ${spec.from} — run \`tauri icon\` first`);
if (!existsSync(spec.to)) die(`no ${spec.to} — run \`${spec.init}\` first`);

/** Every file under `dir`, as paths relative to it. */
const walk = (dir, prefix = '') => readdirSync(dir).flatMap(name => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ?
        walk(full, `${prefix}${name}/`) :
        [`${prefix}${name}`];
});

const skip = spec.skip || new Set();
const sources = walk(spec.from).filter(rel => !skip.has(rel));

// Check the whole set BEFORE writing anything. Copying as we go and reporting
// the mismatch afterwards would leave exactly the partial copy the message below
// claims to have avoided.
const missing = sources.filter(rel => !existsSync(join(spec.to, rel)));
if (missing.length) {
    die(`no destination for ${missing.length} icon(s): ${missing.join(', ')}\n` +
        `  The generated ${platform} project's icon set has a different shape than ` +
        'src-tauri/icons/. Re-anchor this script rather than shipping a partial copy.\n' +
        '  Nothing was written.');
}

let copied = 0;
let unchanged = 0;
for (const rel of sources) {
    const src = join(spec.from, rel);
    const dst = join(spec.to, rel);
    if (readFileSync(src).equals(readFileSync(dst))) {
        unchanged++;
        continue;
    }
    copyFileSync(src, dst);
    copied++;
}

console.log(`patch-mobile-icons: ${platform} — ${copied} replaced, ${unchanged} already correct, ` +
    `${sources.length} total${skip.size ? `, ${skip.size} skipped by design` : ''}`);

// Read the headline icon back off disk rather than trusting the copy above: it
// is the App Store / launcher icon, the one a human notices is wrong.
if (!readFileSync(join(spec.from, spec.headline))
    .equals(readFileSync(join(spec.to, spec.headline)))) {
    die(`${spec.headline} did not take — what is on disk is not what was copied`);
}
console.log(`patch-mobile-icons: ${spec.headline} verified`);
