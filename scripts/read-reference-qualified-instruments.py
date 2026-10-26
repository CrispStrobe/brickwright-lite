#!/usr/bin/env python3
"""Independent bounded retained-original reader. Never imports/runs JS, a CLI or a model."""
import argparse
import hashlib
import json
import math
import os
from pathlib import Path
import re
import sys

ADMITTED_INTENT = 'e4ce664ab57feecbe697132187b234c1b85ea5c634524a8f758429951a78e631'
SOURCES = {'bw-board': '836867513c3e7fac420ddaa32c17e1c7b6d3e513',
           'bw-circuit-ui': '1bc233c9297e03abb9b7eb603e045b4e92b0bb40'}
RUNTIME_FINGERPRINTS = {
    'board': {'packageName': 'bw-board', 'version': '0.1.0', 'files': 321,
              'jsJsonTreeSha256': 'bdac5b4c9e45ca685fcf1a42851d4bf7c9f6d63d9a53f8da43e25a69cac254fb'},
    'ui': {'packageName': 'bw-circuit-ui', 'version': '0.1.0', 'files': 434,
           'jsJsonTreeSha256': '1dc6002acf202eb1b7a2b619e41e90b36414d9a895bf8fc721fe75e09374ab70'}
}
IDS = ('multitap-divider loaded-potentiometer loaded-wheatstone-bridge passive-summing-mixer '
       'two-bit-r2r-ladder loaded-rc-lowpass rc-bandpass-cascade crc-pi-filter twin-t-notch '
       'loaded-rl-lowpass two-stage-rl-ladder damped-rlc-lowpass rlc-shunt-notch '
       'half-wave-transfer full-bridge-transfer bidirectional-clipper diode-or biased-diode-clamp '
       'biased-common-emitter biased-emitter-follower common-base-stage long-tailed-differential-pair '
       'darlington-follower lm741-voltage-follower lm741-inverting-stage lm741-noninverting-stage '
       'lm741-summing-stage lm741-difference-stage lm741-sallen-key zener-shunt-regulator '
       'adp7118-loaded-startup lt1763-precision-refusal').split()
UI_PACKAGE_SHA256 = '9d3765c958dbdb2bbaf5c74546d07122f6e2a36568bae6240583c0dbe310bca3'
FILE_LIMIT = 16 * 1024 * 1024
TOTAL_LIMIT = 256 * 1024 * 1024


def require(condition, message):
    if not condition:
        raise ValueError(message)


def finite(value):
    require(type(value) in (int, float) and math.isfinite(value), 'nonfinite/untyped number')
    return value


def integer(value, minimum=0):
    require(type(value) is int and value >= minimum, 'integer required; booleans are not integers')
    return value


def equal(a, b):
    if type(a) in (int, float) and type(b) in (int, float):
        return finite(a) == finite(b)
    if type(a) is not type(b):
        return False
    if type(a) is dict:
        return set(a) == set(b) and all(equal(a[k], b[k]) for k in a)
    if type(a) is list:
        return len(a) == len(b) and all(equal(x, y) for x, y in zip(a, b))
    return a == b


def digest(raw):
    return hashlib.sha256(raw).hexdigest()


def pairs(rows):
    result = {}
    for key, value in rows:
        require(key not in result, 'duplicate JSON key')
        result[key] = value
    return result


def decode(raw):
    return json.loads(raw, object_pairs_hook=pairs,
                      parse_constant=lambda value: (_ for _ in ()).throw(ValueError('JSON nonfinite')))


class Original:
    def __init__(self, root):
        self.root = root.resolve(strict=True)
        require(not root.is_symlink() and self.root.is_dir(), 'original directory required')
        self.bytes = 0
        self.seen = {}
        for base, dirs, files in os.walk(self.root, followlinks=False):
            for name in dirs + files:
                require(not (Path(base) / name).is_symlink(), 'original symlink')
            for name in files:
                path = Path(base) / name
                require(path.is_file(), 'original special file')
                size = path.stat().st_size
                require(size <= FILE_LIMIT, 'original file-size limit')
                self.bytes += size
                require(self.bytes <= TOTAL_LIMIT, 'original total-size limit')
                relative = path.relative_to(self.root).as_posix()
                self.seen[relative] = {'name': relative, 'bytes': size, 'sha256': digest(path.read_bytes())}
        require(len(self.seen) <= 800, 'original file-count limit')
        index = self.json('inventory.json')
        require(type(index) is list and len(index) == len(self.seen) - 1, 'inventory census')
        require(len({row['name'] for row in index}) == len(index), 'duplicate inventory path')
        require(all(row['name'] != 'inventory.json' and equal(row, self.seen.get(row['name'])) for row in index), 'inventory byte/hash join')

    def raw(self, name):
        require(name in self.seen, 'missing original: ' + name)
        return (self.root / name).read_bytes()

    def text(self, name):
        return self.raw(name).decode('utf-8', errors='strict')

    def json(self, name):
        return decode(self.raw(name))


