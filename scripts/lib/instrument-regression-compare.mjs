/** Independent, pure reference equations and strict typed comparisons.
 * No engine, CLI, test module, subprocess or filesystem dependency. */
const finite = (value, name) => {
    if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`Nonfinite ${name}`);
    return value;
};
export function close(actual, expected, tolerance) {
    finite(actual, 'actual'); finite(expected, 'expected');
    const {absolute, relative} = tolerance;
    if (![absolute, relative].every(v => Number.isFinite(v) && v >= 0)) throw new Error('Invalid tolerance');
    const error = Math.abs(actual - expected), allowed = absolute + relative * Math.abs(expected);
    return {pass: error <= allowed, actual, expected, error, allowed};
}

// Unit ramp and its first-order low-pass response, including the finite rise.
function ramp(t, rise) { return Math.min(1, Math.max(0, t / rise)); }
function rampIntegral(t, rise) { return t <= 0 ? 0 : t < rise ? t * t / (2 * rise) : t - rise / 2; }
function lowRamp(t, rise, tau) {
    if (t <= 0) return 0;
    const primitive = x => x + tau * Math.expm1(-x / tau);
    return (primitive(t) - (t > rise ? primitive(t - rise) : 0)) / rise;
}
function lowRampIntegral(t, rise, tau) {
    // Integrating tau*y' + y = ramp avoids a second cancellation-prone antiderivative.
    return rampIntegral(t, rise) - tau * lowRamp(t, rise, tau);
}

export function passiveReference(definition, timeSeconds) {
    const p = definition.parameters, t = finite(timeSeconds, 'time');
    if (t < 0) throw new Error('Negative time');
    const rise = p.riseNs / 1e9, input = (p.volts ?? p.sign) * ramp(t, rise);
    const integralInput = (p.volts ?? p.sign) * rampIntegral(t, rise);
    if (definition.template === 'divider') {
        const output = input * p.ratio / (1 + p.ratio);
        const mean = t === 0 ? 0 : integralInput / t;
        return {wave: {input, output, 'series-drop': input - output}, meters: {
            'output-mean': mean * p.ratio / (1 + p.ratio),
            'supply-current': mean / (p.ohms * (1 + p.ratio)),
            'load-current': -mean / (p.ohms * (1 + p.ratio))}};
    }
    if (definition.template === 'bridge') {
        const left = input / 2, right = input / (1 + p.ratio);
        const mean = t === 0 ? 0 : integralInput / t;
        return {wave: {input, left, right, differential: left - right}, meters: {
            'supply-current': mean * (1 / (2 * p.ohms) + 1 / (p.ohms * (1 + p.ratio))),
            'left-current': -mean / (2 * p.ohms), 'right-current': -mean / (p.ohms * (1 + p.ratio))}};
    }
    if (!/^(rc|rl)-(lowpass|highpass)$/.test(definition.template)) throw new Error('Not a passive template');
    const low = definition.template.endsWith('lowpass'), rc = definition.template.startsWith('rc');
    const tau = p.tauNs / 1e9, filtered = p.sign * lowRamp(t, rise, tau);
    const filteredIntegral = p.sign * lowRampIntegral(t, rise, tau);
    const output = low ? filtered : input - filtered;
    const integralOutput = low ? filteredIntegral : integralInput - filteredIntegral;
    const resistorIntegral = (rc && low) || (!rc && !low)
        ? integralInput - integralOutput : integralOutput;
    const mean = t === 0 ? 0 : integralOutput / t;
    const current = t === 0 ? 0 : resistorIntegral / (t * p.ohms);
    return {wave: {input, output, difference: input - output},
        meters: {'output-mean': mean, 'supply-current': current, 'resistor-current': -current}};
}

