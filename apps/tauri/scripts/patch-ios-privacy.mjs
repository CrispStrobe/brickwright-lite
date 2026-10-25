#!/usr/bin/env node
// Install PrivacyInfo.xcprivacy into the generated iOS Xcode project.
//
// Apple requires a privacy manifest at the APP BUNDLE ROOT (Brickwright.app/
// PrivacyInfo.xcprivacy) since iOS 17. `tauri ios init` regenerates
// src-tauri/gen/apple/ and knows nothing about the manifest, so this runs after
// init and before the build.
//
// This patches project.pbxproj DIRECTLY rather than editing project.yml and
// re-running `xcodegen generate`. That is deliberate: when signing is
// configured (IOS_CERTIFICATE / IOS_MOBILE_PROVISION), the tauri CLI writes
// CODE_SIGN_STYLE=Manual and PROVISIONING_PROFILE_SPECIFIER into the pbxproj,
// and regenerating from project.yml silently discards them — the build then
// dies with:
//
//     error: "<target>" requires a provisioning profile. Select a provisioning
//     profile in the Signing & Capabilities editor.
//
// Patching the pbxproj in place preserves whatever the CLI put there, and drops
// the xcodegen dependency entirely.

import { readFileSync, writeFileSync, copyFileSync, existsSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');                       // apps/tauri
const src = join(root, 'src-tauri/ios/PrivacyInfo.xcprivacy');
const genApple = join(root, 'src-tauri/gen/apple');

const die = msg => { console.error(`patch-ios-privacy: ${msg}`); process.exit(1); };
const FILE = 'PrivacyInfo.xcprivacy';

if (!existsSync(src)) die(`missing source manifest at ${src}`);
if (!existsSync(genApple)) die(`no ${genApple} — run \`tauri ios init\` first`);

// The manifest sits next to the .xcodeproj, referenced with sourceTree "<group>"
// relative to SRCROOT, so it is not inside any directory xcodegen scans and can
// only be picked up by the explicit reference added below.
copyFileSync(src, join(genApple, FILE));

const projDir = readdirSync(genApple).find(d => d.endsWith('.xcodeproj'));
if (!projDir) die('no .xcodeproj in gen/apple');
const pbxPath = join(genApple, projDir, 'project.pbxproj');
if (!existsSync(pbxPath)) die(`no ${pbxPath}`);

let pbx = readFileSync(pbxPath, 'utf8');

if (pbx.includes(FILE)) {
    console.log('patch-ios-privacy: pbxproj already references the manifest, nothing to do');
    process.exit(0);
}

// Xcode object ids are 24 uppercase hex chars. Derive them from the filename so
// repeated runs and reruns produce identical ids (no spurious project churn).
const oid = salt => createHash('sha1').update(`brickwright:${FILE}:${salt}`).digest('hex')
    .slice(0, 24).toUpperCase();
const fileRef = oid('fileRef');
const buildFile = oid('buildFile');

// 1. PBXBuildFile — ties the file reference to a build phase.
const bfSection = /(\/\* Begin PBXBuildFile section \*\/\n)/;
if (!bfSection.test(pbx)) die('no PBXBuildFile section in pbxproj');
pbx = pbx.replace(bfSection,
    `$1\t\t${buildFile} /* ${FILE} in Resources */ = {isa = PBXBuildFile; fileRef = ${fileRef} /* ${FILE} */; };\n`);

// 2. PBXFileReference — the file itself.
const frSection = /(\/\* Begin PBXFileReference section \*\/\n)/;
if (!frSection.test(pbx)) die('no PBXFileReference section in pbxproj');
pbx = pbx.replace(frSection,
    `$1\t\t${fileRef} /* ${FILE} */ = {isa = PBXFileReference; lastKnownFileType = text.plist.xml; path = ${FILE}; sourceTree = "<group>"; };\n`);

// 3. Add to the Resources build phase, which is what copies it to the bundle
//    ROOT. Exactly one such phase is expected; more than one means multiple
//    targets and the anchor is ambiguous, so fail rather than guess.
const resPhases = [...pbx.matchAll(/isa = PBXResourcesBuildPhase;[\s\S]*?files = \(\n/g)];
if (resPhases.length !== 1) {
    die(`expected exactly 1 PBXResourcesBuildPhase, found ${resPhases.length} — re-anchor this script`);
}
const anchor = resPhases[0][0];
pbx = pbx.replace(anchor, `${anchor}\t\t\t\t${buildFile} /* ${FILE} in Resources */,\n`);

writeFileSync(pbxPath, pbx);
console.log(`patch-ios-privacy: added ${FILE} to the Resources phase of ${projDir} (fileRef ${fileRef})`);
