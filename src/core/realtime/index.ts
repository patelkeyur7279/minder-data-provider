// Modular realtime-transport exports (Spec 5.2) — the `./realtime` subpath.
//
// Independently importable so bundlers that never reference this subpath never
// pull SSE code into their build (P4). WS users are unaffected: `WebSocketManager`
// is not re-exported here and stays wired only through `MinderDataProvider`.
export { SseTransport } from './SseTransport.js';
export type { RealtimeTransport, RealtimeConfig, RealtimeReconnectConfig, ResolvedRealtimeConfig } from './types.js';
