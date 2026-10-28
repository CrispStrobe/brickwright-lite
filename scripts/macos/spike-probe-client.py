# SPDX-License-Identifier: BSD-3-Clause
# Copyright (c) 2026 Brickwright contributors
# Reads the first SPIKE state-service snapshot, advances 4 s through the monitor, reads a second.
import json, socket, sys, time
state_port, monitor_port, timeout, out = int(sys.argv[1]), int(sys.argv[2]), float(sys.argv[3]), sys.argv[4]
def snapshot(deadline):
    while time.time() < deadline:
        try:
            s = socket.create_connection(('127.0.0.1', state_port), timeout=5)
        except OSError:
            time.sleep(0.5); continue
        s.settimeout(60); buf = b''
        while b'\n' not in buf:
            chunk = s.recv(65536)
            if not chunk: break
            buf += chunk
        s.close()
        if b'\n' in buf: return json.loads(buf.split(b'\n', 1)[0])
    return None
def summarize(snap):
    if snap is None: return None
    d = snap.get('display') or {}
    px = d.get('pixels')
    lit = sum(1 for v in px if v) if isinstance(px, list) else (len(px.strip('0')) if isinstance(px, str) else None)
    return {'type': snap.get('type'), 'clockNs': snap.get('clockNs'), 'firmware': (snap.get('target') or {}).get('firmware'),
            'display': [d.get('width'), d.get('height')], 'litPixels': lit,
            'lifecycleKeys': sorted((snap.get('lifecycle') or {}).keys()),
            'motors': len(snap.get('motors') or []), 'power': snap.get('power')}
def monitor(cmd):
    s = socket.create_connection(('127.0.0.1', monitor_port), timeout=10)
    s.settimeout(300 if cmd != 'quit' else 3); s.sendall((cmd + '\n').encode())
    data = b''
    try:
        while True:
            chunk = s.recv(65536)
            if not chunk: break
            data += chunk
            if cmd == 'quit' or data.count(b'(machine-0)') >= 2: break
    except socket.timeout:
        pass
    s.close(); return data
start = time.time()
first = snapshot(start + timeout)
result = {'firstSnapshotSeconds': round(time.time() - start, 1) if first else None, 'first': summarize(first)}
if not first:
    try: result['monitorOnFailure'] = monitor('mach').decode('utf-8', 'replace')[-6000:]
    except OSError as e: result['monitorError'] = str(e)
if first:
    try:
        monitor('emulation RunFor "4.0"'); time.sleep(2)
        result['second'] = summarize(snapshot(time.time() + 120))
    except OSError as e:
        result['secondError'] = str(e)
try: monitor('quit')
except OSError: pass
json.dump(result, open(out, 'w'), indent=2)
print(json.dumps(result))
sys.exit(0 if first else 1)
