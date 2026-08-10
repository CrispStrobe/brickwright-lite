const path = require('path');
const webpack = require('webpack');

// Plugins
const CopyWebpackPlugin = require('copy-webpack-plugin');
const HtmlWebpackPlugin = require('html-webpack-plugin');

const ScratchWebpackConfigBuilder = require('scratch-webpack-configuration');

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
                // SDCC 4.5.0 as WASM — lazy-loaded on first compile when
                // the preview flag is set. Not the default compiler path.
                from: 'src/lib/sdcc-wasm/dist',
                to: 'static/sdcc-wasm',
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
            path: path.resolve(__dirname, 'build'),
            filename: '[name].[contenthash:8].js',
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
