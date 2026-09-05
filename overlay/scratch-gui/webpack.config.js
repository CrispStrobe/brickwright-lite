const path = require('path');
const webpack = require('webpack');

// Plugins
const CopyWebpackPlugin = require('copy-webpack-plugin');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const reactProfiling = process.env.BW_REACT_PROFILE === '1';

const ScratchWebpackConfigBuilder = require('scratch-webpack-configuration');

/**
 * The commit this bundle was built from, short form.
 *
 * CI exports GITHUB_SHA and Vercel exports VERCEL_GIT_COMMIT_SHA; a local build has neither, so
 * fall back to asking git. Never throws — a missing version must not be able to fail a build,
 * it just leaves the About box saying "unknown".
 * @returns {string} A short commit sha, or 'unknown'.
 */
const buildVersion = () => {
    const fromEnv = process.env.GITHUB_SHA || process.env.VERCEL_GIT_COMMIT_SHA;
    if (fromEnv) return fromEnv.slice(0, 7);
    try {
        return require('child_process')
            // This file runs from packages/scratch-gui, which is vendored and gitignored — the
            // repository is two levels up.
            .execSync('git rev-parse --short=7 HEAD', {
                cwd: path.resolve(__dirname, '..', '..'),
                stdio: ['ignore', 'pipe', 'ignore']
            })
            .toString().trim() || 'unknown';
    } catch (e) {
        return 'unknown';
    }
};

// const STATIC_PATH = process.env.STATIC_PATH || '/static';

const baseConfig = new ScratchWebpackConfigBuilder(
    {
        rootPath: path.resolve(__dirname),
        enableReact: true,
        shouldSplitChunks: true
    })
    .setTarget('browserslist')
    .merge({
        output: {
            assetModuleFilename: 'static/assets/[name].[hash][ext][query]',
            library: {
                name: 'GUI',
                type: 'umd2'
            }
        },
        resolve: {
            alias: reactProfiling ? {
                'react-dom$': 'react-dom/profiling',
                'scheduler/tracing$': 'scheduler/tracing-profiling'
            } : {},
            fallback: {
                Buffer: require.resolve('buffer/'),
                stream: require.resolve('stream-browserify'),
                // Emscripten's glue (src/lib/emu8051/emu8051.js) carries a Node
                // branch that does require("node:fs") to read the .wasm off
                // disk. The branch is dead in a browser — ENVIRONMENT_IS_NODE
                // guards it — but webpack still parses the specifier, and these
                // map it to an empty module once the `node:` prefix has been
                // stripped by the NormalModuleReplacementPlugin below. The
                // prefix has to go first: an unknown SCHEME fails before
                // resolution ever runs, so a fallback alone cannot catch it.
                fs: false,
                path: false
            }
        }
    })
    .addModuleRule({
        test: /\.(svg|png|wav|mp3|gif|jpg)$/,
        resourceQuery: /^$/, // reject any query string
        type: 'asset' // let webpack decide on the best type of asset
    })
    // `node:fs` -> `fs`, which resolve.fallback above then maps to nothing.
    // Webpack rejects an unrecognised URI scheme while PARSING, before any
    // resolution or fallback applies, so the prefix must be rewritten rather
    // than resolved away. Only Emscripten's dead Node branch reaches this.
    .addPlugin(new webpack.NormalModuleReplacementPlugin(/^node:/, resource => {
        resource.request = resource.request.replace(/^node:/, '');
    }))
    .addPlugin(new webpack.DefinePlugin({
        // Brickwright: stamp the build so a running page can say which commit it is. Without
        // this there is no way to tell a stale tab from a deployed regression except by
        // comparing bundle hashes against the repo by hand, which is not something a user can
        // be asked to do — and every bug report is unanswerable until you know the version.
        // CI sets GITHUB_SHA; a local build falls back to asking git; neither is fatal.
        'process.env.BW_VERSION': JSON.stringify(buildVersion()),
        'process.env.BW_BUILD_TIME': JSON.stringify(new Date().toISOString()),
        'process.env.DEBUG': Boolean(process.env.DEBUG),
        'process.env.GA_ID': `"${process.env.GA_ID || 'UA-000000-01'}"`,
        'process.env.GTM_ENV_AUTH': `"${process.env.GTM_ENV_AUTH || ''}"`,
        'process.env.GTM_ID': process.env.GTM_ID ? `"${process.env.GTM_ID}"` : null
    }))
    .addPlugin(new CopyWebpackPlugin({
        patterns: [
            {
                from: 'node_modules/scratch-blocks/media',
                to: 'static/blocks-media/default'
            },
            {
                from: 'node_modules/scratch-blocks/media',
                to: 'static/blocks-media/high-contrast'
            },
            {
                // overwrite some of the default block media with high-contrast versions
                // this entry must come after copying scratch-blocks/media into the high-contrast directory
                from: 'src/lib/themes/high-contrast/blocks-media',
                to: 'static/blocks-media/high-contrast',
                force: true
            },
            {
                context: 'node_modules/scratch-vm/dist/web',
                from: 'extension-worker.{js,js.map}',
                noErrorOnMissing: true
            },
            {
                // The 8051 emulator's WASM. Webpack bundles the Emscripten GLUE
                // (it is an ordinary module) but never sees the .wasm, which the
                // glue fetches by URL at runtime — so without this the debugger
                // loads its chunk and then 404s. The runner passes a locateFile
                // that points here; see bw-debug/debug-runner.js.
                from: 'src/lib/emu8051/emu8051.wasm',
                to: 'static/emu8051.wasm'
            },
            {
                // SDCC 4.5.0 as WASM — lazy-loaded on the first supported
                // 8051 compile. Other processor families stay hosted.
                from: 'src/lib/sdcc-wasm/dist',
                to: 'static/sdcc-wasm',
                noErrorOnMissing: true
            },
            {
                // SmallerC as WASM — C to 16-bit NASM for the 8086, offline.
                // Only smlrc and smlrpp are here; headers.js is imported
                // normally and so is bundled rather than copied.
                from: 'src/lib/smallerc-wasm/dist',
                to: 'static/smallerc-wasm',
                noErrorOnMissing: true
            }
        ]
    }));

