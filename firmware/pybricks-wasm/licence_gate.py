#!/usr/bin/env python3
# SPDX-License-Identifier: BSD-3-Clause
# Copyright (c) 2026 Brickwright contributors
"""Licence gate for the Pybricks wasm hub build.

Reads the compiler's dependency files (*.P) from the build directory, so the
set it judges is every source and header the compiler actually opened -- not a
list someone maintains. Each file from the Pybricks tree or from this
directory must carry a permissive licence and must not be a disputed input.
Exits non-zero, naming the files, when one does not.

usage: licence_gate.py BUILD_DIR PBTOP WASM_DIR [--json OUT]
"""

import hashlib
import json
import os
import re
import sys

PERMISSIVE = {"MIT", "BSD-3-Clause", "BSD-2-Clause", "BSD-1-Clause", "Apache-2.0", "ISC", "Zlib"}

# Directories that must never be compiled in: Bluetooth stacks and vendor
# HALs with non-free or chip-restricted licences.
FORBIDDEN_DIRS = (
    "pybricks/iodevices/pb_type_iodevices_xbox_controller.c",
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
# SPDX line or only in prose. A replacement with a permissive label does
# not establish independent authorship; disputed inputs also fail by path.
SHARE_ALIKE = re.compile(r"CC[- ]BY[- ]SA|creativecommons\.org/licenses/by-sa", re.IGNORECASE)

# Upstream files that must NOT be compiled, each with the Brickwright file
# that stands in for it (found first on the include path, see the Makefile).
# Both halves are checked: the upstream file absent, the stand-in present.
REPLACED = {
    "lib/pbio/src/int_math.c": "brickwright:contract-only/numeric_scale.c",
}
REQUIRED = {"brickwright:contract-only/integer_width.h"}
ANSWER_REFERENCE = re.compile(r"stackoverflow\.com/(?:a/\d+|questions/\d+/[^\s/]+/\d+)", re.IGNORECASE)

# Unmarked inputs need an actual MIT grant, not a licence title or one BSD
# sentence that could also belong to a four-clause or restricted licence.
MIT_GRANT = re.compile(r"Permission is hereby granted, free of charge")
MIT_UNRESTRICTED = re.compile(r"without restriction")
MIT_NOTICE = re.compile(r"copyright notice and this permission notice")



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
    toolchain_root = None
    if "--toolchain-root" in args:
        i = args.index("--toolchain-root")
        toolchain_root = os.path.realpath(args[i + 1])
        del args[i:i + 2]
    if "--json" in args:
        i = args.index("--json")
        out_json = args[i + 1]
        del args[i:i + 2]
    build, pbtop, wasm_dir = (os.path.realpath(a) for a in args)

    seen = {}
    unresolved = []
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
            else:
                unresolved.append(f"{dep}: unresolved compiler dependency {token}")

    failures = list(unresolved)
    summary = {"files": 0, "by_licence": {}, "replaced": [], "outside_tree": 0, "inputs": [], "removed_dependency": "pb_kwarg_helper.h", "toolchain_inputs": []}
    read = set()
    for path in sorted(seen):
        if path.startswith(build + os.sep) and not path.startswith(pbtop + os.sep):
            # Generated during the build from the files below, so not counted,
            # but derived copies must not carry share-alike text either.
            with open(path, encoding="utf-8", errors="replace") as f:
                generated = f.read()
            generated_rel = "build:" + os.path.relpath(path, build)
            if os.path.basename(path) == "pb_kwarg_helper.h":
                failures.append(f"{generated_rel}: removed argument-helper dependency was compiled")
            if SHARE_ALIKE.search(generated):
                failures.append(f"{generated_rel}: share-alike (CC-BY-SA) material is not allowed in this build")
            if ANSWER_REFERENCE.search(generated):
                failures.append(f"{generated_rel}: Stack Overflow answer reference requires provenance review")
            if not spdx_ids(generated) <= PERMISSIVE:
                failures.append(f"{generated_rel}: non-permissive generated input")
            continue
        if path.startswith(pbtop + os.sep):
            rel = os.path.relpath(path, pbtop)
        elif path.startswith(wasm_dir + os.sep):
            rel = "brickwright:" + os.path.relpath(path, wasm_dir)
        else:
            if toolchain_root is None or not path.startswith(toolchain_root + os.sep):
                failures.append(f"{path}: compiler dependency outside audited source and pinned toolchain roots")
                continue
            summary["outside_tree"] += 1
            with open(path, encoding="utf-8", errors="replace") as f:
                toolchain_text = f.read()
            if SHARE_ALIKE.search(toolchain_text) or ANSWER_REFERENCE.search(toolchain_text):
                failures.append(f"{path}: pinned toolchain header requires additional provenance review")
            summary["toolchain_inputs"].append({"path": os.path.relpath(path, toolchain_root), "sha256": hashlib.sha256(toolchain_text.encode()).hexdigest()})
            continue
        summary["files"] += 1
        read.add(rel)
        if os.path.basename(path) == "pb_kwarg_helper.h":
            failures.append(f"{rel}: removed argument-helper dependency was compiled")
        for bad in FORBIDDEN_DIRS:
            if rel.startswith(bad):
                failures.append(f"{rel}: forbidden directory {bad}")
        with open(path, encoding="utf-8", errors="replace") as f:
            whole = f.read()
        if ANSWER_REFERENCE.search(whole):
            failures.append(f"{rel}: Stack Overflow answer reference requires provenance review")
        text = whole[:8192]
        ids = spdx_ids(text)
        if SHARE_ALIKE.search(whole) or any(i.upper().startswith("CC-BY-SA") for i in ids):
            failures.append(f"{rel}: share-alike (CC-BY-SA) material is not allowed in this build")
        if ids:
            key = " AND ".join(sorted(ids))
            if not ids <= PERMISSIVE:
                failures.append(f"{rel}: {key}")
        elif MIT_GRANT.search(text) and MIT_UNRESTRICTED.search(text) and MIT_NOTICE.search(text):
            key = "permissive (licence text, no SPDX tag)"
        else:
            # MicroPython's repository licence covers its unmarked files.
            # Pybricks' licence explicitly limits its default to marked files.
            key = "no per-file marker (MicroPython repository LICENSE: MIT)"
            if not rel.startswith("micropython/"):
                key = "unresolved (no per-file licence marker)"
                failures.append(f"{rel}: no licence marker; Pybricks repository default is insufficient")
        summary["inputs"].append({"path": rel, "sha256": hashlib.sha256(whole.encode()).hexdigest(), "licence": key, "copyright": [line.strip() for line in whole.splitlines() if "copyright" in line.lower()][:12]})
        summary["by_licence"][key] = summary["by_licence"].get(key, 0) + 1

    for upstream, standin in sorted(REPLACED.items()):
        if upstream in read:
            failures.append(f"{upstream}: replaced upstream file was compiled; {standin} must shadow it")
        if standin not in read:
            failures.append(f"{standin}: stand-in for {upstream} was not compiled")
        if upstream not in read and standin in read:
            summary["replaced"].append(f"{upstream} -> {standin}")

    for required in sorted(REQUIRED):
        if required not in read:
            failures.append(f"{required}: required contract-only component was not compiled")

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