export function lmReference(definition, timeSeconds) {
    const r = definition.referenceModel, t = finite(timeSeconds, 'time');
    const load = definition.parameters.loadOhms;
    const g = 1 / r.outputOhms + 1 / r.inputOhms + 1 / load;
    const k = (1 / r.outputOhms) / g, feedthrough = (1 / r.inputOhms) / g;
    const h0 = (k * r.gain + feedthrough) / (1 + k * r.gain);
    const tau = 1 / (2 * Math.PI * r.bandwidthHz * (k + 1 / r.gain));
    const elapsed = t - r.delayNs / 1e9, rise = r.riseNs / 1e9;
    const input = r.amplitudeV * ramp(elapsed, rise);
    const output = feedthrough * input + (h0 - feedthrough) * r.amplitudeV * lowRamp(elapsed, rise, tau);
    const integral = r.amplitudeV * (feedthrough * rampIntegral(elapsed, rise) +
        (h0 - feedthrough) * lowRampIntegral(elapsed, rise, tau));
    const mean = t === 0 ? 0 : integral / t;
    return {wave: {input, output}, meters: {'output-mean': mean,
        'load-a-current': -mean / load, 'load-b-current': mean / load}};
}

/** Piecewise closed-form RC/current-limit reference. Root bracketing locates
 * changes of equation; it does not time-step or import the production solver. */
export function createAdpReference(definition, {omitLimit = false} = {}) {
    const r = definition.referenceModel, {loadOhms: load, microfarads, inputVolts} = definition.parameters;
    const capacitance = microfarads * 1e-6;
    const tau = (r.t90Ns - r.t10Ns) / 1e9 / Math.log(9);
    const delay = Math.round((r.t10Ns / 1e9 + tau * Math.log(.9)) * 1e9) / 1e9;
    const end = definition.clock.durationNs / 1e9 - delay;
    const target = u => r.outputVolts * -Math.expm1(-u / tau);
    const segments = [];
    let start = 0, initial = 0, limited = false;
    while (start < end) {
        if (segments.length > 4) throw new Error('Unexpected reference branch count');
        const a = limited ? 1 / (load * capacitance) : (1 / r.rOut + 1 / load) / capacitance;
        const steady = limited ? r.currentLimit * load : r.outputVolts / (1 + r.rOut / load);
        const b = limited ? 0 : r.outputVolts / (r.rOut * capacitance) / (a - 1 / tau);
        const segmentStart = start;
        const d = initial - steady + b * Math.exp(-segmentStart / tau);
        const value = u => steady - b * Math.exp(-u / tau) + d * Math.exp(-a * (u - segmentStart));
        const integral = u => steady * (u - segmentStart) + b * tau *
            (Math.exp(-u / tau) - Math.exp(-segmentStart / tau)) - d / a * Math.expm1(-a * (u - segmentStart));
        const margin = u => (target(u) - value(u)) / r.rOut - r.currentLimit;
        let stop = end;
        if (!omitLimit) {
            // A strictly forward probe avoids treating the preceding root as a new event.
            const step = tau / 512;
            let previous = Math.min(end, start + 1e-12);
            for (let next = Math.min(end, previous + step); previous < end; next = Math.min(end, next + step)) {
                if (limited ? margin(next) < 0 : margin(next) > 0) {
                    let lo = previous, hi = next;
                    for (let n = 0; n < 60; n++) {
                        const mid = (lo + hi) / 2;
                        if (limited ? margin(mid) >= 0 : margin(mid) <= 0) lo = mid; else hi = mid;
                    }
                    stop = (lo + hi) / 2; break;
                }
                previous = next;
            }
        }
        segments.push({start, stop, limited, value, integral});
        initial = value(stop); start = stop; limited = !limited;
    }
    return {
        branches: segments.map(s => ({startSeconds: s.start + delay, endSeconds: s.stop + delay, limited: s.limited})),
        at(t) {
            finite(t, 'time');
            if (t < 0 || t > definition.clock.durationNs / 1e9 + 1e-15) throw new Error('Reference time outside window');
            const u = t - delay;
            let output = 0, area = 0;
            if (u > 0) for (const segment of segments) {
                if (u > segment.start) area += segment.integral(Math.min(u, segment.stop));
                if (u >= segment.start && u <= segment.stop + 1e-15) output = segment.value(Math.min(u, segment.stop));
            }
            const mean = t === 0 ? 0 : area / t;
            const outputMeanCurrent = t === 0 ? 0 : capacitance * output / t + mean / load;
            return {wave: {output, input: inputVolts}, meters: {'output-mean': mean,
                'input-mean': inputVolts, 'load-current': -mean / load}, outputMeanCurrent};
        }
    };
}

