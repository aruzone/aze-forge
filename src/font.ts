import { readFile } from "node:fs/promises";

import type { Sha256Hash } from "./model.js";
import { sha256 } from "./hash.js";

interface FontSubsetDescriptor {
  readonly name: string;
  readonly unicodeRange: string;
  readonly weight: 400 | 700;
}

export interface EmbeddedFontFace extends FontSubsetDescriptor {
  readonly data: string;
  readonly sourceHash: Sha256Hash;
}

const INTER_WEIGHTS = [400, 700] as const;

const INTER_SUBSET_RANGES: readonly Omit<FontSubsetDescriptor, "weight">[] = [
  {
    name: "cyrillic-ext",
    unicodeRange: "U+0460-052F,U+1C80-1C8A,U+20B4,U+2DE0-2DFF,U+A640-A69F,U+FE2E-FE2F",
  },
  {
    name: "cyrillic",
    unicodeRange: "U+0301,U+0400-045F,U+0490-0491,U+04B0-04B1,U+2116",
  },
  { name: "greek-ext", unicodeRange: "U+1F00-1FFF" },
  {
    name: "greek",
    unicodeRange: "U+0370-0377,U+037A-037F,U+0384-038A,U+038C,U+038E-03A1,U+03A3-03FF",
  },
  {
    name: "vietnamese",
    unicodeRange: "U+0102-0103,U+0110-0111,U+0128-0129,U+0168-0169,U+01A0-01A1,U+01AF-01B0,U+0300-0301,U+0303-0304,U+0308-0309,U+0323,U+0329,U+1EA0-1EF9,U+20AB",
  },
  {
    name: "latin-ext",
    unicodeRange: "U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF",
  },
  {
    name: "latin",
    unicodeRange: "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD",
  },
];

const INTER_CODE_POINT_RANGES: readonly (readonly [number, number])[] =
  INTER_SUBSET_RANGES.flatMap((subset) =>
    subset.unicodeRange.split(",").map((entry) => {
      const [startText, endText] = entry.slice(2).split("-");
      const start = Number.parseInt(startText ?? "", 16);
      const end = endText === undefined ? start : Number.parseInt(endText, 16);
      return [start, end] as const;
    }),
  );

export class FontCoverageError extends Error {
  readonly codePoint: number;

  constructor(codePoint: number) {
    super(
      `The default Theme font does not contain U+${codePoint.toString(16).toUpperCase().padStart(4, "0")}.`,
    );
    this.name = "FontCoverageError";
    this.codePoint = codePoint;
  }
}

export function assertInterFontCoverage(values: readonly string[]): void {
  for (const value of values) {
    for (const character of value) {
      const codePoint = character.codePointAt(0);
      if (
        codePoint !== undefined &&
        !INTER_CODE_POINT_RANGES.some(
          ([start, end]) => codePoint >= start && codePoint <= end,
        )
      ) {
        throw new FontCoverageError(codePoint);
      }
    }
  }
}

export async function loadInterFontFaces(): Promise<readonly EmbeddedFontFace[]> {
  const descriptors: readonly FontSubsetDescriptor[] = INTER_SUBSET_RANGES.flatMap(
    (subset) =>
      INTER_WEIGHTS.map((weight) => ({
        ...subset,
        weight,
      })),
  );
  return Promise.all(
    descriptors.map(async (descriptor) => {
      const moduleUrl = import.meta.resolve(
        `@fontsource/inter/files/inter-${descriptor.name}-${descriptor.weight}-normal.woff2`,
      );
      const bytes = await readFile(new URL(moduleUrl));
      return Object.freeze({
        ...descriptor,
        data: bytes.toString("base64"),
        sourceHash: sha256(bytes),
      });
    }),
  );
}