def close(actual, expected, bounds):
    actual, expected = finite(actual), finite(expected)
    absolute, relative = finite(bounds['absolute']), finite(bounds['relative'])
    require(absolute >= 0 and relative >= 0, 'negative tolerance')
    error = abs(actual - expected)
    allowed = absolute + relative * abs(expected)
    finite(error)
    finite(allowed)
    return {'actual': actual, 'expected': expected, 'error': error, 'allowed': allowed, 'pass': error <= allowed}


def vectors(case):
    observations = case.get('observations', case.get('scopes', []) + case.get('meters', []))
    return sorted({o['vector'] for o in observations})


def reference(original, case, sampled=False):
    path = case['id'] + ('/reference-grid.txt' if sampled else '/reference-raw.txt')
    lines = original.text(path).strip().splitlines()
    header = lines.pop(0).lower().split()
    names = vectors(case)
    alias = lambda value: re.sub(r'^i\((.+)\)$', r'\1#branch', value)
    require(len(header) == len(names) + 1 and all(alias(a) == alias(b) for a, b in zip(header[1:], names)), 'oracle vector identity')
    require(header[0] == ('v-sweep' if case['route'] == 'dc-sweep' else 'time'), 'oracle method/scale')
    require(0 < len(lines) <= 200000, 'oracle row bound')
    rows = []
    for line in lines:
        fields = line.split()
        require(len(fields) == len(header), 'oracle row width')
        values = [finite(float(value)) for value in fields]
        rows.append((values[0], dict(zip(names, values[1:]))))
    if case['route'] == 'dc-sweep':
        s = case['sweep']
        require(len(rows) == s['points'], 'oracle DC count')
        for index, (scale, _) in enumerate(rows):
            target = s['from'] + (s['to'] - s['from']) * index / (s['points'] - 1)
            require(abs(scale - target) <= 1e-10, 'oracle DC grid')
    else:
        clock = case['clock']
        for index, (time, _) in enumerate(rows):
            require(0 <= time <= clock['durationNs'] / 1e9 + 1e-15, 'oracle time range')
            require(index == 0 or time > rows[index - 1][0], 'oracle nonmonotone time')
            if sampled:
                require(abs(time * 1e9 - index * clock['intervalNs']) <= 1e-5, 'oracle sampled grid')
        require(abs(rows[-1][0] * 1e9 - clock['durationNs']) <= 1e-5, 'oracle final time')
        if sampled:
            require(len(rows) == clock['count'] + 1, 'oracle sampled count')
        else:
            require(rows[0][0] * 1e9 <= case['reference']['maximumFirstGapNs'], 'oracle initial gap')
            require(all((rows[i][0] - rows[i - 1][0]) * 1e9 <= case['maxStepNs'] + 1e-5 for i in range(1, len(rows))), 'oracle raw maximum step')
    return rows


def number_text(value):
    if type(value) is int or (type(value) is float and value.is_integer() and abs(value) < 1e21):
        return str(int(value))
    return re.sub(r'e([+-])0+(\d+)$', r'e\1\2', str(value))


def expected_reference_deck(case):
    names = ' '.join(vectors(case))
    control = ['.options reltol=1e-9 abstol=1e-14 vntol=1e-11 method=trap maxord=2',
               '.control', 'set wr_singlescale', 'set wr_vecnames', 'option numdgt=16']
    if case['route'] == 'dc-sweep':
        s = case['sweep']
        control += ['dc ' + s['source'] + ' ' + number_text(s['from']) + ' ' + number_text(s['to']) + ' '
                    + number_text((s['to'] - s['from']) / (s['points'] - 1)), 'wrdata reference-raw.txt ' + names]
    else:
        k = case['clock']
        control += ['tran ' + str(k['intervalNs']) + 'n ' + str(k['durationNs']) + 'n 0 '
                    + str(case['maxStepNs']) + 'n uic', 'wrdata reference-raw.txt ' + names,
                    'linearize ' + names, 'wrdata reference-grid.txt ' + names]
    return '* Independent nominal reference; BSD-3-Clause\n' + '\n'.join(case['reference']['cards'] + control + ['quit', '.endc', '.end']) + '\n'


def compact_json_token(text):
    result, quoted, escaped = [], False, False
    for char in text:
        if quoted:
            result.append(char)
            if escaped:
                escaped = False
            elif char == '\\':
                escaped = True
            elif char == '"':
                quoted = False
        elif char == '"':
            result.append(char)
            quoted = True
        elif not char.isspace():
            result.append(char)
    require(not quoted, 'unterminated JSON token')
    return ''.join(result)


