#!/usr/bin/env node
/**
 * Prepare generated iOS files for builds whose inputs/output live on symlinks.
 *
 * Xcode resolves SRCROOT through symlinks. When src-tauri/gen lives on an
 * external build disk, the generated `npm run -- tauri ios xcode-script`
 * therefore starts beside that disk's gen/apple directory and cannot find
 * package.json. Tauri's generator also does not follow a symlink used as the
 * frontendDist root, leaving gen/apple/assets empty. The generated project is
 * ignored, so repair both cases after every `tauri ios init` rather than moving
 * build output back into the source checkout.
 */
import {
    existsSync,
    mkdirSync,
    readFileSync,
    readdirSync,
    realpathSync,
    writeFileSync
} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const die = message => {
    console.error(`prepare-ios-device-build: ${message}`);
    process.exit(1);
};

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const srcTauri = join(root, 'src-tauri');
const genApple = join(root, 'src-tauri/gen/apple');
if (!existsSync(genApple)) die(`no ${genApple} — run \`tauri ios init\` first`);

const config = JSON.parse(readFileSync(join(srcTauri, 'tauri.conf.json'), 'utf8'));
const frontendSetting = config?.build?.frontendDist;
if (typeof frontendSetting !== 'string') die('tauri.conf.json has no build.frontendDist');
const frontendDist = resolve(srcTauri, frontendSetting);
if (!existsSync(frontendDist)) die(`frontendDist does not exist: ${frontendDist}`);

const resolvedFrontendDist = realpathSync(frontendDist);
const generatedAssets = join(genApple, 'assets');
mkdirSync(generatedAssets, {recursive: true});
const sync = spawnSync('/usr/bin/rsync', [
    '-a',
    '--delete',
    `${resolvedFrontendDist}/`,
    `${generatedAssets}/`
], {stdio: 'inherit'});
if (sync.error) die(`could not run rsync: ${sync.error.message}`);
if (sync.status !== 0) die(`rsync exited with status ${sync.status}`);
if (!existsSync(join(generatedAssets, 'index.html'))) {
    die(`generated assets have no index.html after copying ${resolvedFrontendDist}`);
}
console.log(`prepare-ios-device-build: synchronized frontend assets from ${resolvedFrontendDist}`);

const project = readdirSync(genApple).find(name => name.endsWith('.xcodeproj'));
if (!project) die('no .xcodeproj in gen/apple');
const pbxPath = join(genApple, project, 'project.pbxproj');
let pbx = readFileSync(pbxPath, 'utf8');

// Release web requests use generate_context!'s embedded asset provider. The
// generated frontend folder is a second, uncompressed copy (~108 MiB in the
// measured iPad app). Keep the staging files and folder reference, but omit
// only that source-root folder from Resources; asset catalogs remain bundled.
const frontendReference = pbx.match(
    /^[ \t]*([A-Fa-f0-9]{24}) \/\* assets \*\/ = \{isa = PBXFileReference;[^\r\n]*path = assets; sourceTree = SOURCE_ROOT; \};/m
);
const frontendBuildFiles = [...pbx.matchAll(
    /^[ \t]*([A-Fa-f0-9]{24}) \/\* assets in Resources \*\/ = \{isa = PBXBuildFile; fileRef = ([A-Fa-f0-9]{24}) \/\* assets \*\/; \};/gm
)];
if (frontendBuildFiles.length && !frontendReference) {
    die('generated frontend folder reference changed shape — refusing to remove resources');
}
let excludedFrontend = false;
for (const [, buildId, fileId] of frontendBuildFiles) {
    if (fileId !== frontendReference[1]) continue;
    pbx = pbx.replace(new RegExp(
        `^[ \\t]*${buildId} \\/\\* assets in Resources \\*\\/[^\\r\\n]*(?:\\r?\\n|$)`, 'gm'
    ), '');
    excludedFrontend = true;
}
if (excludedFrontend) {
    writeFileSync(pbxPath, pbx);
    console.log('prepare-ios-device-build: excluded duplicate frontend resources; release assets stay embedded');
}

// Re-running `tauri ios init` after a build lets XcodeGen discover the
// existing Externals/.../libapp.a as a resource as well as a linker input.
// The executable already contains its code; packaging the archive added
// 152 MiB to the measured iPad app. Preserve the Frameworks entry and remove
// only the duplicate resource build-file/phase entries, even on repeat runs.
const withoutArchiveResource = pbx.replace(
    /^[ \t]*[A-Fa-f0-9]{24}[ \t]+\/\* libapp\.a in Resources \*\/[^\r\n]*(?:\r?\n|$)/gm,
    ''
);
if (withoutArchiveResource !== pbx) {
    pbx = withoutArchiveResource;
    writeFileSync(pbxPath, pbx);
    console.log('prepare-ios-device-build: excluded linked libapp.a from packaged resources');
}

const command = 'npm run -- tauri ios xcode-script';
const escapedRoot = root.replaceAll('\\', '\\\\').replaceAll('"', '\\"');
const anchored = `cd \\"${escapedRoot}\\" && ${command}`;

if (pbx.includes(anchored)) {
    console.log(`prepare-ios-device-build: Rust build phase already anchored at ${root}`);
    process.exit(0);
}

const needle = `shellScript = "${command}`;
if (!pbx.includes(needle)) {
    die('generated Rust build phase changed shape — re-anchor this script');
}
pbx = pbx.replace(needle, `shellScript = "${anchored}`);
writeFileSync(pbxPath, pbx);
console.log(`prepare-ios-device-build: anchored generated Rust build phase at ${root}`);
