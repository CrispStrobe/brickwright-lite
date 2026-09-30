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
    text = args.notices.read_text().split(MARKER)[0] + MARKER
    text += '\nThe full licence texts above accompany these file-level notices.\n'
    for (licence, declaration), paths in sorted(declarations.items()):
        text += '\n' + declaration + '\nLicence: ' + licence + '\n'
        text += '\n'.join('  ' + path for path in sorted(paths)) + '\n'
    args.notices.write_text(text)


if __name__ == '__main__':
    main()