if (!process.env.CI) {
    baseConfig.addPlugin(new webpack.ProgressPlugin());
}

// build the shipping library in `dist/`
const distConfig = baseConfig.clone()
    .merge({
        entry: {
            'scratch-gui': path.join(__dirname, 'src/index.js')
        },
        output: {
            path: path.resolve(__dirname, 'dist')
        }
    })
    .addPlugin(
        new CopyWebpackPlugin({
            patterns: [
                {
                    from: 'src/lib/libraries/*.json',
                    to: 'libraries',
                    flatten: true
                }
            ]
        })
    );

// build the examples and debugging tools in `build/`
const buildConfig = baseConfig.clone()
    .enableDevServer(process.env.PORT || 8601)
    .merge({
        entry: {
            gui: './src/playground/index.jsx'
        },
        output: {
            // React strips Profiler timings from its ordinary production
            // renderer. CI builds a separate profiling artifact for the 8086
            // benchmark; the deployable build remains on the ordinary
            // renderer and keeps its normal runtime cost.
            path: path.resolve(__dirname, reactProfiling ? 'build-profile' : 'build'),
            filename: '[name].[contenthash:8].js',
            // Keep lazy feature chunks addressable across Pages deploys.
            // Hashed lazy URLs let a cached HTML/runtime request a chunk that
            // the next clean deployment has already removed.
            chunkFilename: 'chunks/[name].js',
            // No UMD library wrapper for the web app — it boots itself.
            // (The library config is only for dist/, which we skip.)
            library: undefined
        }
    })
    .addPlugin(new HtmlWebpackPlugin({
        chunks: ['gui'],
        template: 'src/playground/index.ejs',
        title: 'Brickwright'
    }))
    .addPlugin(new CopyWebpackPlugin({
        patterns: [
            {
                from: 'static',
                to: 'static'
            },
            {
                from: 'extensions/**',
                to: 'static',
                context: 'src/examples'
            },
            {
                // Brickwright PWA service worker — must sit at the build root so its scope covers
                // the whole app (a file under static/ could only control static/).
                from: 'sw.js',
                to: 'sw.js'
            },
            {
                // Examples gallery index — 22 KiB, 53 entries, bilingual.
                // The ExamplesBrowser fetches 'examples/index.json' (relative).
                from: 'examples',
                to: 'examples',
                noErrorOnMissing: true
            }
        ]
    }));