export function compareSeries(actual, expected, tolerance) {
    if (!Array.isArray(actual) || !Array.isArray(expected) || !expected.length || actual.length !== expected.length) {
        throw new Error('Missing or extra samples');
    }
    return actual.map((row, i) => {
        const reference = expected[i];
        if (!Number.isSafeInteger(row.timeNs) || row.timeNs !== reference.timeNs || row.unit !== reference.unit) {
            throw new Error('Time or SI-unit mismatch');
        }
        return {index: i, timeNs: row.timeNs, ...close(row.value, reference.value, tolerance)};
    });
}

export function readMeter(row, expected) {
    if (row.mode !== expected.mode || JSON.stringify(row.probes) !== JSON.stringify(expected.probes) ||
        row.quantity !== 'observed-dc-mean' || row.reading?.siUnit !== expected.unit || row.reading?.note != null) {
        throw new Error('Meter identity or SI-unit mismatch');
    }
    return finite(row.reading.siValue, 'meter SI value');
}

export function parseScopeCsv(text, definition) {
    const chunks = text.trim().split(/\r?\n\s*\r?\n/);
    if (chunks.length !== definition.scopes.length) throw new Error('Missing or duplicate CSV channel');
    const seen = new Set();
    return chunks.map((chunk, channel) => {
        const lines = chunk.split(/\r?\n/), scope = definition.scopes[channel];
        const header = /^# net=(.*?) capture=sample startTimeNs=(\d+) sampleIntervalNs=(\d+) points=(\d+)$/.exec(lines[0]);
        const {firstSampleNs, intervalNs, count} = definition.clock;
        if (!header || header[1] !== `${scope.tip} - ${scope.reference}` || seen.has(header[1]) ||
            Number(header[2]) !== firstSampleNs || Number(header[3]) !== intervalNs || Number(header[4]) !== count ||
            lines[1] !== 'elapsed_seconds,volts' || lines.length !== count + 2) throw new Error('CSV capture identity mismatch');
        seen.add(header[1]);
        return {id: scope.id, samples: lines.slice(2).map((line, index) => {
            const fields = line.split(',');
            if (fields.length !== 2 || fields.some(v => v.trim() === '')) throw new Error('Malformed CSV sample');
            const elapsed = Number(fields[0]), value = Number(fields[1]);
            finite(elapsed, 'elapsed'); finite(value, 'volts');
            const elapsedNs = Math.round(elapsed * 1e9);
            if (Math.abs(elapsed * 1e9 - elapsedNs) > 1e-5 || elapsedNs !== index * intervalNs) throw new Error('CSV timestamp mismatch');
            return {timeNs: firstSampleNs + elapsedNs, value, unit: 'V'};
        })};
    });
}

export function reconcileResults(definitions, results) {
    const ids = new Set(definitions.map(c => c.id)), seen = new Set();
    const counts = {pass: 0, fail: 0, refused: 0, noncomparable: 0, 'not-run': 0,
        attempted: 0, executed: 0, comparable: 0};
    for (const row of results) {
        if (!ids.has(row.id) || seen.has(row.id) || !['pass', 'fail', 'refused', 'noncomparable', 'not-run'].includes(row.status)) {
            throw new Error('Unknown, duplicated or unclassified result');
        }
        seen.add(row.id); counts[row.status]++;
        if (row.status !== 'not-run') counts.attempted++;
        if (row.executed === true) counts.executed++;
        if (['pass', 'fail'].includes(row.status)) {
            if (row.executed !== true) throw new Error('Comparison without execution');
            counts.comparable++;
        }
    }
    if (seen.size !== ids.size) throw new Error('Incomplete case denominator');
    return {counts, complete: counts.pass === definitions.length};
}

