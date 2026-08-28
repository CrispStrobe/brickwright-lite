// The vendored scratch-link says `import PerfectWebSockets` for exactly two
// things: the WebSocket type and SerializationError. Supplying them from an
// otherwise-empty module of that name means the reference sources compile
// UNCHANGED, and we take no dependency on the Perfect web server for an error
// enum and a callback. Scrub reached the same conclusion (BSD-3, © 2021
// Shinichiro Oba); its 28 lines were worth copying rather than reinventing.
import Foundation

public enum SerializationError: Error {
    case invalidRequest(String)
    case internalError(String)
}

/// Stands in for a real socket. Outbound JSON-RPC goes to `onSend` — in the app
/// that is a Tauri event to the web side, which is the whole bridge.
public class WebSocket {
    public var onSend: ((String) -> Void)?

    public init(onSend: ((String) -> Void)? = nil) {
        self.onSend = onSend
    }

    /// Never called: frames arrive through Session.didReceiveText, not by the
    /// session reading a socket. Present because the vendored code expects it.
    public func readStringMessage(continuation: @escaping (String?, _ opcode: Any, _ final: Bool) -> ()) {}

    public func sendStringMessage(string: String, final: Bool, completion: @escaping () -> ()) {
        onSend?(string)
        completion()
    }

    public func close() {}
}