def imported_digest(raw):
    # Retain the actual JSON writer's numeric/string tokens. Python's generic
    # JSON encoder has different exponent spelling from JSON.stringify.
    text = raw.decode('utf-8')
    decode(text)  # reject duplicate keys/nonfinite values before slicing
    decoder, fields = json.JSONDecoder(), {}
    i = 0
    while i < len(text) and text[i].isspace():
        i += 1
    require(text[i] == '{', 'native root object')
    i += 1
    while True:
        while text[i].isspace():
            i += 1
        if text[i] == '}':
            break
        key, i = decoder.raw_decode(text, i)
        while text[i].isspace():
            i += 1
        require(text[i] == ':', 'native key separator')
        i += 1
        while text[i].isspace():
            i += 1
        start = i
        _, i = decoder.raw_decode(text, i)
        fields[key] = compact_json_token(text[start:i])
        while text[i].isspace():
            i += 1
        if text[i] == '}':
            break
        require(text[i] == ',', 'native item separator')
        i += 1
    require(set(fields) == {'parts', 'wires', 'vcc'}, 'complete native circuit fields')
    packet = '{"parts":' + fields['parts'] + ',"wires":' + fields['wires'] + ',"vcc":' + fields['vcc'] + '}'
    return digest(packet.encode())


def validate_loaded_graph(original, case):
    rec, _, _ = command(original, case['id'] + '/load', 'cli')
    directory = original.output_root + '/' + case['id']
    args = rec['args']
    require(rec['status'] == 0 and rec['cwd'] == directory and len(args) == 8
            and args[0] == '--max-old-space-size=384' and args[1].endswith('/bw-circuit-ui/bin/bwc.mjs')
            and args[2:] == ['convert', directory + '/input.json', '--to', 'json', '-o', directory + '/loaded.json'], 'actual native CLI load command')
    raw = original.raw(case['id'] + '/loaded.json')
    loaded, expected = decode(raw), decode(case['input']['text'])
    require(set(loaded) == {'parts', 'wires', 'vcc'} and equal(loaded, expected), 'complete loaded parts/models/wires identity')
    require(imported_digest(raw) == case['importedCircuitSha256'], 'expected loaded graph digest')


def expected_args(case, input_path, directory):
    args = [case['route'], input_path]
    if case['route'] == 'dc-sweep':
        sweep = case['sweep']
        args += ['--source', sweep['source'], '--from', str(sweep['from']), '--to', str(sweep['to']), '--points', str(sweep['points'])]
        for row in case['observations']:
            args += ['--observe' if row['kind'] == 'voltage' else '--current',
                     row['selector'] + ',' + row['reference'] if row['kind'] == 'voltage' else row['selector']]
    else:
        clock = case['clock']
        args += ['--profile', 'precision-v1', '--initial', 'zero-state', '--probe', 'ideal',
                 '--duration', str(clock['durationNs']) + 'ns', '--rate', str(clock['rateHz']) + 'Hz',
                 '--max-step', str(case['maxStepNs']) + 'ns', '--csv', directory + '/capture.csv',
                 '--receipt', directory + '/receipt.json']
        for row in case['scopes']:
            args += ['--scope', row['tip'] + ',' + row['reference']]
        for row in case['meters']:
            args += ['--meter', row['mode'] + ':' + ','.join(row['probes'])]
    return args + ['--json']


def command(original, prefix, role):
    record = original.json(prefix + '.process.json')
    require(record['role'] == role and record['wrapper'] == '/usr/bin/prlimit', 'process role/wrapper')
    stdout, stderr = original.raw(prefix + '.stdout'), original.raw(prefix + '.stderr')
    for name, raw in [('stdout', stdout), ('stderr', stderr)]:
        require(equal(record[name], {'bytes': len(raw), 'sha256': digest(raw)}), 'process output binding')
        require(len(raw) <= 8 * 1024 * 1024, 'process output limit')
    require(record['limits'] == (['--cpu=90', '--fsize=16777216', '--as=536870912'] if role == 'reference'
                                else ['--cpu=90', '--fsize=16777216']), 'process resource limits')
    require(1 <= integer(record['timeoutMs'], 1) <= 90000 and 0 <= finite(record['durationMs']) <= record['timeoutMs'] and type(record['cwd']) is str and record['cwd'].startswith('/'), 'process duration/cwd')
    if role == 'cli':
        require(record['executable'] == original.node_executable, 'actual Node executable')
    require(record['error'] is None and record['signal'] is None, 'process error/signal')
    integer(record['status'])
    return record, stdout, stderr


