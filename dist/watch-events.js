import { TOOL_VERSION } from "./tool-version.js";
export const WATCH_EVENT_SCHEMA_ID = "azeforge.event/v1";
function toolIdentity() {
    return { name: "azeforge", version: TOOL_VERSION };
}
function baseEvent(command, seq) {
    return {
        schema: WATCH_EVENT_SCHEMA_ID,
        schemaVersion: 1,
        tool: toolIdentity(),
        command,
        seq,
    };
}
export function createStartedEvent(command, seq, details) {
    return { ...baseEvent(command, seq), kind: "started", ...details };
}
export function createResultEvent(command, seq, details) {
    return { ...baseEvent(command, seq), kind: "result", ...details };
}
export function createStoppedEvent(command, seq, reason) {
    return { ...baseEvent(command, seq), kind: "stopped", reason };
}
export function serializeEvent(event) {
    return JSON.stringify(event);
}
//# sourceMappingURL=watch-events.js.map