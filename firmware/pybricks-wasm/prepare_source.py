#!/usr/bin/env python3
# SPDX-License-Identifier: BSD-3-Clause
# Copyright (c) 2026 Brickwright contributors
"""Prepare a private build tree from pinned sources and audited caller conversion.

This integration script is written by the exposed reviewer. It does not claim
isolated authorship. The converter and numeric components have separate inputs.
Never modifies the pinned source checkout; no removed helper is copied.
"""
import argparse
import hashlib
import json
from pathlib import Path
import re
import shutil
import subprocess
import sys


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    source, output = args.source.resolve(), args.output.resolve()
    if source == output or source in output.parents or output in source.parents:
        parser.error("source and output must not overlap")
    if output.exists():
        parser.error("output must not already exist")
    here = Path(__file__).resolve().parent
    conversion = output.with_name(output.name + "-callers")
    if conversion.exists():
        parser.error("conversion staging directory must not already exist")
    excluded = source / "pybricks/iodevices/pb_type_iodevices_xbox_controller.c"
    if hashlib.sha256(excluded.read_bytes()).hexdigest() != "b94dd92547f32b6df838e78b444c8f7ea481adefb326b2c039f44902405e9d66":
        raise ValueError("non-free Xbox module differs from audited pinned source")
    config = (here / "mpconfigport.h").read_text()
    if not re.search(r"^#define\s+PYBRICKS_PY_IODEVICES_XBOX_CONTROLLER\s+\(0\)$", config, re.M):
        raise ValueError("non-free Xbox module must be disabled")
    try:
        shutil.copytree(source, output, ignore=shutil.ignore_patterns(".git", "pb_kwarg_helper.h", "pb_type_iodevices_xbox_controller.c", "__pycache__"))
        # The implementer did not access these callers. Applying its converter
        # to the licensed subset is the reviewer's integration phase.
        subprocess.run([sys.executable, str(here / "contract-only/remove_arg_macros.py"),
                        str(output), str(conversion), "--manifest", str(conversion / "manifest.json")], check=True)
        # Unmarked device timing code has no verified permissive grant.
        shutil.copyfile(here / "contract-only/device_timing.c", output / "lib/lego/device.c")
        for caller in conversion.rglob("*"):
            if caller.is_file() and caller.name != "manifest.json":
                destination = output / caller.relative_to(conversion)
                destination.parent.mkdir(parents=True, exist_ok=True)
                shutil.copyfile(caller, destination)
        shutil.copyfile(conversion / "manifest.json", output / "argument-conversion.json")
        # Remove the single cited numeric formula from MicroPython; retain all
        # unrelated code and its MIT notice. The new component is independent.
        smallint = output / "micropython/py/smallint.h"
        original = smallint.read_text()
        updated, count = re.subn(r"(?m)^// https://stackoverflow\.com/a/4589384/1976323\n//[^\n]*\n#define MP_IMAX_BITS\(m\)[^\n]*", '#include "integer_width.h"', original)
        if count != 1 or "stackoverflow.com/a/4589384" in updated:
            raise ValueError("smallint formula removal did not match the pinned source exactly")
        smallint.write_text(updated)
        if any(output.rglob("pb_kwarg_helper.h")):
            raise ValueError("forbidden helper present in prepared tree")
    except BaseException:
        shutil.rmtree(output, ignore_errors=True)
        raise
    finally:
        shutil.rmtree(conversion, ignore_errors=True)
    print(f"Prepared source tree: {output}")


if __name__ == "__main__":
    main()