def cli_command(original, case):
    rec, stdout, stderr = command(original, case['id'] + '/cli', 'cli')
    args = rec['args']
    require(type(args) is list and len(args) >= 4 and args[0] == '--max-old-space-size=384'
            and args[1].endswith('/bw-circuit-ui/bin/bwc.mjs'), 'actual CLI entry')
    input_path = args[3]
    require(input_path == original.output_root + '/' + case['id'] + '/loaded.json', 'actual retained loaded input path')
    directory = input_path.rsplit('/', 1)[0]
    require(rec['cwd'] == directory, 'actual CLI cwd')
    expected = expected_args(case, input_path, directory)
    # Numeric option rendering is JS Number.toString, not Python repr. Compare
    # those tokens numerically with all flags/order/units otherwise exact.
    actual = args[2:]
    require(len(actual) == len(expected), 'CLI argument count')
    for index, (a, b) in enumerate(zip(actual, expected)):
        if index and expected[index - 1] in ('--from', '--to'):
            require(type(a) is str and finite(float(a)) == finite(float(b)), 'CLI sweep endpoint')
        else:
            require(a == b, 'CLI argument identity')
    return rec, stdout, stderr, actual


def dc_checks(report, case, rows):
    require(report['source'] == 'loaded.json' and report['format'] == 'json', 'DC loaded source/format')
    require(type(report.get('schemaVersion')) is int and report['schemaVersion'] == 1
            and report['sourceId'] == case['sweep']['source'], 'DC identity')
    require(report['claims']['transient'] is False and report['claims']['independentOracle'] is False, 'DC claims')
    observations, samples = report['observations'], report['samples']
    require(len(observations) == len(case['observations']) and len(samples) == case['sweep']['points'], 'DC complete count')
    checks = []
    for got, wanted in zip(observations, case['observations']):
        require(all(got[k] == wanted[k] for k in ('kind', 'selector', 'reference', 'unit')), 'DC channel identity')
    for point, (sample, row) in enumerate(zip(samples, rows)):
        require(abs(finite(sample['sourceVolts']) - row[0]) <= 1e-10
                and len(sample['values']) == len(observations), 'DC source/value count')
        for channel, spec in enumerate(case['observations']):
            checks.append({'quantity': 'static', 'channel': spec['id'], 'point': point,
                           **close(sample['values'][channel], spec['coefficient'] * row[1][spec['vector']], case['tolerances'][spec['unit']])})
    return checks


def csv_channels(original, case):
    blocks = re.split(r'\r?\n\s*\r?\n', original.text(case['id'] + '/capture.csv').strip())
    require(len(blocks) == len(case['scopes']), 'CSV channel count')
    result = []
    clock = case['clock']
    for block, scope in zip(blocks, case['scopes']):
        lines = block.splitlines()
        match = re.fullmatch(r'# net=(.*?) capture=sample startTimeNs=(\d+) sampleIntervalNs=(\d+) points=(\d+)', lines[0])
        require(match is not None and match[1] == scope['tip'] + ' - ' + scope['reference'], 'CSV channel/header')
        require(tuple(map(int, match.groups()[1:])) == (clock['firstSampleNs'], clock['intervalNs'], clock['count']), 'CSV source clock')
        require(lines[1] == 'elapsed_seconds,volts' and len(lines) == clock['count'] + 2, 'CSV sample census')
        values = []
        for index, line in enumerate(lines[2:]):
            fields = line.split(',')
            require(len(fields) == 2 and all(field.strip() for field in fields), 'CSV width')
            elapsed, volts = [finite(float(field)) for field in fields]
            require(abs(elapsed * 1e9 - index * clock['intervalNs']) <= 1e-5, 'CSV elapsed grid')
            values.append(volts)
        result.append(values)
    return result


