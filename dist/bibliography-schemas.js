/** Pure plugin contract constants: no Node imports, no engine initialization. */
export const BIBLIOGRAPHY_PLUGIN_TYPE = "bibliography";
export const BIBLIOGRAPHY_PLUGIN_VERSION = "1.0.0";
export const BIBLIOGRAPHY_BODY_SYNTAX_ID = "azeforge.bibliography/v1";
export const BIBLIOGRAPHY_BODY_SYNTAX_VERSION = "1.0.0";
const IDENTIFIER = "^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$";
export const bibliographySourceSchema = Object.freeze({
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: "azeforge.bibliography/source/v1",
    type: "object",
    additionalProperties: false,
    properties: {
        id: { type: "string", pattern: IDENTIFIER },
        number: { type: "boolean" },
        caption: { type: "string", minLength: 1, maxLength: 500 },
    },
});
/**
 * The authored citation records, in declaration order. `worksCited` is the
 * derived composition projection and is deliberately absent here: it never
 * enters content identity (ADR 0007).
 */
export const bibliographyDataSchema = Object.freeze({
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: "azeforge.bibliography/data/v1",
    type: "object",
    additionalProperties: false,
    required: ["kind", "entries", "pluginVersion"],
    properties: {
        kind: { const: "bibliography" },
        pluginVersion: { const: "1.0.0" },
        entries: {
            type: "array",
            maxItems: 512,
            items: {
                type: "object",
                additionalProperties: false,
                required: ["key", "entryType", "title", "authors", "range"],
                properties: {
                    key: { type: "string", pattern: IDENTIFIER },
                    entryType: {
                        type: "string",
                        enum: [
                            "article",
                            "book",
                            "chapter",
                            "report",
                            "thesis",
                            "web",
                            "software",
                            "standard",
                            "other",
                        ],
                    },
                    title: { type: "string", minLength: 1, maxLength: 2000 },
                    authors: {
                        type: "array",
                        items: {
                            type: "object",
                            additionalProperties: false,
                            required: ["name"],
                            properties: {
                                name: { type: "string", minLength: 1, maxLength: 200 },
                                family: { type: "string", minLength: 1, maxLength: 200 },
                            },
                        },
                    },
                    year: { type: "string", pattern: "^(?:[0-9]+|unspecified)$" },
                    venue: { type: "string", minLength: 1, maxLength: 2000 },
                    publisher: { type: "string", minLength: 1, maxLength: 2000 },
                    edition: { type: "string", minLength: 1, maxLength: 2000 },
                    pages: { type: "string", minLength: 1, maxLength: 2000 },
                    url: { type: "string", minLength: 1, maxLength: 2000 },
                    doi: { type: "string", minLength: 1, maxLength: 2000 },
                    note: { type: "string", minLength: 1, maxLength: 2000 },
                    range: { type: "object" },
                },
            },
        },
    },
});
//# sourceMappingURL=bibliography-schemas.js.map