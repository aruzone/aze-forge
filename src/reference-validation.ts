import { createDiagnostic } from "./diagnostics.js";
import type { Diagnostic, SourceRange } from "./model.js";

export interface BlockIdOccurrence {
  readonly id: string;
  readonly range: SourceRange;
  readonly source?: string;
}

function isValidBlockId(value: string): boolean {
  return /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(value);
}

function location(occurrence: BlockIdOccurrence): {
  readonly source?: string;
  readonly range: SourceRange;
} {
  return {
    ...(occurrence.source === undefined ? {} : { source: occurrence.source }),
    range: occurrence.range,
  };
}

export function validateBlockIds(
  occurrences: readonly BlockIdOccurrence[],
): readonly Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const firstOccurrences = new Map<string, BlockIdOccurrence>();

  for (const occurrence of occurrences) {
    if (!isValidBlockId(occurrence.id)) {
      diagnostics.push(
        createDiagnostic(
          "azeforge.reference#invalid-id",
          "error",
          `Block ID "${occurrence.id}" is not a valid AzeMark ID.`,
          {
            location: location(occurrence),
            data: { id: occurrence.id },
            suggestion:
              "Use lowercase letters, digits, and single hyphens, starting with a letter.",
          },
        ),
      );
      continue;
    }

    const first = firstOccurrences.get(occurrence.id);
    if (first === undefined) {
      firstOccurrences.set(occurrence.id, occurrence);
      continue;
    }
    diagnostics.push(
      createDiagnostic(
        "azeforge.reference#duplicate-id",
        "error",
        `Block ID "${occurrence.id}" is used more than once.`,
        {
          location: location(occurrence),
          data: { id: occurrence.id },
          relatedLocations: [
            {
              ...(first.source === undefined ? {} : { source: first.source }),
              range: first.range,
              message: `Block ID "${occurrence.id}" was first defined here.`,
            },
          ],
        },
      ),
    );
  }
  return diagnostics;
}
