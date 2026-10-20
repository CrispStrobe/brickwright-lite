// The host installs the actual Arcade service here. Project metadata and
// authored runtime properties cannot choose an entry validator.
const services = new WeakMap();

function register(runtime, service, reject) {
    if (!runtime || typeof runtime.on!=='function' || !Array.isArray(runtime.targets)) return () => {};
    if (!service || typeof service.stockEntry!=='function' || typeof service.bind!=='function')
        throw new Error('Procedure entry requires its native constraint service');
    if (services.has(runtime)) throw new Error('Procedure entry runtime already has a service');
    const record={service,reject};
    services.set(runtime,record);
    return () => {if(services.get(runtime)===record) services.delete(runtime);};
}
function entry(runtime, code, args, util) {
    const record=services.get(runtime);
    if (!record) return null;
    try {return record.service.stockEntry(code,args,util);}
    catch(error) {if(record.reject) return record.reject(args,util,error);throw error;}
}
function bind(runtime,thread,target,code,params,values,args,util) {
    const record=services.get(runtime);
    if (!record) throw new Error('Procedure entry owner changed before parameter installation');
    try {record.service.bind(thread,target,code,params,values);}
    catch(error) {if(record.reject) return record.reject(args,util,error);throw error;}
}
module.exports=Object.freeze({register,entry,bind});
