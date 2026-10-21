#!/usr/bin/env python3
"""Finite Linux child-tree supervisor; not a namespace, RAM or disk-quota sandbox."""
import argparse
import ctypes
import hashlib
import json
import math
import os
import resource
import select
import signal
import stat
import sys
import time

MAXIMUM = {"cpuSeconds": 25.0, "termSeconds": 30.0, "killSeconds": 33.0,
           "terminalSeconds": 35.0, "addressSpaceBytes": 16 * 1024 ** 3,
           "fileBytes": 8 * 1024 ** 2, "ownedBytes": 64 * 1024 ** 2, "outputNodes": 4096}
RESULT_RESERVE = 1024 * 1024
MAX_PROCESSES = 2048
MAX_OUTPUT_FILES = 4096
SCOPE = ("Admitted wait/reap graph only: wait4 receipts cover processes and descendants "
         "they waited for; entirely unseen autoreaped descendants are not excluded. "
         "Proc polling is not a kernel-exact aggregate CPU limiter. Outer watchdog required.")


def reject(message):
    raise ValueError(message)


def pairs(items):
    value = {}
    for key, item in items:
        if key in value:
            reject("duplicate JSON key")
        value[key] = item
    return value


def fields(value, required, optional=()):
    if type(value) is not dict or not set(required) <= value.keys() or not value.keys() <= set(required) | set(optional):
        reject("unknown or missing schema fields")


def real_directory(path):
    if type(path) is not str or not os.path.isabs(path) or os.path.normpath(path) != path:
        reject("absolute normalized directory required")
    current = os.path.sep
    for part in path.split(os.path.sep)[1:]:
        current = os.path.join(current, part)
        if not stat.S_ISDIR(os.lstat(current).st_mode):
            reject("non-directory or symlink ancestor")


def file_identity(info):
    return (info.st_dev, info.st_ino, info.st_size, info.st_mtime_ns, info.st_ctime_ns)


def read_spec(filename):
    fd = os.open(filename, os.O_RDONLY | os.O_NOFOLLOW)
    try:
        before = os.fstat(fd)
        if not stat.S_ISREG(before.st_mode) or before.st_size > 65536:
            reject("spec byte bound")
        data = bytearray()
        while len(data) < before.st_size:
            chunk = os.read(fd, before.st_size - len(data))
            if not chunk:
                reject("spec changed")
            data.extend(chunk)
        if os.read(fd, 1) or file_identity(os.fstat(fd)) != file_identity(before):
            reject("spec changed")
        value = json.loads(bytes(data).decode("utf-8"), object_pairs_hook=pairs,
                           parse_constant=lambda value: reject("nonfinite JSON number"))
    finally:
        os.close(fd)
    fields(value, ("argv", "cwd", "outputRoot"), ("limits",))
    argv = value["argv"]
    if type(argv) is not list or not 1 <= len(argv) <= 256 or any(type(arg) is not str or "\0" in arg or len(arg) > 16384 for arg in argv):
        reject("argv schema")
    if not os.path.isabs(argv[0]) or not stat.S_ISREG(os.stat(argv[0]).st_mode) or not os.access(argv[0], os.X_OK):
        reject("admitted absolute executable required")
    real_directory(value["cwd"])
    root = value["outputRoot"]
    if type(root) is not str or not os.path.isabs(root) or os.path.normpath(root) != root or root == os.path.sep:
        reject("output root schema")
    real_directory(os.path.dirname(root))
    if os.path.lexists(root):
        reject("output root must be fresh")
    supplied = value.get("limits", {})
    fields(supplied, (), MAXIMUM)
    limits = dict(MAXIMUM)
    for key, number in supplied.items():
        if type(number) not in (int, float) or not math.isfinite(number) or number <= 0 or number > MAXIMUM[key]:
            reject("limits may only be lowered")
        if (key.endswith("Bytes") or key == "outputNodes") and type(number) is not int:
            reject("byte limit must be integer")
        limits[key] = number
    if not 0.1 <= limits["cpuSeconds"] or not 0 < limits["termSeconds"] < limits["killSeconds"] < limits["terminalSeconds"]:
        reject("deadline ordering")
    if (limits["fileBytes"] < 4096 or limits["ownedBytes"] < 2 * RESULT_RESERVE or
            limits["ownedBytes"] <= RESULT_RESERVE + 3 * limits["fileBytes"]):
        reject("output reserve")
    value["limits"] = limits
    return value


