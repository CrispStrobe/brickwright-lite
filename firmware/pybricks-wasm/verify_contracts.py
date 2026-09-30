#!/usr/bin/env python3
# SPDX-License-Identifier: BSD-3-Clause
# Copyright (c) 2026 Brickwright contributors
"""Replay delivered contract tests without modifying archived access records."""
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile

root = Path(__file__).resolve().parent / 'contract-only'
subprocess.run([sys.executable, str(root / 'test_remove_arg_macros.py')], check=True, cwd=root)
with tempfile.TemporaryDirectory(prefix='brickwright-contract-tests-') as directory:
    temporary = Path(directory)
    for name in ['numeric_scale.c', 'integer_width.h', 'device_timing.c']:
        shutil.copyfile(root / name, temporary / name)
    for path in (root / 'records/numeric').iterdir():
        if path.is_file():
            shutil.copyfile(path, temporary / path.name)
    for name in ['test_contracts.py', 'test_device_timing.py']:
        subprocess.run([sys.executable, str(temporary / name)], check=True, cwd=temporary)
