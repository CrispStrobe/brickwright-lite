/**
 * Existing global compatibility dependencies, evaluated before either GUI entry
 * reaches the VM. Keep this dependency graph free of app, VM and renderer imports.
 * Safari 11.0 needs Promise.finally. react-tooltip's existing bundle also installs
 * compatibility wrappers; later consumers must reuse this same package instance.
 * This orders initialization only: intrinsic snapshots and late-mutation refusals
 * remain unchanged. Direct VM consumers do not pass through a GUI entry.
 */
import 'core-js/fn/promise/finally.js';
import 'react-tooltip';
