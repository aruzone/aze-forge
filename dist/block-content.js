/**
 * The one place that knows which fields of a Block carry nested content.
 *
 * Every walker that reaches inside Blocks — asset collection and embedding,
 * watch dependencies, font coverage — reads this shape instead of switching on
 * `block.kind` again, so a new Block kind or a new content field is taught once
 * rather than remembered in four places.
 */
/** Every inline run a Block owns directly, in authored order. */
export function blockInlineRuns(block) {
    if (block.kind === "invalid")
        return [];
    switch (block.kind) {
        case "heading":
        case "paragraph":
            return [block.children];
        case "callout":
            return block.title === undefined ? [] : [block.title];
        case "table":
            return [
                ...(block.caption === undefined ? [] : [block.caption]),
                ...tableProseCells(block),
            ];
        case "derivation":
            return block.steps.flatMap((step) => step.annotation === undefined ? [] : [step.annotation]);
        case "figure":
        case "statement":
        case "example":
        case "bibliography":
            return block.caption === undefined ? [] : [block.caption];
        case "algorithm":
            return [
                ...(block.caption === undefined ? [] : [block.caption]),
                ...algorithmInlineRuns(block.steps),
            ];
        default:
            return [];
    }
}
function algorithmInlineRuns(statements) {
    const out = [];
    for (const statement of statements) {
        switch (statement.kind) {
            case "text":
                out.push(statement.text);
                break;
            case "if":
                out.push(...algorithmInlineRuns(statement.then));
                for (const branch of statement.elseIf) {
                    out.push(...algorithmInlineRuns(branch.statements));
                }
                if (statement.else !== undefined) {
                    out.push(...algorithmInlineRuns(statement.else));
                }
                break;
            case "for":
            case "while":
                out.push(...algorithmInlineRuns(statement.statements));
                break;
            default:
                break;
        }
    }
    return out;
}
/** The `prose` cells of one typed table, in authored column then row order. */
function tableProseCells(block) {
    const out = [];
    for (const row of block.data.rows) {
        for (const column of block.data.columns) {
            const cell = row[column.key];
            if (cell !== undefined && cell.kind === "prose")
                out.push(cell.value);
        }
    }
    return out;
}
/** Every Block list a Block contains, in authored order. */
export function blockGroups(block) {
    if (block.kind === "invalid")
        return [];
    switch (block.kind) {
        case "blockquote":
        case "callout":
        case "figure":
            return [block.children];
        case "list":
            return block.items.map((item) => item.blocks);
        case "statement":
            return block.proof === undefined ? [block.text] : [block.text, block.proof];
        case "example":
            return [
                block.problem,
                ...block.steps.map((step) => step.text),
                ...(block.result === undefined ? [] : [block.result]),
            ];
        default:
            return [];
    }
}
//# sourceMappingURL=block-content.js.map