// Skip building `dist/` unless explicitly requested via BUILD_MODE=dist.
// The Vercel deploy only serves `build/`; the `dist/` library compilation roughly doubles
// peak memory and is not needed for production deploys.
const buildDist = process.env.BUILD_MODE === 'dist';

const vmSrc = path.resolve(__dirname, 'node_modules/scratch-vm/src/index.js');
const cfgs = buildDist ? [buildConfig.get(), distConfig.get()] : [buildConfig.get()];
cfgs.forEach(c => {
    c.devtool = false; // Brickwright: no source maps -> fits CI RAM
    // A persistent compile cache for LOCAL builds: every build here was a cold
    // compile at a 2.5 GiB heap (73 s on CI's runner, minutes on a shared box).
    // Off on CI on purpose — a runner's node_modules/.cache is gone next run, so
    // there it would only cost the write. Keyed on this file so an alias or a
    // loader change invalidates it.
    if (!process.env.CI) {
        c.cache = {
            type: 'filesystem',
            buildDependencies: {config: [__filename]}
        };
    }
    c.resolve = c.resolve || {};
    c.resolve.alias = Object.assign({}, c.resolve.alias);
    // Build the VM from source (node_modules/scratch-vm/src, over which apply-vm-overlay.mjs has
    // laid our owned delta) so our built-in extensions bundle in. Its deps resolve from the
    // hoisted scratch-gui/node_modules; babel already transpiles node_modules/*scratch*.
    c.resolve.alias['scratch-vm$'] = vmSrc;
    // cat-blocks is a 65 MiB Easter-egg dependency (cat-themed blocks for "time travel to
    // 2020"). Aliasing it to scratch-blocks eliminates a duplicate blockly parse+compile
    // pass — the feature degrades gracefully to showing normal blocks.
    c.resolve.alias['cat-blocks'] = path.resolve(__dirname, 'node_modules/scratch-blocks');
    // Trimmed locale data: only en + de (generated by integrate.mjs).
    // The full editor-msgs.js is 3.9 MiB with 80 locales; the trimmed copy is ~90 KiB.
    const trimmedMsgs = path.resolve(__dirname, 'src/generated/editor-msgs-lite.js');
    c.resolve.alias['scratch-l10n/locales/editor-msgs'] = trimmedMsgs;
    // The seven render fonts (1.34 MiB of base64, incompressible) leave the boot
    // chunk: scratch-svg-renderer's require('scratch-render-fonts') gets a
    // same-shaped shim that fetches the real module — reachable only under the
    // second alias — as its own chunk. See src/lib/lazy-render-fonts.js.
    c.resolve.alias['scratch-render-fonts$'] = path.resolve(__dirname, 'src/lib/lazy-render-fonts.js');
    c.resolve.alias['scratch-render-fonts-base64$'] =
        path.resolve(__dirname, 'node_modules/scratch-render-fonts/src/index.js');
    // `text-encoding` is a 618 KiB (201 KiB compressed) TextDecoder polyfill for
    // browsers without one; every browser in .browserslistrc has one. Its three
    // requirers (scratch-vm, scratch-sb1-converter, @vernier/godirect) all guard
    // on `typeof TextDecoder === 'undefined'` before touching it, so they get the
    // 5 KiB polyfill scratch-storage already ships, which hands back the native
    // classes when they exist.
    c.resolve.alias['text-encoding$'] = 'fastestsmallesttextencoderdecoder';
    // Skip babel for pre-minified blockly files — they're already compiled and 'use strict',
    // and babel deoptimising 977 KiB of minified code wastes time and memory for no benefit.
    const babelRule = (c.module.rules || []).find(r => r.loader === 'babel-loader');
    if (babelRule) {
        const origExclude = babelRule.exclude || [];
        babelRule.exclude = [
            ...origExclude,
            /scratch-blocks[\\/]blockly_compressed/
        ];
    }
});
module.exports = buildDist ? cfgs : cfgs[0];
