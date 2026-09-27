#!/usr/bin/env python3
# SPDX-License-Identifier: BSD-3-Clause
# Copyright (c) 2026 Brickwright contributors
"""Licence gate for the Pybricks wasm hub build.

Reads the compiler's dependency files (*.P) from the build directory, so the
set it judges is every source and header the compiler actually opened -- not a
list someone maintains. Each file from the Pybricks tree or from this
directory must carry a permissive licence. Exits non-zero, naming the files,
when one does not.

usage: licence_gate.py BUILD_DIR PBTOP WASM_DIR [--json OUT]
"""

import json
import os
import re
import sys

PERMISSIVE = {"MIT", "BSD-3-Clause", "BSD-2-Clause", "BSD-1-Clause", "Apache-2.0", "ISC", "Zlib"}

# Directories that must never be compiled in: Bluetooth stacks and vendor
# HALs with non-free or chip-restricted licences.
FORBIDDEN_DIRS = (
    "lib/btstack/",
    "lib/ble5stack/",
    "lib/BlueNRG-MS/",
    "lib/STM32_USB_Device_Library/",
    "lib/tiam1808/",
    "lib/lsm6ds3tr_c_STdC/",
    "lib/umm_malloc/",
    "micropython/lib/stm32lib/",
    "micropython/lib/btstack/",
)

# Share-alike licences are refused outright, not reviewed case by case: a
# CC-BY-SA file in the compiled set fails the build whether it says so in an
# SPDX line or only in prose. Pybricks' pb_kwarg_helper.h was the one such
# file (MIT AND CC-BY-SA-4.0); it is replaced below and must not come back.
SHARE_ALIKE = re.compile(r"CC[- ]BY[- ]SA|creativecommons\.org/licenses/by-sa", re.IGNORECASE)

# Upstream files that must NOT be compiled, each with the Brickwright file
# that stands in for it (found first on the include path, see the Makefile).
# Both halves are checked: the upstream file absent, the stand-in present.
REPLACED = {
    "pybricks/util_mp/pb_kwarg_helper.h": "brickwright:upstream-overlay/pybricks/util_mp/pb_kwarg_helper.h",
    # int_math.c is compiled from a copy with one function removed (see the
    # Makefile); the copy is in the build directory and scanned below.
    "lib/pbio/src/int_math.c": "brickwright:upstream-overlay/lib/pbio/src/int_math_mult_then_div.c",
}

PERMISSIVE_TEXT = (
    re.compile(r"Permission is hereby granted, free of charge"),
    re.compile(r"The MIT License"),
    re.compile(r"Redistribution and use in source and binary forms"),
)


def dep_files(build):
    for root, _dirs, files in os.walk(build):
        for name in files:
            if name.endswith(".P") or name.endswith(".d"):
                yield os.path.join(root, name)


def deps(path):
    with open(path, encoding="utf-8", errors="replace") as f:
        text = f.read().replace("\\\n", " ")
    for line in text.splitlines():
        if ":" not in line:
            continue
        for token in line.split(":", 1)[1].split():
            yield token


def spdx_ids(text):
    ids = set()
    for m in re.finditer(r"SPDX-License-Identifier:\s*([^\n*]+)", text):
        for part in re.split(r"\s+(?:AND|OR|WITH)\s+|[()]", m.group(1)):
            part = part.strip().strip("*/ ").strip()
            if part:
                ids.add(part)
    return ids


def main():
    args = sys.argv[1:]
    out_json = None
    if "--json" in args:
        i = args.index("--json")
        out_json = args[i + 1]
        del args[i:i + 2]
    build, pbtop, wasm_dir = (os.path.abspath(a) for a in args)

    seen = {}
    for dep in dep_files(build):
        base = os.path.dirname(dep)
        for token in deps(dep):
            # Relative paths in deps are relative to the make directory.
            path = token if os.path.isabs(token) else os.path.join(wasm_dir, token)
            if not os.path.exists(path):
                path = os.path.join(pbtop, "micropython", token)
            if not os.path.exists(path):
                path = os.path.join(pbtop, token)
            path = os.path.realpath(path)
            if os.path.exists(path):
                seen[path] = True

    failures = []
    summary = {"files": 0, "by_licence": {}, "replaced": [], "outside_tree": 0}
    read = set()
    for path in sorted(seen):
        if path.startswith(build + os.sep):
            # Generated during the build from the files below, so not counted,
            # but derived copies must not carry share-alike text either.
            with open(path, encoding="utf-8", errors="replace") as f:
                if SHARE_ALIKE.search(f.read()):
                    failures.append(f"build:{os.path.relpath(path, build)}: share-alike (CC-BY-SA) material is not allowed in this build")
            continue
        if path.startswith(pbtop + os.sep):
            rel = os.path.relpath(path, pbtop)
        elif path.startswith(wasm_dir + os.sep):
            rel = "brickwright:" + os.path.relpath(path, wasm_dir)
        else:
            summary["outside_tree"] += 1  # toolchain sysroot (emscripten libc)
            continue
        summary["files"] += 1
        read.add(rel)
        for bad in FORBIDDEN_DIRS:
            if rel.startswith(bad):
                failures.append(f"{rel}: forbidden directory {bad}")
        with open(path, encoding="utf-8", errors="replace") as f:
            whole = f.read()
        text = whole[:8192]
        ids = spdx_ids(text)
        if SHARE_ALIKE.search(whole) or any(i.upper().startswith("CC-BY-SA") for i in ids):
            failures.append(f"{rel}: share-alike (CC-BY-SA) material is not allowed in this build")
        if ids:
            key = " AND ".join(sorted(ids))
            if not ids <= PERMISSIVE:
                failures.append(f"{rel}: {key}")
        elif any(p.search(text) for p in PERMISSIVE_TEXT):
            key = "permissive (licence text, no SPDX tag)"
        else:
            # Both repositories are MIT as a whole (their top-level LICENSE
            # files, checked by build-pybricks-wasm.sh) and some small files
            # carry no per-file notice. Brickwright's own files must.
            key = "no per-file marker (repository LICENSE: MIT)"
            if rel.startswith("brickwright:"):
                failures.append(f"{rel}: no licence marker")
        summary["by_licence"][key] = summary["by_licence"].get(key, 0) + 1

    for upstream, standin in sorted(REPLACED.items()):
        if upstream in read:
            failures.append(f"{upstream}: replaced upstream file was compiled; {standin} must shadow it")
        if standin not in read:
            failures.append(f"{standin}: stand-in for {upstream} was not compiled")
        if upstream not in read and standin in read:
            summary["replaced"].append(f"{upstream} -> {standin}")

    if out_json:
        with open(out_json, "w") as f:
            json.dump(summary, f, indent=2, sort_keys=True)
            f.write("\n")
    print(json.dumps(summary, indent=2, sort_keys=True))
    if failures:
        print("LICENCE GATE FAILED:", file=sys.stderr)
        for line in failures:
            print("  " + line, file=sys.stderr)
        return 1
    print(f"licence gate: {summary['files']} files read by the compiler, all permissive")
    return 0


if __name__ == "__main__":
    sys.exit(main())
