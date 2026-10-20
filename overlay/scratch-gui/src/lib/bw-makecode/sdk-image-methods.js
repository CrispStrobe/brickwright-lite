// Method shapes constrain an already proved Image; they never issue an owner
// or turn an annotation, method name or runtime-looking token into a producer.
const methods=Object.freeze({
    getPixel:Object.freeze({parameters:Object.freeze(['x','y']),result:'number'}),
    setPixel:Object.freeze({parameters:Object.freeze(['x','y','color']),result:'void'}),
    fill:Object.freeze({parameters:Object.freeze(['color']),result:'void'}),
    fillRect:Object.freeze({parameters:Object.freeze(['x','y','width','height','color']),result:'void'})
});
export const sdkImageNumberMethod=name=>Object.prototype.hasOwnProperty.call(methods,name)?methods[name]:null;
