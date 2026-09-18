import { createDiagnostic } from "./diagnostics.js";
function isValidBlockId(value) {
    return /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(value);
}
function location(occurrence) {
    return {
        ...(occurrence.source === undefined ? {} : { source: occurrence.source }),
        range: occurrence.range,
    };
}
export function validateBlockIds(occurrences) {
    const diagnostics = [];
    const firstOccurrences = new Map();
    for (const occurrence of occurrences) {
        if (!isValidBlockId(occurrence.id)) {
            diagnostics.push(createDiagnostic("azeforge.reference#invalid-id", "error", `Block ID "${occurrence.id}" is not a valid AzeMark ID.`, {
                location: location(occurrence),
                data: { id: occurrence.id },
                suggestion: "Use lowercase letters, digits, and single hyphens, starting with a letter.",
            }));
            continue;
        }
        const first = firstOccurrences.get(occurrence.id);
        if (first === undefined) {
            firstOccurrences.set(occurrence.id, occurrence);
            continue;
        }
        diagnostics.push(createDiagnostic("azeforge.reference#duplicate-id", "error", `Block ID "${occurrence.id}" is used more than once.`, {
            location: location(occurrence),
            data: { id: occurrence.id },
            relatedLocations: [
                {
                    ...(first.source === undefined ? {} : { source: first.source }),
                    range: first.range,
                    message: `Block ID "${occurrence.id}" was first defined here.`,
                },
            ],
        }));
    }
    return diagnostics;
}
//# sourceMappingURL=reference-validation.js.map