def capture_checks(original, report, case, raw, grid, packages, actual_args):
    clock = case['clock']
    require(report['source'] == 'loaded.json' and report['format'] == 'json', 'capture loaded source/format')
    require(report['requestedTransientProfile'] == 'precision-v1' and integer(report['plannedSamples']) == clock['count'], 'capture profile/count')
    require(finite(report['rateHz']) == clock['rateHz'] and finite(report['effectiveRateHz']) == clock['rateHz']
            and finite(report['simulatedDurationSeconds']) == clock['durationNs'] / 1e9
            and abs(finite(report['durationSeconds']) * 1e9 - clock['durationNs']) <= 1e-5, 'capture clock')
    require(report['claims']['engineBacked'] is True and report['claims']['independentOracle'] is False, 'capture claim')
    transient, budget = report['transient'], report['precisionCapture']
    require(transient['profile']['id'] == 'precision-v1' and transient.get('failure') is None
            and transient.get('accuracyMet') is not False, 'capture numerical status')
    active = case['family'] == 'lm741' or case['id'] == 'adp7118-loaded-startup'
    require([integer(budget[k]) for k in ('maxAttempts', 'maxSolves', 'maxAdvances')] == [20000, 60001, 200 if active else 1], 'whole-capture fixed limits')
    for key in ('attempts', 'solves', 'advances'):
        require(integer(transient['work'][key]) <= budget['max' + key.capitalize()], 'whole-capture work')
    if transient['work']['advances']:
        require(transient.get('accuracyMet') is True, 'advanced capture accuracy')
    if active:
        receipt = transient['boundedAdvance']
        require(receipt['completed'] is True and receipt['failure'] is None and receipt['requestedTimeNs'] == str(clock['durationNs']), 'active advance completion')
        for key in ('attempts', 'solves', 'advances'):
            require(transient['work'][key] <= integer(receipt['work'][key]) <= budget['max' + key.capitalize()], 'active advance work')
    scopes, meters = report['scope'], report['meters']
    require(len(scopes) == len(case['scopes']) and len(meters) == len(case['meters']), 'instrument count')
    for got, wanted in zip(scopes, case['scopes']):
        require(got['tip'] == wanted['tip'] and got['reference'] == wanted['reference']
                and got['capture'] == 'sample' and got['probe'] == 'ideal'
                and integer(got['summary']['samples']) == clock['count'], 'scope identity')
        require(abs(finite(got['startTimeSeconds']) * 1e9 - clock['firstSampleNs']) <= 1e-5
                and abs(finite(got['sampleIntervalSeconds']) * 1e9 - clock['intervalNs']) <= 1e-5, 'scope clock')
    if meters:
        acquisition = report['poweredMeterAcquisition']
        require(finite(acquisition['startTimeSeconds']) == 0 and finite(acquisition['maximumWindowSeconds']) == .1
                and acquisition['quantity'] == 'observed-dc-mean' and acquisition['independentIntegralCertificate'] is False, 'DMM integration window')
    for got, wanted in zip(meters, case['meters']):
        require(got['mode'] == wanted['mode'] and got['probes'] == wanted['probes']
                and got['quantity'] == 'observed-dc-mean' and got['reading']['siUnit'] == wanted['unit']
                and got['reading'].get('note') is None, 'DMM identity/unit')
        require(abs(finite(got['timeSeconds']) * 1e9 - clock['durationNs']) <= 1e-5, 'DMM endpoint')
        finite(got['reading']['siValue'])
    receipt = original.json(case['id'] + '/receipt.json')
    csv = original.raw(case['id'] + '/capture.csv')
    require(set(receipt) == {'schemaVersion', 'kind', 'input', 'references', 'engine', 'cli', 'invocation', 'importedCircuitSha256', 'acquisition', 'clock', 'watchSamples', 'csv', 'exitCode', 'report', 'limits'}, 'receipt complete schema')
    require(type(receipt['schemaVersion']) is int and receipt['schemaVersion'] == 1
            and receipt['kind'] == 'bwc-measurement-receipt' and receipt['acquisition'] == 'batch'
            and integer(receipt['exitCode']) == 0 and equal(receipt['report'], report), 'actual receipt/report')
    require(receipt['csv']['name'] == 'capture.csv' and receipt['csv']['sha256'] == digest(csv) and integer(receipt['csv']['bytes']) == len(csv), 'receipt CSV bytes')
    loaded_bytes = original.raw(case['id'] + '/loaded.json')
    require(receipt['input']['name'] == 'loaded.json' and receipt['input']['sha256'] == digest(loaded_bytes)
            and integer(receipt['input']['bytes']) == len(loaded_bytes), 'receipt loaded input identity')
    require(receipt['importedCircuitSha256'] == case['importedCircuitSha256']
            and receipt['importedCircuitSha256'] == imported_digest(loaded_bytes), 'actual imported graph digest')
    require(receipt['watchSamples'] is None and equal(receipt['limits'], {
        'independentOracle': False, 'hermeticExecution': False, 'importedDependencyClosure': False,
        'runtimeFingerprintCaptured': 'before simulation', 'embeddedSourceOrWaveforms': False}), 'receipt watch/limits contract')
    require(receipt['clock'] == {'startNs': '0', 'durationNs': str(clock['durationNs']), 'intervalNs': str(clock['intervalNs'])}, 'receipt clock')
    require(receipt['engine']['selection'] == 'installed package' and receipt['engine']['declaredPackageSpec'] == original.declared_board_spec
            and receipt['invocation']['executable'] == original.node_executable
            and receipt['invocation']['cwd'] == original.output_root + '/' + case['id']
            and receipt['invocation']['BW_BOARD'] is None
            and receipt['invocation']['argv'] == actual_args and receipt['invocation']['nodeVersion'] == packages['node'], 'runtime selection/argv')
    require(receipt['references'] == {'waveform': None, 'meters': None}, 'unexpected injected comparison reference')
    for observed, expected in [(receipt['engine']['observed'], packages['board']), (receipt['cli'], packages['ui'])]:
        for key in ('packageName', 'version', 'jsJsonTreeSha256', 'files', 'extraFiles', 'scope'):
            require(equal(observed[key], expected[key]), 'receipt runtime fingerprint')
    cli_root = original.json(case['id'] + '/cli.process.json')['args'][1].removesuffix('/bin/bwc.mjs')
    require(receipt['cli']['root'] == cli_root
            and receipt['engine']['observed']['root'] == cli_root.rsplit('/', 1)[0] + '/bw-board', 'receipt runtime paths')
    channels = csv_channels(original, case)
    checks = []
    for channel, spec in enumerate(case['scopes']):
        for point, actual in enumerate(channels[channel]):
            checks.append({'quantity': 'instantaneous', 'channel': spec['id'], 'point': point,
                           **close(actual, spec['coefficient'] * grid[point + 1][1][spec['vector']], case['tolerances']['wave'])})
    for got, spec in zip(meters, case['meters']):
        # Explicitly admitted boundary extension; first retained row is not
        # presented as an observed zero-time sample or a DC initial bias.
        previous = raw[0]
        area = previous[0] * previous[1][spec['vector']]
        for row in raw[1:]:
            area += (row[0] - previous[0]) * (row[1][spec['vector']] + previous[1][spec['vector']]) / 2
            previous = row
        mean = spec['coefficient'] * area / (clock['durationNs'] / 1e9)
        checks.append({'quantity': 'whole-window-mean', 'channel': spec['id'],
                       **close(got['reading']['siValue'], mean, case['tolerances'][spec['unit']])})
    return checks


