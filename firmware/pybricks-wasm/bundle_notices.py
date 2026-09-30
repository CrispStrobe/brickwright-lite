#!/usr/bin/env python3
# SPDX-License-Identifier: BSD-3-Clause
# Copyright (c) 2026 Brickwright contributors
"""Retain every compiler input's copyright declarations with offline licences."""
import argparse
import hashlib
import json
from pathlib import Path
import re

MARKER = '\n\n=== Compiler input copyright declarations (generated) ===\n'
RUNTIME_MARKER = '\n\n=== Linked runtime source notices (generated) ===\n'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('manifest', type=Path)
    parser.add_argument('notices', type=Path)
    parser.add_argument('toolchain', type=Path)
    args = parser.parse_args()
    manifest = json.loads(args.manifest.read_text())
    declarations = {}
    for item in manifest['inputs']:
        for raw in item['copyright']:
            line = re.sub(r'^\s*(?://|\*)\s*', '', raw)
            if re.match(r'Copyright\b', line, re.I):
                declarations.setdefault((item['licence'], line), []).append(item['path'])
    for item in manifest['toolchain_inputs']:
        data = (args.toolchain / item['path']).read_bytes()
        if hashlib.sha256(data).hexdigest() != item['sha256']:
            raise ValueError(f"toolchain input changed: {item['path']}")
        for raw in data.decode(errors='replace').splitlines():
            line = re.sub(r'^\s*(?://|\*)\s*', '', raw)
            if re.match(r'Copyright\b', line, re.I):
                declarations.setdefault(('Emscripten MIT / NCSA; musl; LLVM Apache with exception', line), []).append('toolchain:' + item['path'])
    # Compiler dependency files omit the prebuilt runtime archive sources.
    # Preserve their individual grants too, especially the Sun/fdlibm math
    # notices: the musl repository licence explicitly defers to those grants.
    runtime = json.loads(Path(__file__).with_name('runtime-inputs.json').read_text())
    runtime_blocks = {}
    for item in runtime['inputs']:
        path = args.toolchain / 'emscripten' / item['source']
        data = path.read_bytes()
        if hashlib.sha256(data).hexdigest() != item['sha256']:
            raise ValueError(f"runtime source changed: {item['source']}")
        for block in re.findall(r'/\*.*?\*/', data.decode(errors='replace'), re.S):
            if not re.search(r'copyright|permission to|redistribution and use|public domain|SPDX-License-Identifier', block, re.I):
                continue
            if item['source'] == 'system/lib/dlmalloc.c' and 'released to the public domain' in block:
                # The rest of this comment is the allocator's user manual.
                block = block.split(' * Version', 1)[0].rstrip() + '\n */'
            runtime_blocks.setdefault(block, []).append(item['source'])
    text = args.notices.read_text().split(MARKER)[0].split(RUNTIME_MARKER)[0]
    text += RUNTIME_MARKER
    text += '\nPinned Emscripten 6.0.6 runtime source notices; see firmware/pybricks-wasm/runtime-inputs.json.\n'
    for block, paths in sorted(runtime_blocks.items()):
        text += '\n' + '\n'.join('  ' + path for path in sorted(paths)) + '\n' + block + '\n'
    text += MARKER
    text += '\nThe full licence texts above accompany these file-level notices.\n'
    for (licence, declaration), paths in sorted(declarations.items()):
        text += '\n' + declaration + '\nLicence: ' + licence + '\n'
        text += '\n'.join('  ' + path for path in sorted(paths)) + '\n'
    args.notices.write_text(text)


if __name__ == '__main__':
    main()
