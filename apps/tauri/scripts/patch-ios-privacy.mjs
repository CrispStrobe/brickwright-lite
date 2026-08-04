#!/usr/bin/env node
// Install PrivacyInfo.xcprivacy into the generated iOS Xcode project.
//
// Apple requires a privacy manifest at the APP BUNDLE ROOT (Brickwright.app/
// PrivacyInfo.xcprivacy) since iOS 17. `tauri ios init` regenerates
// src-tauri/gen/apple/ from scratch and knows nothing about the manifest, so
// this runs after init and before the build. Re-run `xcodegen generate`
// afterwards — this edits project.yml, which is what xcodegen consumes.
//
// Why the file is copied to gen/apple/ root rather than into the
// brickwright-tauri_iOS/ directory: that directory is already listed wholesale
// in the target's `sources`, so a file dropped inside it is picked up by the
// directory scan with a build phase xcodegen infers from the extension. For an
// unknown extension like .xcprivacy that is not guaranteed to be `resources`,
// and if it were, adding an explicit entry too would produce the file twice
// ("Multiple commands produce ..."). Keeping it outside any scanned directory
// means exactly one, explicit, resources-phase reference.

import { readFileSync, writeFileSync, copyFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');                       // apps/tauri
const src = join(root, 'src-tauri/ios/PrivacyInfo.xcprivacy');
const genApple = join(root, 'src-tauri/gen/apple');
const dest = join(genApple, 'PrivacyInfo.xcprivacy');
const projectYml = join(genApple, 'project.yml');

const die = msg => { console.error(`patch-ios-privacy: ${msg}`); process.exit(1); };

if (!existsSync(src)) die(`missing source manifest at ${src}`);
if (!existsSync(projectYml)) die(`no ${projectYml} — run \`tauri ios init\` first`);

copyFileSync(src, dest);
console.log(`patch-ios-privacy: copied manifest -> ${dest}`);

let yml = readFileSync(projectYml, 'utf8');

if (yml.includes('PrivacyInfo.xcprivacy')) {
    console.log('patch-ios-privacy: project.yml already references the manifest, nothing to do');
    process.exit(0);
}

// Anchor on the LaunchScreen entry: it is the last item of the iOS target's
// `sources` list. Require exactly one match so a template change fails loudly
// here rather than silently shipping an app with no privacy manifest.
const anchor = /^( +)- path: LaunchScreen\.storyboard$/gm;
const matches = [...yml.matchAll(anchor)];
if (matches.length !== 1) {
    die(`expected exactly 1 "- path: LaunchScreen.storyboard" in project.yml, found ${matches.length}. `
        + 'The Tauri iOS template changed — re-anchor this script.');
}

const [line, indent] = [matches[0][0], matches[0][1]];
const insertion = `${line}\n${indent}- path: PrivacyInfo.xcprivacy\n${indent}  buildPhase: resources`;
yml = yml.replace(line, insertion);
writeFileSync(projectYml, yml);

console.log('patch-ios-privacy: added resources-phase entry to project.yml — now re-run `xcodegen generate`');
