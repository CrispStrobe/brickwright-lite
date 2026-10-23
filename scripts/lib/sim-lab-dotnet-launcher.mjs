// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
// The reviewed .NET qualification graph needs the Runtime to be the child PID,
// so stopping it also closes the pipes held by the Runtime. No Mono/stock claim.
import {access, writeFile} from 'node:fs/promises';
import path from 'node:path';

export const prepareDotnetLauncher = async runtime => {
    await access(path.join(runtime, 'output/bin/Release/Renode.dll'));
    const output = path.join(runtime, 'renode-qualified');
    await writeFile(output, `#!/usr/bin/env bash
set -euo pipefail
export DOTNET_CLI_TELEMETRY_OPTOUT=1
SCRIPT_DIR="$(cd -- "$(dirname -- "$0")" && pwd)"
exec dotnet "$SCRIPT_DIR/output/bin/Release/Renode.dll" "$@"
`, {flag: 'wx', mode: 0o700});
    return output;
};