export function oracleVectors(definition) {
    const expressions = definition.observations?.map(o => o.oracle) ??
        [...definition.scopes, ...definition.meters].map(o => o.oracle);
    return [...new Set(expressions.flatMap(e => Object.keys(e.terms)))].sort();
}

export function oracleDeck(definition) {
    if (definition.referenceKind !== 'ngspice') throw new Error('Nominal device is not an ngspice reference');
    const vectors = oracleVectors(definition).join(' ');
    const controls = ['.options reltol=1e-8 abstol=1e-14 vntol=1e-10 method=trap maxord=2',
        '.control', 'set wr_singlescale', 'set wr_vecnames', 'set numdgt=16'];
    if (definition.route === 'dc-sweep') {
        const s = definition.sweep;
        controls.push(`dc ${s.source} ${s.from} ${s.to} ${s.to - s.from}`, `wrdata oracle-raw.txt ${vectors}`);
    } else {
        const c = definition.clock;
        controls.push(`tran ${c.intervalNs}n ${c.durationNs}n 0 ${definition.maxStepNs}n uic`,
            `wrdata oracle-raw.txt ${vectors}`, `linearize ${vectors}`, `wrdata oracle-sampled.txt ${vectors}`);
    }
    controls.push('quit', '.endc', '.end');
    if (!/\n\.end\n$/.test(definition.input.text)) throw new Error('Authored deck termination changed');
    return definition.input.text.replace(/\.end\n$/, controls.join('\n') + '\n');
}

export function parseOracleTable(text, definition, {sampled = false} = {}) {
    const vectors = oracleVectors(definition), lines = text.trim().split(/\r?\n/);
    const header = lines.shift().trim().toLowerCase().split(/\s+/);
    const canonical = name => name.replace(/^i\((.+)\)$/, '$1#branch');
    if (header.length !== vectors.length + 1 || !['time', 'v-sweep'].includes(header[0]) ||
        vectors.some((v, i) => canonical(header[i + 1]) !== canonical(v))) throw new Error('Oracle vector identity mismatch');
    const rows = lines.map(line => {
        const fields = line.trim().split(/\s+/).map(Number);
        if (fields.length !== header.length || !fields.every(Number.isFinite)) throw new Error('Nonfinite oracle row');
        return {scale: fields[0], vectors: Object.fromEntries(vectors.map((v, i) => [v, fields[i + 1]]))};
    });
    if (definition.route === 'dc-sweep') {
        const s = definition.sweep;
        if (header[0] !== 'v-sweep' || rows.length !== 2 || rows[0].scale !== s.from || rows[1].scale !== s.to) {
            throw new Error('Oracle DC grid mismatch');
        }
    } else {
        const c = definition.clock;
        if (header[0] !== 'time' || !rows.length) throw new Error('Oracle transient scale missing');
        for (let i = 0; i < rows.length; i++) {
            const ns = rows[i].scale * 1e9;
            if (ns < 0 || ns > c.durationNs + 1e-5 || (i && rows[i].scale <= rows[i - 1].scale)) {
                throw new Error('Oracle time grid mismatch');
            }
            if (sampled && (Math.abs(ns - i * c.intervalNs) > 1e-5)) throw new Error('Oracle linearized grid mismatch');
        }
        if (Math.abs(rows.at(-1).scale * 1e9 - c.durationNs) > 1e-5 ||
            (sampled && rows.length !== c.count + 1)) throw new Error('Oracle capture incomplete');
    }
    return rows;
}

