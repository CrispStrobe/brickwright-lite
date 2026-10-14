#!/usr/bin/env node
// Configure MANUAL code signing in the generated iOS Xcode project.
//
// Why this is needed even though the tauri CLI accepts IOS_CERTIFICATE /
// IOS_CERTIFICATE_PASSWORD / IOS_MOBILE_PROVISION: those make the CLI import
// the certificate into a temporary keychain (the build log shows `2 identities
// imported` and `found cert "Apple Distribution: ..."`), but they do NOT write
// any signing configuration into the project. A freshly generated project
// contains exactly one signing key:
//
//     CODE_SIGN_IDENTITY = "iPhone Developer";
//
// no DEVELOPMENT_TEAM, no CODE_SIGN_STYLE, no PROVISIONING_PROFILE_SPECIFIER —
// `bundle.iOS.developmentTeam` in tauri.conf.json does not reach the pbxproj
// either. xcodebuild then fails before compiling:
//
//     error: "<target>" requires a provisioning profile. Select a provisioning
//     profile in the Signing & Capabilities editor.
//
// So: set the four keys explicitly. Inserted rather than substituted, because
// three of the four do not exist in the generated file (a sed-replace silently
// matches nothing — the trap already documented in ~/code/appstore.md).
//
// Usage: patch-ios-signing.mjs <team-id> <profile-name> [identity]

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const [teamId, profileName, identity = 'Apple Distribution'] = process.argv.slice(2);
const die = msg => { console.error(`patch-ios-signing: ${msg}`); process.exit(1); };
if (!teamId || !profileName) die('usage: patch-ios-signing.mjs <team-id> <profile-name> [identity]');

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const genApple = join(root, 'src-tauri/gen/apple');
if (!existsSync(genApple)) die(`no ${genApple} — run \`tauri ios init\` first`);

const projDir = readdirSync(genApple).find(d => d.endsWith('.xcodeproj'));
if (!projDir) die('no .xcodeproj in gen/apple');
const pbxPath = join(genApple, projDir, 'project.pbxproj');
let pbx = readFileSync(pbxPath, 'utf8');

if (pbx.includes('PROVISIONING_PROFILE_SPECIFIER')) {
    console.log('patch-ios-signing: already configured, nothing to do');
    process.exit(0);
}

// Drop the generated default so it cannot win over ours, then insert the full
// manual-signing set into every buildSettings block.
const before = (pbx.match(/CODE_SIGN_IDENTITY[^;]*;/g) || []).length;
pbx = pbx.replace(/^\s*CODE_SIGN_IDENTITY[^;]*;\n/gm, '');

const settings = [
    `DEVELOPMENT_TEAM = ${teamId};`,
    'CODE_SIGN_STYLE = Manual;',
    `PROVISIONING_PROFILE_SPECIFIER = "${profileName}";`,
    `CODE_SIGN_IDENTITY = "${identity}";`,
];
const blocks = (pbx.match(/buildSettings = \{/g) || []).length;
if (!blocks) die('no buildSettings blocks found in pbxproj');
pbx = pbx.replace(/buildSettings = \{/g,
    `buildSettings = {\n${settings.map(s => `\t\t\t\t${s}`).join('\n')}`);

writeFileSync(pbxPath, pbx);
console.log(`patch-ios-signing: removed ${before} default CODE_SIGN_IDENTITY line(s), `
    + `configured ${blocks} buildSettings block(s)`);
console.log(`  DEVELOPMENT_TEAM=${teamId}  profile="${profileName}"  identity="${identity}"`);
