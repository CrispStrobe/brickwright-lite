// The host installs the actual Arcade service here. Project metadata and
// authored runtime properties cannot choose an entry validator.
const services = new WeakMap();

function register(runtime, service) {
    if (!runtime || typeof runtime.on!=='function' || !Array.isArray(runtime.targets)) return () => {};
    if (!service || typeof service.stockEntry!=='function' || typeof service.bind!=='function')
        throw new Error('Procedure entry requires its native constraint service');
    if (services.has(runtime)) throw new Error('Procedure entry runtime already has a service');
    services.set(runtime,service);
    return () => {if(services.get(runtime)===service) services.delete(runtime);};
}
function entry(runtime, code, args, util) {
    const service=services.get(runtime);
    return service ? service.stockEntry(code,args,util) : null;
}
function bind(runtime,thread,target,code,params,values) {
    const service=services.get(runtime);
    if (!service) throw new Error('Procedure entry owner changed before parameter installation');
    service.bind(thread,target,code,params,values);
}
module.exports=Object.freeze({register,entry,bind});