export function evaluateExpression(expression, row) {
    let value = expression.constant;
    for (const [vector, multiplier] of Object.entries(expression.terms)) {
        value += finite(row.vectors[vector], vector) * multiplier;
    }
    return finite(value, 'reference expression');
}

export function oracleMean(rows, expression, endSeconds) {
    // UIC's initial state is explicitly zero for these authored passive inputs.
    // That boundary is not relabelled as an observed ngspice sample.
    let previous = {scale: 0, value: 0}, area = 0;
    for (const row of rows) {
        if (row.scale > endSeconds + 1e-15) break;
        const value = evaluateExpression(expression, row);
        area += (row.scale - previous.scale) * (previous.value + value) / 2;
        previous = {scale: row.scale, value};
    }
    if (Math.abs(previous.scale - endSeconds) > 1e-15) throw new Error('Oracle integral has no exact endpoint');
    return area / endSeconds;
}

export function validateCaptureReport(report, definition) {
    const c = definition.clock;
    if (report.requestedTransientProfile !== 'precision-v1' || report.plannedSamples !== c.count ||
        !Number.isFinite(report.durationSeconds) || Math.abs(report.durationSeconds * 1e9 - c.durationNs) > 1e-5 || report.rateHz !== c.rateHz ||
        report.simulatedDurationSeconds !== c.durationNs / 1e9 || report.effectiveRateHz !== c.rateHz ||
        report.scope?.length !== definition.scopes.length || report.meters?.length !== definition.meters.length ||
        report.transient?.profile?.id !== 'precision-v1' || report.transient.failure ||
        report.transient.accuracyMet === false) throw new Error('Unqualified capture report');
    const w = report.transient.work, budget = report.precisionCapture;
    if (!w || !budget || !['attempts', 'solves', 'advances'].every(key =>
        Number.isSafeInteger(w[key]) && w[key] >= 0 && w[key] <= budget[`max${key[0].toUpperCase()}${key.slice(1)}`]) ||
        budget.maxAttempts !== 20000 || budget.maxSolves !== 60001 ||
        budget.maxAdvances !== (definition.acquisition === 'watch' ? 200 : 1) ||
        (w.advances > 0 && report.transient.accuracyMet !== true)) throw new Error('Invalid whole-capture work');
    definition.scopes.forEach((s, i) => {
        const a = report.scope[i];
        if (a.tip !== s.tip || a.reference !== s.reference || a.capture !== 'sample' ||
            a.probe !== 'ideal' || !Number.isFinite(a.startTimeSeconds) || !Number.isFinite(a.sampleIntervalSeconds) ||
            Math.abs(a.startTimeSeconds * 1e9 - c.firstSampleNs) > 1e-5 ||
            Math.abs(a.sampleIntervalSeconds * 1e9 - c.intervalNs) > 1e-5 || a.summary?.samples !== c.count) {
            throw new Error('Scope report identity mismatch');
        }
    });
    if (definition.acquisition === 'watch') {
        const receipt = report.transient.boundedAdvance;
        if (receipt?.completed !== true || receipt.failure !== null || receipt.requestedTimeNs !== String(c.durationNs) ||
            receipt.stream?.observerCalls !== c.count || receipt.stream?.stepNs !== String(c.intervalNs) ||
            !['attempts', 'solves', 'advances'].every(key => {
                const limit = `max${key[0].toUpperCase()}${key.slice(1)}`;
                return receipt.limits?.[limit] === budget[limit] && Number.isSafeInteger(receipt.work?.[key]) &&
                    receipt.work[key] >= w[key] && receipt.work[key] <= budget[limit];
            })) throw new Error('Missing qualified finite-stream receipt');
    }
    if (report.poweredMeterAcquisition?.startTimeSeconds !== 0 ||
        report.poweredMeterAcquisition?.maximumWindowSeconds !== .1 ||
        report.poweredMeterAcquisition?.independentIntegralCertificate !== false ||
        report.poweredMeterAcquisition?.quantity !== 'observed-dc-mean') throw new Error('Meter window mismatch');
    definition.meters.forEach((m, i) => {
        if (Math.abs(report.meters[i].timeSeconds * 1e9 - c.durationNs) > 1e-5 ||
            !Number.isFinite(report.meters[i].timeSeconds)) throw new Error('Final meter time mismatch');
        readMeter(report.meters[i], m);
    });
    return report;
}

