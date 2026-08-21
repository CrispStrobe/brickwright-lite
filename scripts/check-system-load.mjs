import os from 'node:os';

const cpuCount = Math.max(1, os.cpus().length);
const [oneMinute, fiveMinute, fifteenMinute] = os.loadavg();
const normalized = oneMinute / cpuCount;
const configured = Number(process.env.BW_MAX_LOAD_PER_CPU || 1.5);
const maxLoadPerCpu = Number.isFinite(configured) && configured > 0 ? configured : 1.5;

if (normalized > maxLoadPerCpu) {
    console.error([
        'Brickwright build deferred: system load is too high.',
        `Load averages: ${oneMinute.toFixed(2)} ${fiveMinute.toFixed(2)} ${fifteenMinute.toFixed(2)}`,
        `Logical CPUs: ${cpuCount}; one-minute load per CPU: ${normalized.toFixed(2)}`,
        `Allowed load per CPU: ${maxLoadPerCpu.toFixed(2)}`,
        'Wait for load to fall, or deliberately set BW_MAX_LOAD_PER_CPU to a higher threshold.'
    ].join('\n'));
    process.exit(75);
}

console.log(`System load preflight passed: ${normalized.toFixed(2)} per CPU ` +
    `(${oneMinute.toFixed(2)} across ${cpuCount} logical CPUs).`);
