// Sealed release corpus fixtures: one representative body per TeX profile,
// shared by the release evidence collector and the canonical verifier. Hashing
// these bodies through documentFor pins the renderer release manifest's
// .corpus.fixtures[].inputHash, so they must not change.
export const TEX_PROFILE_BODIES = Object.freeze({
  chemfig: "\\chemfig{H-C(-[2]H)(-[6]H)-H}",
  circuitikz: "\\draw (0,0) to[R] (2,0) to[C] (2,-2) node[ground] {};",
  pgfplots: "\\begin{axis}\\addplot coordinates {(0,0) (1,1)};\\end{axis}",
  tikz: "\\draw (0,0) -- (1,1);",
  "tikz-cd": "\\begin{tikzcd} A \\arrow[r] & B \\end{tikzcd}",
});

export const TEX_PROFILE_TITLES = Object.freeze({
  chemfig: "Chemical structure",
  circuitikz: "Passive RC circuit",
  pgfplots: "Coordinate plot",
  tikz: "Vector figure",
  "tikz-cd": "Commutative diagram",
});