export function parseCapture(text, definition) {
    if (definition.acquisition !== 'watch') return {report: validateCaptureReport(JSON.parse(text), definition), prefixes: []};
    const records = text.trim().split(/\r?\n/).map(line => JSON.parse(line));
    const summary = records.pop(), c = definition.clock;
    if (summary?.recordType !== 'summary' || summary.qualified !== true || summary.watchSamples !== c.count ||
        records.length !== c.count) throw new Error('Unqualified or incomplete finite watch');
    records.forEach((row, index) => {
        if (row.recordType !== 'sample' || row.qualified !== false || row.index !== index ||
            !Number.isFinite(row.timeSeconds) || !Number.isFinite(row.elapsedSeconds) ||
            Math.abs(row.timeSeconds * 1e9 - (index + 1) * c.intervalNs) > 1e-5 ||
            row.elapsedSeconds !== row.timeSeconds || row.scope?.length !== definition.scopes.length ||
            row.meters?.length !== definition.meters.length) throw new Error('Watch prefix identity mismatch');
        definition.scopes.forEach((s, i) => {
            const a = row.scope[i];
            if (a.tip !== s.tip || a.reference !== s.reference || a.timeSeconds !== row.timeSeconds) throw new Error('Watch scope identity mismatch');
            finite(a.volts, 'watch volts');
        });
        definition.meters.forEach((m, i) => readMeter({...row.meters[i], quantity: 'observed-dc-mean'}, m));
    });
    return {report: validateCaptureReport(summary.report, definition), prefixes: records};
}

export function compareDc(report, definition, oracleRows) {
    const observations = definition.observations;
    if (report.schemaVersion !== 1 || report.sourceId !== definition.sweep.source || report.samples?.length !== 2 ||
        report.claims?.transient !== false || report.observations?.length !== observations.length) throw new Error('DC report identity mismatch');
    observations.forEach((o, i) => {
        const a = report.observations[i];
        if (a.kind !== o.kind || a.selector !== (o.selector ?? o.tip) || a.reference !== o.reference || a.unit !== o.unit) {
            throw new Error('DC observation mismatch');
        }
    });
    return report.samples.flatMap((row, index) => {
        if (row.sourceVolts !== oracleRows[index].scale || row.values?.length !== observations.length) throw new Error('DC sample grid mismatch');
        return row.values.map((value, channel) => ({channel: observations[channel].id, point: index,
            ...close(value, evaluateExpression(observations[channel].oracle, oracleRows[index]),
                definition.tolerances[observations[channel].kind])}));
    });
}

