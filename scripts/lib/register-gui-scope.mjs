/**
 * `node --import ./scripts/lib/register-gui-scope.mjs …` — installs the GUI
 * dependency-scope resolve hook (see gui-scope-hooks.mjs) before the test
 * runner loads a single file. Kept separate from the hooks because
 * module.register() runs hooks on their own thread and needs a URL to load.
 */
import {register} from 'node:module';

// node --test runs each file in its own process with the file as an argument;
// the hooks thread has no such argv, so the test file travels as register() data.
const testFile = process.argv.slice(1).find(a => /\.test\.m?js$/.test(a.replace(/\\/g, '/')));
register('./gui-scope-hooks.mjs', import.meta.url, {data: {testFile}});
