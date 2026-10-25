// SPDX-License-Identifier: BSD-3-Clause
// A transport installation belongs to every caller that acquired it. Restoring
// the original descriptor must not remove another caller or a later wrapper.
export const createHostPropertyLeases = () => {
    const hosts = new WeakMap();
    return (host, key, create) => {
        let record = hosts.get(host);
        if (!record || host[key] !== record.value) {
            const descriptor = Object.getOwnPropertyDescriptor(host, key);
            record = {descriptor, value: null, owners: 0};
            record.value = create(host[key], () => record.owners > 0);
            Object.defineProperty(host, key, {value: record.value, configurable: true, writable: true,
                enumerable: descriptor ? descriptor.enumerable : true});
            hosts.set(host, record);
        }
        record.owners++;
        let released = false;
        return () => {
            if (released) return;
            released = true;
            record.owners--;
            if (record.owners !== 0) return;
            if (hosts.get(host) === record) hosts.delete(host);
            if (host[key] !== record.value) return;
            if (record.descriptor) Object.defineProperty(host, key, record.descriptor);
            else delete host[key];
        };
    };
};