export function compareCapture(capture, channels, definition, oracle = null) {
    const checks = [], {clock: c} = definition;
    const adp = definition.template === 'adp7118-startup' ? createAdpReference(definition) : null;
    const reference = t => adp ? adp.at(t) : definition.template === 'lm741-follower'
        ? lmReference(definition, t) : passiveReference(definition, t);
    for (let i = 0; i < channels.length; i++) {
        const channel = channels[i], spec = definition.scopes[i];
        const expected = channel.samples.map((s, n) => ({timeNs: s.timeNs, unit: 'V', value: oracle
            ? evaluateExpression(spec.oracle, oracle.sampled[n + 1]) : reference(s.timeNs / 1e9).wave[spec.id]}));
        checks.push(...compareSeries(channel.samples, expected, definition.tolerances.waveV)
            .map(row => ({...row, channel: spec.id, kind: 'waveform'})));
        if (oracle) checks.push(...compareSeries(channel.samples, channel.samples.map(s => ({...s,
            value: reference(s.timeNs / 1e9).wave[spec.id]})), definition.tolerances.waveV)
            .map(row => ({...row, channel: spec.id, kind: 'independent-passive-control'})));
    }
    const compareMeters = (rows, t, prefix) => {
        const expected = reference(t);
        definition.meters.forEach((spec, i) => {
            const actual = readMeter(prefix ? {...rows[i], quantity: 'observed-dc-mean'} : rows[i], spec);
            if (Object.hasOwn(expected.meters, spec.id)) {
                checks.push({channel: spec.id, kind: prefix ? 'prefix-meter' : 'meter', timeSeconds: t,
                    ...close(actual, expected.meters[spec.id], spec.unit === 'V' ? definition.tolerances.meanV : definition.tolerances.meanA)});
            }
            if (oracle && !prefix) checks.push({channel: spec.id, kind: 'ngspice-meter', timeSeconds: t,
                ...close(actual, oracleMean(oracle.raw, spec.oracle, t),
                    spec.unit === 'V' ? definition.tolerances.meanV : definition.tolerances.meanA)});
        });
        if (adp) {
            const values = Object.fromEntries(definition.meters.map((m, i) => [m.id,
                readMeter({...rows[i], quantity: 'observed-dc-mean'}, m)]));
            const output = values.vout_1 + values.vout_2;
            checks.push({channel: 'package-output-sum', kind: 'package-integral', timeSeconds: t,
                ...close(output, expected.outputMeanCurrent, definition.tolerances.meanA)});
            checks.push({channel: 'package-terminal-kcl', kind: 'package-conservation', timeSeconds: t,
                ...close(output + values.vin_7 + values.vin_8 + values.gnd, 0, definition.tolerances.conservationA)});
        }
    };
    compareMeters(capture.report.meters, c.durationNs / 1e9, false);
    capture.prefixes.forEach((row, index) => {
        row.scope.forEach((s, channel) => checks.push({channel: definition.scopes[channel].id, kind: 'prefix-raw-agreement',
            ...close(s.volts, channels[channel].samples[index].value, {absolute: 0, relative: 0})}));
        compareMeters(row.meters, row.timeSeconds, true);
    });
    if (adp) {
        // Observable limit witness: consecutive prefix integrals recover an interval
        // mean output current, rather than assuming an inaccessible internal flag.
        const currents = capture.prefixes.map(row => {
            const values = Object.fromEntries(definition.meters.map((m, i) => [m.id, row.meters[i].reading.siValue]));
            return {t: row.timeSeconds, mean: values.vout_1 + values.vout_2};
        });
        let previous = {t: 0, mean: 0};
        const intervals = currents.map(row => {
            const value = (row.t * row.mean - previous.t * previous.mean) / (row.t - previous.t);
            const mid = (row.t + previous.t) / 2;
            const allowed = definition.tolerances.meanA.absolute * 2 * (row.t + previous.t) / (row.t - previous.t);
            previous = row;
            return {timeSeconds: mid, value, allowed};
        });
        const limited = adp.branches.find(b => b.limited);
        if (definition.requiredWitnesses.currentLimitEntry) {
            const plateau = intervals.filter(row => row.timeSeconds > limited.startSeconds + 2 * c.intervalNs / 1e9 &&
                row.timeSeconds < limited.endSeconds - 2 * c.intervalNs / 1e9);
            checks.push({kind: 'current-limit-entry-witness', pass: plateau.length >= 2 &&
                plateau.every(row => Math.abs(row.value - definition.referenceModel.currentLimit) <= row.allowed)});
        }
        if (definition.requiredWitnesses.currentLimitRelease) {
            const after = intervals.filter(row => row.timeSeconds > limited.endSeconds + 2 * c.intervalNs / 1e9);
            checks.push({kind: 'current-limit-release-witness', pass: after.some(row =>
                row.value < definition.referenceModel.currentLimit - row.allowed - .01)});
        }
    }
    return checks;
}
