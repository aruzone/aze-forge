import { canonicalJson } from "./hash.js";
import type {
  Diagnostic,
  DiagnosticFix,
  DiagnosticLocation,
  DiagnosticSeverity,
  JsonValue,
  RelatedLocation,
  SourceRange,
} from "./model.js";

export interface DiagnosticLimits {
  readonly perBlock: number;
  readonly perDocument: number;
}

export const DEFAULT_DIAGNOSTIC_LIMITS: DiagnosticLimits = Object.freeze({
  perBlock: 20,
  perDocument: 200,
});

interface DiagnosticDetails {
  readonly data?: Readonly<Record<string, JsonValue>>;
  readonly location?: DiagnosticLocation;
  readonly suggestion?: string;
  readonly fix?: DiagnosticFix;
  readonly relatedLocations?: readonly RelatedLocation[];
}

export function createDiagnostic(
  code: string,
  severity: DiagnosticSeverity,
  message: string,
  details: DiagnosticDetails = {},
): Diagnostic {
  return {
    code,
    severity,
    message,
    data: details.data ?? {},
    ...(details.location === undefined ? {} : { location: details.location }),
    ...(details.suggestion === undefined ? {} : { suggestion: details.suggestion }),
    ...(details.fix === undefined ? {} : { fix: details.fix }),
    relatedLocations: details.relatedLocations ?? [],
  };
}

const SEVERITY_ORDER: Readonly<Record<DiagnosticSeverity, number>> = {
  error: 0,
  warning: 1,
  info: 2,
};

function diagnosticIdentity(diagnostic: Diagnostic): string {
  const range = diagnostic.location?.range;
  return canonicalJson({
    code: diagnostic.code,
    range:
      range === undefined
        ? null
        : {
            start: {
              line: range.start.line,
              column: range.start.column,
              offset: range.start.offset,
            },
            end: {
              line: range.end.line,
              column: range.end.column,
              offset: range.end.offset,
            },
          },
    data: diagnostic.data,
  });
}

function compareText(left: string, right: string): number {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

function locationOrder(left: Diagnostic, right: Diagnostic): number {
  const leftLocation = left.location;
  const rightLocation = right.location;
  if (leftLocation === undefined && rightLocation !== undefined) return 1;
  if (leftLocation !== undefined && rightLocation === undefined) return -1;
  if (leftLocation === undefined || rightLocation === undefined) return 0;
  const sourceOrder = compareText(
    leftLocation.source ?? "",
    rightLocation.source ?? "",
  );
  if (sourceOrder !== 0) return sourceOrder;
  const leftOffset = leftLocation.range?.start.offset;
  const rightOffset = rightLocation.range?.start.offset;
  if (leftOffset === undefined && rightOffset !== undefined) return 1;
  if (leftOffset !== undefined && rightOffset === undefined) return -1;
  if (leftOffset !== rightOffset) return (leftOffset ?? 0) - (rightOffset ?? 0);
  return 0;
}

function containingBlock(
  diagnostic: Diagnostic,
  blockRanges: readonly SourceRange[],
): SourceRange | undefined {
  const range = diagnostic.location?.range;
  if (range === undefined) return undefined;
  return blockRanges.find(
    (blockRange) =>
      blockRange.start.offset <= range.start.offset &&
      blockRange.end.offset >= range.end.offset,
  );
}

function highestSeverity(diagnostics: readonly Diagnostic[]): DiagnosticSeverity {
  if (diagnostics.some(({ severity }) => severity === "error")) return "error";
  if (diagnostics.some(({ severity }) => severity === "warning")) return "warning";
  return "info";
}
export function normalizeAndLimitDiagnostics(
  phases: readonly (readonly Diagnostic[])[],
  limits: DiagnosticLimits = DEFAULT_DIAGNOSTIC_LIMITS,
  blockRanges: readonly SourceRange[] = [],
): readonly Diagnostic[] {
  const seen = new Set<string>();
  const retained: Diagnostic[] = [];
  const omitted: Diagnostic[] = [];
  const blockCounts = new Map<SourceRange, number>();

  for (const phase of phases) {
    const ordered = phase
      .map((diagnostic, index) => ({ diagnostic, index }))
      .sort((left, right) => {
        const location = locationOrder(left.diagnostic, right.diagnostic);
        if (location !== 0) return location;
        const leftRange = left.diagnostic.location?.range;
        const rightRange = right.diagnostic.location?.range;
        if (
          leftRange?.start.offset === rightRange?.start.offset &&
          leftRange?.end.offset === rightRange?.end.offset
        ) {
          const severity =
            SEVERITY_ORDER[left.diagnostic.severity] -
            SEVERITY_ORDER[right.diagnostic.severity];
          if (severity !== 0) return severity;
          const code = compareText(
            left.diagnostic.code,
            right.diagnostic.code,
          );
          if (code !== 0) return code;
        }
        return left.index - right.index;
      })
      .map(({ diagnostic }) => diagnostic);

    for (const diagnostic of ordered) {
      const identity = diagnosticIdentity(diagnostic);
      if (seen.has(identity)) continue;
      seen.add(identity);
      const block = containingBlock(diagnostic, blockRanges);
      if (block !== undefined) {
        const count = blockCounts.get(block) ?? 0;
        if (count >= limits.perBlock) {
          omitted.push(diagnostic);
          continue;
        }
        blockCounts.set(block, count + 1);
      }
      retained.push(diagnostic);
    }
  }

  const willTruncate =
    omitted.length > 0 || retained.length > limits.perDocument;
  const documentCapacity = willTruncate
    ? Math.max(0, limits.perDocument - 1)
    : limits.perDocument;
  if (retained.length > documentCapacity) {
    omitted.push(...retained.splice(documentCapacity));
  }
  if (omitted.length === 0) return retained;

  const omittedBySeverity = { error: 0, warning: 0, info: 0 };
  const omittedBlocks = new Set<SourceRange>();
  for (const diagnostic of omitted) {
    omittedBySeverity[diagnostic.severity] += 1;
    const block = containingBlock(diagnostic, blockRanges);
    if (block !== undefined) omittedBlocks.add(block);
  }
  retained.push(
    createDiagnostic(
      "azeforge.diagnostics#truncated",
      highestSeverity(omitted),
      "Additional diagnostics were omitted because the configured limit was reached.",
      {
        data: {
          omittedBySeverity,
          omittedBlocks: omittedBlocks.size,
        },
      },
    ),
  );
  return retained;
}
