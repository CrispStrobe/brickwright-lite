/**
 * Instrument an instruction-atomic CPU without pretending that its individual
 * bus accesses have cycle timestamps. The instruction boundary is observed
 * directly; accesses are real, ordered evidence but share the instruction's
 * start time and are therefore explicitly reconstructed.
 */
export function installInstructionDebugEvents({cpu, machine, cpuId, timeDomain, port = false}) {
  const listeners = new Set();
  let accesses = null;
  let timeEpoch = 0;
  let lastTicks = null;

  const publish = event => {
    for (const listener of [...listeners]) listener(event);
  };
  const time = ticks => {
    const value = BigInt(ticks);
    if (lastTicks !== null && value < lastTicks) timeEpoch++;
    lastTicks = value;
    return {
      ticks: value,
      domain: timeEpoch ? `${timeDomain}-reset-${timeEpoch}` : timeDomain,
      hz: machine.clockHz
    };
  };

  const originalRead = cpu.read;
  cpu.read = address => {
    const value = originalRead(address);
    if (accesses) accesses.push({kind: 'memory', memory: {
      space: 'mem', address: address & 0xffff, width: 1, direction: 'read', value: value & 0xff
    }});
    return value;
  };

  const originalWrite = cpu.write;
  cpu.write = (address, value) => {
    if (accesses) accesses.push({kind: 'memory', memory: {
      space: 'mem', address: address & 0xffff, width: 1, direction: 'write', value: value & 0xff
    }});
    return originalWrite(address, value);
  };

  if (port) {
    const originalIn = cpu.inPort;
    cpu.inPort = address => {
      const value = originalIn(address);
      if (accesses) accesses.push({kind: 'port', port: {
        address: address & 0xffff, direction: 'read', value: value & 0xff
      }});
      return value;
    };
    const originalOut = cpu.outPort;
    cpu.outPort = (address, value) => {
      if (accesses) accesses.push({kind: 'port', port: {
        address: address & 0xffff, direction: 'write', value: value & 0xff
      }});
      return originalOut(address, value);
    };
  }

  const originalStep = cpu.step.bind(cpu);
  cpu.step = () => {
    if (!listeners.size) return originalStep();
    const pcBefore = cpu.pc & 0xffff;
    const ticksBefore = machine.cycles;
    accesses = [];
    let cycles;
    try {
      cycles = originalStep();
    } finally {
      const captured = accesses;
      accesses = null;
      for (const access of captured) publish({
        cpuId, ...access, phase: 'access', fidelity: 'reconstructed', time: time(ticksBefore),
        cause: 'instruction-access'
      });
    }
    if (cycles > 0) {
      publish({
        cpuId,
        kind: 'instruction',
        phase: 'retire',
        fidelity: 'recorded',
        time: time(ticksBefore + cycles),
        pcBefore,
        pcAfter: cpu.pc & 0xffff,
        instruction: {address: pcBefore},
        changes: {cycles}
      });
    }
    return cycles;
  };

  return {
    onDebugEvent(listener) {
      if (typeof listener !== 'function') throw new TypeError('debug event listener must be a function');
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    debugTime() {
      return {
        ticks: machine.cycles,
        domain: timeEpoch ? `${timeDomain}-reset-${timeEpoch}` : timeDomain,
        hz: machine.clockHz
      };
    },
    openTimeEpoch() {
      timeEpoch++;
      lastTicks = null;
    }
  };
}
