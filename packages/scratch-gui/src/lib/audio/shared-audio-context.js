import StartAudioContext from 'startaudiocontext';
import bowser from 'bowser';

let AUDIO_CONTEXT;
let initAudioContext;

if (!bowser.msie) {
    /**
     * AudioContext can be initialized only when user interaction event happens
     */
    const event =
        typeof document.ontouchstart === 'undefined' ?
            'mousedown' :
            'touchstart';
    initAudioContext = () => {
        document.removeEventListener(event, initAudioContext);
        if (!AUDIO_CONTEXT) {
            AUDIO_CONTEXT = new (window.AudioContext ||
                window.webkitAudioContext)();
            StartAudioContext(AUDIO_CONTEXT);
        }
        return AUDIO_CONTEXT;
    };
    document.addEventListener(event, initAudioContext);
}

/**
 * Wrap browser AudioContext because we shouldn't create more than one
 * @return {AudioContext} The singleton AudioContext
 */
export default function () {
    // A demand-loaded caller can import this module after the gesture which
    // would normally initialize the singleton. Initialize on that first use;
    // the browser can create a suspended context even when activation expired.
    if (!AUDIO_CONTEXT && initAudioContext) {
        return initAudioContext();
    }
    return AUDIO_CONTEXT;
}
