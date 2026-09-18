/** Pure plugin contract constants: no Node imports, no engine initialization. */
export const STATEMENT_PLUGIN_TYPE = "statement";
export const STATEMENT_PLUGIN_VERSION = "1.0.0";
export const STATEMENT_BODY_SYNTAX_ID = "azeforge.statement/v1";
export const STATEMENT_BODY_SYNTAX_VERSION = "1.0.0";
export const statementSourceSchema = Object.freeze({
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: "azeforge.statement/source/v1",
    type: "object",
    additionalProperties: false,
    required: ["kind"],
    properties: {
        id: { type: "string", pattern: "^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$" },
        number: { type: "boolean" },
        caption: { type: "string", minLength: 1, maxLength: 500 },
        kind: {
            type: "string",
            enum: [
                "theorem",
                "definition",
                "lemma",
                "corollary",
                "proposition",
                "remark",
            ],
        },
    },
});
export const statementDataSchema = Object.freeze({
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: "azeforge.statement/data/v1",
    type: "object",
    additionalProperties: false,
    required: ["kind", "statementKind", "text", "pluginVersion"],
    properties: {
        kind: { const: "statement" },
        pluginVersion: { const: "1.0.0" },
        statementKind: {
            type: "string",
            enum: [
                "theorem",
                "definition",
                "lemma",
                "corollary",
                "proposition",
                "remark",
            ],
        },
        text: {
            type: "array",
            minItems: 1,
            items: { type: "object", additionalProperties: true },
        },
        proof: {
            type: "array",
            minItems: 1,
            items: { type: "object", additionalProperties: true },
        },
    },
});
//# sourceMappingURL=statement-schemas.js.map