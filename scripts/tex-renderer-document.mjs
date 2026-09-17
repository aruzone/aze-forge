const PACKAGES = Object.freeze({
  circuitikz: "\\usepackage{circuitikz}",
  tikz: "\\usepackage{tikz}",
  pgfplots: "\\usepackage{pgfplots}",
  chemfig: "\\usepackage{chemfig}",
  "tikz-cd": "\\usepackage{tikz-cd}",
});

export const TEX_PROFILES = Object.freeze(Object.keys(PACKAGES));

export function documentFor(profile, body) {
  const packageDeclaration = PACKAGES[profile];
  if (packageDeclaration === undefined) throw new Error(`Unsupported TeX profile: ${profile}`);
  const wrappedBody = profile === "circuitikz" || profile === "tikz" || profile === "pgfplots"
    ? `\\begin{tikzpicture}\n${body}\n\\end{tikzpicture}`
    : body;
  return String.raw`\documentclass{article}
\def\pgfsysdriver{pgfsys-dvisvgm.def}
${packageDeclaration}
\pagestyle{empty}
\begin{document}
${wrappedBody}
\end{document}
`;
}