def proc_row(pid):
    with open(f"/proc/{pid}/stat", "rb") as stream:
        source = stream.read(65536)
    parts = source[source.rfind(b")") + 2:].split()
    if len(parts) < 20:
        reject("proc stat tail refused")
    return {"pid": pid, "ppid": int(parts[1]), "starttime": int(parts[19]),
            "state": parts[0].decode("ascii"), "ownTicks": int(parts[11]) + int(parts[12]),
            "childTicks": int(parts[13]) + int(parts[14])}


def children(pid):
    result = set()
    for thread in os.listdir(f"/proc/{pid}/task"):
        if not thread.isdecimal():
            continue
        with open(f"/proc/{pid}/task/{thread}/children", encoding="ascii") as stream:
            result.update(int(value) for value in stream.read(1024 * 1024).split())
        if len(result) > MAX_PROCESSES:
            reject("process inventory bound")
    return result


def inventory(root_fd, leaf_limit, total_limit, hashes=False, node_limit=MAX_OUTPUT_FILES):
    rows = []
    total = 0
    nodes = 0
    pending = [(os.dup(root_fd), "", None, None, None)]
    try:
        while pending:
            directory, prefix, parent, component, expected = pending.pop()
            try:
                directory_info = os.fstat(directory)
                if not stat.S_ISDIR(directory_info.st_mode) or stat.S_IMODE(directory_info.st_mode) != 0o700:
                    reject("output directory changed")
                # All traversal is relative to held no-follow directory FDs.
                with os.scandir(directory) as entries:
                    for entry in entries:
                        nodes += 1
                        if nodes > node_limit:
                            reject("output node bound")
                        name = prefix + entry.name
                        held = os.open(entry.name, os.O_PATH | os.O_NOFOLLOW, dir_fd=directory)
                        try:
                            info = os.fstat(held)
                            if stat.S_ISDIR(info.st_mode):
                                child = os.open(entry.name, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=directory)
                                opened = os.fstat(child)
                                if ((opened.st_dev, opened.st_ino) != (info.st_dev, info.st_ino) or
                                        not stat.S_ISDIR(opened.st_mode) or stat.S_IMODE(opened.st_mode) != 0o700):
                                    os.close(child)
                                    reject("output directory replaced")
                                pending.append((child, name + "/", os.dup(directory), entry.name, (info.st_dev, info.st_ino)))
                            elif stat.S_ISREG(info.st_mode):
                                if info.st_nlink != 1 or stat.S_IMODE(info.st_mode) != 0o600 or info.st_size > leaf_limit:
                                    reject("output leaf bound or identity")
                                total += info.st_size
                                if total > total_limit - RESULT_RESERVE - 3 * leaf_limit:
                                    reject("output aggregate reserve bound")
                                row = {"name": name, "bytes": info.st_size}
                                if hashes:
                                    # This is our own held O_PATH descriptor, not
                                    # an untrusted filesystem symlink. Type is
                                    # checked before opening the kernel fd view.
                                    fd = os.open(f"/proc/self/fd/{held}", os.O_RDONLY)
                                    try:
                                        if file_identity(os.fstat(fd)) != file_identity(info):
                                            reject("output replaced")
                                        digest = hashlib.sha256()
                                        offset = 0
                                        while offset < info.st_size:
                                            block = os.read(fd, min(65536, info.st_size - offset))
                                            if not block:
                                                reject("output changed")
                                            digest.update(block); offset += len(block)
                                        if os.read(fd, 1) or file_identity(os.fstat(fd)) != file_identity(info):
                                            reject("output changed")
                                        row["sha256"] = digest.hexdigest()
                                    finally:
                                        os.close(fd)
                                rows.append(row)
                            else:
                                reject("output is not a regular leaf or directory")
                            current = os.stat(entry.name, dir_fd=directory, follow_symlinks=False)
                            if (current.st_dev, current.st_ino) != (info.st_dev, info.st_ino):
                                reject("output entry replaced")
                        finally:
                            os.close(held)
                if parent is not None:
                    current = os.stat(component, dir_fd=parent, follow_symlinks=False)
                    if (current.st_dev, current.st_ino) != expected or not stat.S_ISDIR(current.st_mode):
                        reject("output directory edge changed")
            finally:
                os.close(directory)
                if parent is not None:
                    os.close(parent)
    finally:
        for directory, _, parent, _, _ in pending:
            os.close(directory)
            if parent is not None:
                os.close(parent)
    return rows, total


