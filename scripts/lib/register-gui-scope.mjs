/**
 * `node --import ./scripts/lib/register-gui-scope.mjs …` — installs the GUI
 * dependency-scope resolve hook (see gui-scope-hooks.mjs) before the test
 * runner loads a single file. Kept separate from the hooks because
 * module.register() runs hooks on their own thread and needs a URL to load.
 */
import {register} from 'node:module';

register('./gui-scope-hooks.mjs', import.meta.url);