def validate_original_paths(original, intent):
    allowed = {'intent.json', 'event-admission.json', 'ui-package.json', 'package-proof.json', 'run-context.json',
               'results.json', 'summary.json', 'inventory.json', 'oracle-version.stdout',
               'oracle-version.stderr', 'oracle-version.process.json'}
    for case in intent['cases']:
        names = {'input.json', 'loaded.json', 'result.json', 'load.stdout', 'load.stderr',
                 'load.process.json', 'cli.stdout', 'cli.stderr', 'cli.process.json'}
        if case['eligibility'] == 'comparable':
            names |= {'oracle.stdout', 'oracle.stderr', 'oracle.process.json', 'reference.cir', 'reference-raw.txt'}
            if case['route'] == 'measure':
                names |= {'reference-grid.txt', 'capture.csv', 'receipt.json'}
        allowed |= {case['id'] + '/' + name for name in names}
    require(set(original.seen) <= allowed, 'unrecognized original file path')


def selector_locations(case):
    locations = set()
    for item in case.get('observations', []):
        locations.add((item['kind'], item['selector'], item['reference']))
    for item in case.get('scopes', []):
        locations.add(('voltage', item['tip'], item['reference']))
    for item in case.get('meters', []):
        probes = item['probes']
        locations.add((item['mode'], probes[0], probes[1] if item['mode'] == 'voltage' else ''))
    return len(locations)