class Supervisor:
    def __init__(self, spec):
        self.spec = spec
        self.limits = spec["limits"]
        self.started = time.monotonic()
        self.handles = {}
        self.handle_generation = 0
        self.receipts = []
        self.signals = []
        self.sent = set()
        self.failures = []
        self.root_status = None
        self.root_pid = None
        self.root_fd = None
        self.streams = {}
        self.capture_records = []
        self.reaped_cpu = 0.0
        self.observed_peak = 0.0
        self.samples = 0
        self.term_sent = False
        self.kill_sent = False
        self.echild = False
        self.interrupted = False
        self.uncertain_since = None
        self.clock_ticks = os.sysconf("SC_CLK_TCK")

    def failure(self, code):
        if code not in self.failures:
            self.failures.append(code)

    def handle_alive(self, fd):
        poll = select.poll()
        poll.register(fd, select.POLLIN | select.POLLHUP | select.POLLERR)
        return not poll.poll(0)

    def admit(self, pid, parent):
        # Admission is from an actual current owned parent edge, never a
        # historical PID/starttime alone. Retain the kernel identity handle.
        parent_handle = None if parent == os.getpid() else self.handles.get(parent)
        if parent != os.getpid() and (parent_handle is None or not self.handle_alive(parent_handle["fd"])):
            raise ProcessLookupError("owned parent changed")
        if pid not in children(parent):
            raise ProcessLookupError("owned edge changed")
        before = proc_row(pid)
        if before["ppid"] != parent:
            raise ProcessLookupError("owned parent changed")
        held = self.handles.get(pid)
        if held is not None and self.handle_alive(held["fd"]):
            if held["starttime"] != before["starttime"]:
                reject("owned identity observation differs")
        else:
            if held is not None:
                os.close(held["fd"])
                del self.handles[pid]
            fd = os.pidfd_open(pid, 0)
            try:
                after = proc_row(pid)
                if after["starttime"] != before["starttime"] or after["ppid"] != parent or pid not in children(parent):
                    raise ProcessLookupError("owned edge changed")
                if parent_handle is not None and not self.handle_alive(parent_handle["fd"]):
                    raise ProcessLookupError("owned parent changed")
                if len(self.handles) >= MAX_PROCESSES:
                    reject("owned handle bound")
                self.handle_generation += 1
                held = {"fd": fd, "starttime": after["starttime"], "generation": self.handle_generation}
                self.handles[pid] = held
                fd = None
            finally:
                if fd is not None:
                    os.close(fd)
        after = proc_row(pid)
        if after["ppid"] != parent or after["starttime"] != held["starttime"] or pid not in children(parent):
            raise ProcessLookupError("owned edge changed")
        if parent_handle is not None and not self.handle_alive(parent_handle["fd"]):
            raise ProcessLookupError("owned parent changed")
        return after

    def closure(self):
        rows = {}
        pending = [(pid, os.getpid()) for pid in children(os.getpid())]
        while pending:
            pid, parent = pending.pop()
            if pid in rows:
                continue
            row = self.admit(pid, parent)
            rows[pid] = row
            if len(rows) > MAX_PROCESSES:
                reject("process inventory bound")
            pending.extend((child, pid) for child in children(pid))
        return rows

    def drain(self):
        # Collect direct identities before wait4. A newly adopted child can
        # exit between this read and wait4; its kernel child receipt is owned,
        # but its unobserved starttime is honestly recorded as null.
        identities = {}
        try:
            for pid in children(os.getpid()):
                identities[pid] = proc_row(pid)["starttime"]
        except (FileNotFoundError, ProcessLookupError):
            pass
        self.echild = False
        while True:
            try:
                pid, status, usage = os.wait4(-1, os.WNOHANG)
            except ChildProcessError:
                self.echild = True
                return
            if not pid:
                return
            if not (os.WIFEXITED(status) or os.WIFSIGNALED(status)):
                reject("nonterminal wait receipt")
            cpu = usage.ru_utime + usage.ru_stime
            self.reaped_cpu += cpu
            receipt = {"pid": pid, "starttime": identities.get(pid), "waitStatus": status,
                       "exitCode": os.WEXITSTATUS(status) if os.WIFEXITED(status) else None,
                       "signal": os.WTERMSIG(status) if os.WIFSIGNALED(status) else None,
                       "userSeconds": usage.ru_utime, "systemSeconds": usage.ru_stime}
            self.receipts.append(receipt)
            if len(self.receipts) > MAX_PROCESSES:
                reject("receipt inventory bound")
            if pid == self.root_pid:
                self.root_status = receipt
                if receipt["exitCode"] != 0:
                    self.failure("original_exit_failure")
            elif receipt["exitCode"] != 0:
                self.failure("descendant_exit_failure")

    def cpu_sample(self):
        first = self.closure()
        second = self.closure()
        signature = lambda rows: {pid: (row["starttime"], row["ppid"], row["childTicks"]) for pid, row in rows.items()}
        if signature(first) != signature(second):
            raise ProcessLookupError("unstable process partition")
        own = resource.getrusage(resource.RUSAGE_SELF)
        self_cpu = own.ru_utime + own.ru_stime
        ticks = sum(row["ownTicks"] + row["childTicks"] for row in second.values())
        # Four rounded proc counters per live process; the reserve also causes
        # early termination. Final accounting never adds this live estimate.
        reserve = 4 * len(second) / self.clock_ticks
        total = self_cpu + self.reaped_cpu + ticks / self.clock_ticks + reserve
        self.observed_peak = max(self.observed_peak, total)
        self.samples += 1
        return second, total

    def send(self, which):
        # Never reopen a numeric PID here. Even after an unstable observation,
        # only previously admitted retained kernel handles can receive signals.
        for pid, held in list(self.handles.items()):
            identity = (held["generation"], which)
            if identity in self.sent:
                continue
            try:
                signal.pidfd_send_signal(held["fd"], which)
                self.sent.add(identity)
                self.signals.append({"pid": pid, "starttime": held["starttime"],
                                     "generation": held["generation"], "signal": which})
            except ProcessLookupError:
                self.sent.add(identity)
            except (OSError, ValueError):
                self.failure("owned_signal_refused")

    def launch(self, stdout, stderr):
        pid = os.fork()
        if pid == 0:
            try:
                os.setsid()
                resource.setrlimit(resource.RLIMIT_CORE, (0, 0))
                resource.setrlimit(resource.RLIMIT_AS, (self.limits["addressSpaceBytes"],) * 2)
                resource.setrlimit(resource.RLIMIT_FSIZE, (self.limits["fileBytes"],) * 2)
                cpu = math.ceil(self.limits["cpuSeconds"])
                resource.setrlimit(resource.RLIMIT_CPU, (cpu, cpu))
                os.umask(0o077)
                os.chdir(self.spec["cwd"])
                null = os.open(os.devnull, os.O_RDONLY)
                os.dup2(null, 0); os.dup2(stdout, 1); os.dup2(stderr, 2)
                os.closerange(3, resource.getrlimit(resource.RLIMIT_NOFILE)[0])
                root = self.spec["outputRoot"]
                env = {"PATH": "/usr/bin:/bin", "LANG": "C", "LC_ALL": "C", "TZ": "UTC",
                       "HOME": os.path.join(root, "home"), "TMPDIR": os.path.join(root, "tmp")}
                os.execve(self.spec["argv"][0], self.spec["argv"], env)
            except BaseException:
                os.write(2, b"supervised child setup refused\n")
                os._exit(125)
        self.root_pid = pid
        self.admit(pid, os.getpid())

    def check_streams(self):
        for name, fd in self.streams.items():
            held = os.fstat(fd)
            try:
                entry = os.stat(name, dir_fd=self.root_fd, follow_symlinks=False)
                matches = (entry.st_dev, entry.st_ino) == (held.st_dev, held.st_ino)
            except FileNotFoundError:
                matches = False
            if not matches or not stat.S_ISREG(held.st_mode) or held.st_size > self.limits["fileBytes"]:
                self.failure("original_stream_replaced")

    def retain_streams(self):
        for name, fd in list(self.streams.items()):
            target = None
            try:
                held = os.fstat(fd)
                if not stat.S_ISREG(held.st_mode) or held.st_size > self.limits["fileBytes"]:
                    reject("original stream bound")
                try:
                    entry = os.stat(name, dir_fd=self.root_fd, follow_symlinks=False)
                    matches = (entry.st_dev, entry.st_ino) == (held.st_dev, held.st_ino)
                except FileNotFoundError:
                    matches = False
                retained_name = name
                if not matches:
                    self.failure("original_stream_replaced")
                    retained_name = "original-" + name + "-" + os.urandom(8).hex()
                    target = os.open(retained_name, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW,
                                     0o600, dir_fd=self.root_fd)
                digest = hashlib.sha256()
                offset = 0
                while offset < held.st_size:
                    block = os.pread(fd, min(65536, held.st_size - offset), offset)
                    if not block:
                        reject("original stream changed")
                    digest.update(block)
                    if target is not None:
                        at = 0
                        while at < len(block):
                            written = os.write(target, block[at:])
                            if written <= 0:
                                reject("original stream write refused")
                            at += written
                    offset += len(block)
                if file_identity(os.fstat(fd)) != file_identity(held):
                    reject("original stream changed")
                self.capture_records.append({"stream": name, "retainedName": retained_name,
                                             "bytes": held.st_size, "sha256": digest.hexdigest(),
                                             "originalNameIntact": matches})
            except (OSError, ValueError):
                self.failure("original_capture_retention_refused")
            finally:
                if target is not None:
                    os.close(target)
                os.close(fd)
                del self.streams[name]

    def run(self):
        root = self.spec["outputRoot"]
        os.mkdir(root, 0o700)
        self.root_fd = os.open(root, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
        os.mkdir("home", 0o700, dir_fd=self.root_fd)
        os.mkdir("tmp", 0o700, dir_fd=self.root_fd)
        flags = os.O_RDWR | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW
        stdout = os.open("stdout.bin", flags, 0o600, dir_fd=self.root_fd)
        stderr = os.open("stderr.bin", flags, 0o600, dir_fd=self.root_fd)
        self.streams = {"stdout.bin": stdout, "stderr.bin": stderr}
        old_term = signal.signal(signal.SIGTERM, lambda *_: setattr(self, "interrupted", True))
        old_int = signal.signal(signal.SIGINT, lambda *_: setattr(self, "interrupted", True))
        remaining = {}
        complete = False
        try:
            try:
                self.launch(stdout, stderr)
            except (OSError, ValueError):
                self.failure("launch_observation_refused")
            while True:
                now = time.monotonic() - self.started
                try:
                    self.drain()
                except (OSError, ValueError):
                    self.failure("wait_receipt_refused")
                try:
                    remaining, cpu = self.cpu_sample()
                    self.uncertain_since = None
                    if cpu >= self.limits["cpuSeconds"]:
                        self.failure("cpu_bound")
                except (FileNotFoundError, ProcessLookupError):
                    if self.uncertain_since is None:
                        self.uncertain_since = now
                    if now - self.uncertain_since >= 0.1:
                        self.failure("accounting_unstable")
                    remaining = {pid: {"pid": pid, "starttime": held["starttime"]}
                                 for pid, held in self.handles.items() if self.handle_alive(held["fd"])}
                except (OSError, ValueError):
                    self.failure("ownership_inventory_refused")
                    remaining = {pid: {"pid": pid, "starttime": held["starttime"]}
                                 for pid, held in self.handles.items() if self.handle_alive(held["fd"])}
                try:
                    inventory(self.root_fd, self.limits["fileBytes"], self.limits["ownedBytes"], node_limit=self.limits["outputNodes"])
                    self.check_streams()
                except (OSError, ValueError) as error:
                    if str(error) == "output node bound":
                        self.failure("output_node_bound")
                    self.failure("output_inventory_refused")
                if self.interrupted:
                    self.failure("supervisor_interrupted")
                if now >= self.limits["termSeconds"]:
                    self.failure("wall_term")
                if self.echild and not remaining:
                    complete = True
                    break
                if self.failures:
                    self.send(signal.SIGTERM)
                    self.term_sent = True
                immediate = any(reason in self.failures for reason in
                                ("cpu_bound", "accounting_unstable", "ownership_inventory_refused", "output_inventory_refused",
                                 "launch_observation_refused", "wait_receipt_refused", "owned_signal_refused", "original_stream_replaced"))
                if immediate or now >= self.limits["killSeconds"]:
                    self.send(signal.SIGKILL)
                    self.kill_sent = True
                if now >= self.limits["terminalSeconds"]:
                    self.failure("terminal_incomplete")
                    break
                time.sleep(0.01)
        finally:
            signal.signal(signal.SIGTERM, old_term)
            signal.signal(signal.SIGINT, old_int)
        # Keep original stream inodes alive through terminal validation and
        # bounded rescue, even if their pathnames were removed or replaced.
        self.retain_streams()
        outputs = []
        try:
            if complete:
                outputs, _ = inventory(self.root_fd, self.limits["fileBytes"], self.limits["ownedBytes"], hashes=True, node_limit=self.limits["outputNodes"])
                by_name = {row["name"]: row for row in outputs}
                for captured in self.capture_records:
                    row = by_name.get(captured["retainedName"])
                    if row is None or row["bytes"] != captured["bytes"] or row["sha256"] != captured["sha256"]:
                        reject("original capture content changed")
        except (OSError, ValueError):
            self.failure("final_output_refused")
        finally:
            for fd in self.streams.values():
                os.close(fd)
            self.streams = {}
        own = resource.getrusage(resource.RUSAGE_SELF)
        final_cpu = own.ru_utime + own.ru_stime + self.reaped_cpu
        if final_cpu > self.limits["cpuSeconds"]:
            self.failure("final_cpu_bound")
        return {"schema": "brickwright/private-assessment-supervisor/v1",
                "success": complete and not self.failures and self.root_status is not None,
                "terminal": complete, "root": self.root_status, "failures": self.failures,
                "subreaper": True, "supervisorPid": os.getpid(),
                "limits": self.limits, "receipts": self.receipts, "signals": self.signals,
                "cpu": {"reapedSeconds": self.reaped_cpu, "supervisorSeconds": own.ru_utime + own.ru_stime,
                        "finalReceiptPartitionSeconds": final_cpu, "observedWithReserveSeconds": self.observed_peak,
                        "stableSamples": self.samples, "arbitraryGraphExact": False,
                        "measurementBoundary": "After output hashes, before result serialization/write; outer watchdog covers remainder"},
                "accountingScope": SCOPE, "wallSeconds": time.monotonic() - self.started,
                "cleanup": {"echild": self.echild, "ownedRemaining": list(remaining.values()),
                            "termSent": self.term_sent, "killSent": self.kill_sent},
                "captures": self.capture_records, "outputs": outputs}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--spec", required=True)
    args = parser.parse_args()
    spec = read_spec(args.spec)
    if not hasattr(os, "pidfd_open") or not hasattr(signal, "pidfd_send_signal"):
        reject("stdlib pidfd support required")
    libc = ctypes.CDLL(None, use_errno=True)
    current = ctypes.c_int()
    if libc.prctl(36, 1, 0, 0, 0) != 0 or libc.prctl(37, ctypes.byref(current), 0, 0, 0) != 0 or current.value != 1:
        reject("subreaper setup refused")
    if children(os.getpid()):
        reject("supervisor requires no pre-existing children")
    supervisor = Supervisor(spec)
    result = supervisor.run()
    encoded = (json.dumps(result, separators=(",", ":"), allow_nan=False) + "\n").encode()
    if len(encoded) > RESULT_RESERVE:
        reject("result reserve exceeded")
    fd = os.open("result.json", os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600, dir_fd=supervisor.root_fd)
    try:
        with os.fdopen(fd, "wb") as stream:
            stream.write(encoded)
    finally:
        os.close(supervisor.root_fd)
        for held in supervisor.handles.values():
            os.close(held["fd"])
    return 0 if result["success"] else 1


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (OSError, ValueError, json.JSONDecodeError):
        # No raw argv, paths, private input or provider exception in public stderr.
        sys.stderr.write("private assessment supervisor setup refused\n")
        sys.exit(2)
