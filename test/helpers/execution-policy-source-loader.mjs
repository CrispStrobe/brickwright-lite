// Explicit test-only mapping; never synthesizes an installed npm package.
// node --loader ./test/helpers/execution-policy-source-loader.mjs --test ...
import {pathToFileURL} from 'node:url';
import path from 'node:path';

export async function resolve(specifier, context, nextResolve) {
    if (specifier === 'bw-board/execution-policy' && process.env.BW_EXECUTION_POLICY_SOURCE) {
        if (!path.isAbsolute(process.env.BW_EXECUTION_POLICY_SOURCE)) {
            throw new Error('BW_EXECUTION_POLICY_SOURCE must name an explicit absolute source path');
        }
        return nextResolve(pathToFileURL(process.env.BW_EXECUTION_POLICY_SOURCE).href, context);
    }
    return nextResolve(specifier, context);
}