def read_originals(root, expected_head, expected_run):
    require(re.fullmatch('[0-9a-f]{40}', expected_head) is not None, 'external exact head required')
    require(re.fullmatch('[1-9][0-9]*', expected_run) is not None, 'external run ID required')
    original = Original(root)
    raw_intent = original.raw('intent.json')
    require(raw_intent.endswith(b'\n') and digest(raw_intent[:-1]) == ADMITTED_INTENT, 'frozen independent intent hash')
    intent = decode(raw_intent)
    require(type(intent['schemaVersion']) is int and intent['schemaVersion'] == 1
            and intent['study'] == 'authored-reference-designs-v1' and intent['sources'] == SOURCES, 'intent schema/source')
    require([c['id'] for c in intent['cases']] == IDS, 'intent case identities/order')
    require(intent['counts'] == {'inputs': 32, 'referenceEligibleDesigns': 31, 'refusalControls': 1, 'executed': 0, 'qualified': 0}, 'intent candidate denominator')
    admission_bytes = original.raw('event-admission.json')
    admission = decode(admission_bytes)
    require(type(admission['schemaVersion']) is int and admission['schemaVersion'] == 1
            and admission['repositoryName'] == 'CrispStrobe/brickwright-lite'
            and admission['reviewAuthority'] == 'repository-variable:REFERENCE_QUALIFIED_STUDY_HEAD'
            and admission['reviewedHead'] == expected_head and admission['headSha'] == expected_head
            and integer(admission['runId'], 1) == int(expected_run) and integer(admission['runAttempt']) == 1
            and admission['intentSha256'] == ADMITTED_INTENT, 'prior reviewed exact-head event admission')
    context = original.json('run-context.json')
    require(context['headSha'] == expected_head and context['runId'] == expected_run
            and context['runAttempt'] == '1' and context['ref'] == 'refs/heads/study/reference-qualified-v1'
            and context['intentSha256'] == ADMITTED_INTENT and context['admissionSha256'] == digest(admission_bytes), 'official event/head/admission join')
    require(type(context['nodeExecutable']) is str and context['nodeExecutable'].startswith('/')
            and context['nodeExecutable'].endswith('/node'), 'observed Node entry')
    require(type(context['outputRoot']) is str and context['outputRoot'].startswith('/') and '..' not in context['outputRoot'].split('/'), 'observed output root')
    original.node_executable, original.output_root = context['nodeExecutable'], context['outputRoot']
    source_root = Path(__file__).resolve().parent.parent
    for key, path in {
        'collectorSha256': 'scripts/reference-qualified-instrument-study.mjs',
        'comparatorsSha256': 'scripts/lib/reference-qualified-compare.mjs',
        'fixturesSha256': 'scripts/lib/reference-qualified-circuits.mjs',
        'readerSha256': 'scripts/read-reference-qualified-instruments.py',
        'packageProvenanceSha256': 'scripts/package-provenance.mjs',
        'workflowSha256': '.github/workflows/reference-qualified-instruments.yml',
        'lockSha256': 'package-lock.json',
        'pinsSha256': 'vendor-pins.json'
    }.items():
        require(context[key] == digest((source_root / path).read_bytes()), 'reviewed source-file hash')
    ui_manifest_bytes = original.raw('ui-package.json')
    require(digest(ui_manifest_bytes) == UI_PACKAGE_SHA256, 'pinned UI manifest bytes')
    ui_manifest = decode(ui_manifest_bytes)
    original.declared_board_spec = ui_manifest.get('devDependencies', {}).get('bw-board', ui_manifest.get('dependencies', {}).get('bw-board'))
    packages = original.json('package-proof.json')
    require(packages['sources'] == SOURCES and re.fullmatch(r'v22\.\d+\.\d+', packages['node']) is not None, 'source/Node contract')
    require(equal(packages['limits'], {'arbitraryDependenciesVerified': False, 'hermeticExecution': False, 'physicalCalibration': False}), 'package proof scope')
    require(len(packages['proof']) == 2, 'package proof count')
    for proof, name in zip(packages['proof'], ('bw-board', 'bw-circuit-ui')):
        require(proof['name'] == name and proof['sha'] == SOURCES[name]
                and proof['verified'] == 'pinned-git-npm-pack-bytes' and proof['dependenciesVerified'] is False
                and integer(proof['files'], 1) > 0, 'package exact-source proof')
    for key, name in [('board', 'bw-board'), ('ui', 'bw-circuit-ui')]:
        fp = packages[key]
        require(all(equal(fp[field], value) for field, value in RUNTIME_FINGERPRINTS[key].items()), 'pinned runtime fingerprint')
        require(fp['packageName'] == name and integer(fp['files'], 1) > 0
                and re.fullmatch('[0-9a-f]{64}', fp['jsJsonTreeSha256']) is not None, 'runtime fingerprint shape')
    version, stdout, stderr = command(original, 'oracle-version', 'reference')
    require(version['status'] == 0 and version['executable'] == '/usr/bin/ngspice' and version['args'] == ['--version']
            and re.search(rb'ngspice-42\b', stdout + b'\n' + stderr) is not None, 'oracle version/method')
    validate_original_paths(original, intent)
    computed = []
    for case in intent['cases']:
        try:
            name = case['id'] + '/input.' + ('json' if case['input']['format'] == 'json' else 'cir')
            require(original.raw(name) == case['input']['text'].encode() and digest(original.raw(name)) == case['input']['sha256'], 'actual input bytes')
            validate_loaded_graph(original, case)
            rec, stdout, stderr, argv = cli_command(original, case)
            if case['eligibility'] == 'expected-refusal':
                require(rec['status'] == 1 and case['refusal']['stderrIncludes'].encode() in stderr
                        and not stdout.strip() and case['id'] + '/capture.csv' not in original.seen and case['id'] + '/receipt.json' not in original.seen, 'named pre-capture refusal')
                result = {'id': case['id'], 'status': 'expected-refusal', 'cliAttemptRecorded': True, 'checks': []}
            else:
                require(rec['status'] == 0, 'measured CLI nonzero exit')
                oracle, _, _ = command(original, case['id'] + '/oracle', 'reference')
                require(oracle['status'] == 0 and oracle['executable'] == '/usr/bin/ngspice'
                        and oracle['args'] == ['-n', '-b', 'reference.cir'], 'reference process identity')
                reference_text = original.text(case['id'] + '/reference.cir')
                require(reference_text == expected_reference_deck(case), 'exact independent reference deck and analysis')
                rows, report = reference(original, case), decode(stdout)
                if case['route'] == 'dc-sweep':
                    checks = dc_checks(report, case, rows)
                else:
                    checks = capture_checks(original, report, case, rows, reference(original, case, True), packages, argv)
                require(len(checks) > 0, 'empty check set')
                result = {'id': case['id'], 'status': 'pass' if all(c['pass'] for c in checks) else 'disagree', 'cliAttemptRecorded': True, 'checks': checks}
        except (ValueError, KeyError, TypeError, IndexError, OverflowError, UnicodeError) as error:
            result = {'id': case['id'], 'status': 'error', 'readerError': str(error)}
        result['cliAttemptRecorded'] = case['id'] + '/cli.process.json' in original.seen
        recorded = original.json(case['id'] + '/result.json')
        require(type(recorded['cliAttemptRecorded']) is bool and recorded['cliAttemptRecorded'] is result['cliAttemptRecorded'], 'recorded CLI-attempt identity')
        require(recorded['id'] == case['id'] and recorded['status'] == result['status'], 'producer/independent outcome mismatch: ' + case['id'] + ' ' + str(result.get('readerError', '')))
        if result['status'] != 'error':
            require(equal(recorded, result), 'producer/independent exact checks: ' + case['id'])
        computed.append(result)
    results = original.json('results.json')
    require(len(results) == 32 and [r['id'] for r in results] == IDS, 'summary result denominator')
    for got, wanted in zip(results, computed):
        require(got['status'] == wanted['status'], 'summary case status')
        if wanted['status'] != 'error':
            require(equal(got, wanted), 'summary case/check binding')
    counts = {'inputs': 32, 'comparable': 31, 'expectedRefusals': 1, 'recordedCliAttempts': sum(1 for r in computed if r['cliAttemptRecorded']), 'passed': 0, 'disagreed': 0,
              'refused': 0, 'missing': 0, 'checks': 0, 'checksPassed': 0, 'checksFailed': 0}
    for result in computed:
        key = {'pass': 'passed', 'disagree': 'disagreed', 'expected-refusal': 'refused'}.get(result['status'], 'missing')
        counts[key] += 1
        for check in result.get('checks', []):
            require(type(check['pass']) is bool, 'typed check verdict')
            counts['checks'] += 1
            counts['checksPassed' if check['pass'] else 'checksFailed'] += 1
    complete = counts['missing'] == 0
    numerical = complete and counts['disagreed'] == 0 and counts['passed'] == 31 and counts['refused'] == 1
    expected = {'schemaVersion': 1, 'study': intent['study'], 'counts': counts, 'evidenceComplete': complete,
                'numericalConformance': numerical, 'physicalCalibration': False, 'requestedScopeDmmDesigns': 15,
                'passedScopeDmmDesigns': sum(1 for c, r in zip(intent['cases'], computed) if c['route'] == 'measure' and r['status'] == 'pass'), 'preflightError': None}
    require(equal(original.json('summary.json'), expected), 'independent summary/verdict join')
    case_readback = [{'id': c['id'], 'route': c['route'], 'status': r['status'],
                      'cliAttemptRecorded': r['cliAttemptRecorded'], 'selectorLocations': selector_locations(c),
                      'comparedValues': len(r.get('checks', [])),
                      'failedValues': sum(1 for x in r.get('checks', []) if not x['pass']),
                      'failedExamples': [x for x in r.get('checks', []) if not x['pass']][:8],
                      **({'readerError': r['readerError']} if 'readerError' in r else {})}
                     for c, r in zip(intent['cases'], computed)]
    return {**expected, 'caseReadback': case_readback,
            'requestedSelectorLocations': sum(selector_locations(c) for c in intent['cases']),
            'referenceEligibleSelectorLocations': sum(selector_locations(c) for c in intent['cases'] if c['eligibility'] == 'comparable'),
            'numericallyPassingSelectorLocations': sum(selector_locations(c) for c, r in zip(intent['cases'], computed) if r['status'] == 'pass'),
            'retainedOriginalReadback': True, 'producerImported': False,
            'modelOrOracleReplayed': False, 'headSha': expected_head, 'runId': expected_run,
            'originalFiles': len(original.seen), 'originalBytes': original.bytes}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('originals', type=Path)
    parser.add_argument('--head', required=True)
    parser.add_argument('--run', required=True)
    args = parser.parse_args()
    try:
        report = read_originals(args.originals, args.head, args.run)
        print(json.dumps(report, allow_nan=False, separators=(',', ':')))
        return 0 if report['evidenceComplete'] and report['numericalConformance'] else 2
    except (ValueError, KeyError, TypeError, IndexError, OverflowError, UnicodeError, OSError) as error:
        print(json.dumps({'retainedOriginalReadback': False, 'error': str(error)}, allow_nan=False), file=sys.stderr)
        return 3


if __name__ == '__main__':
    sys.exit(main())
