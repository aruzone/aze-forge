/** Pure plugin contract constants: no Node imports, no engine initialization. */
export const TABLE_PLUGIN_TYPE = "table";
export const TABLE_PLUGIN_VERSION = "2.0.0";
export const TABLE_BODY_SYNTAX_ID = "azeforge.typed-table/v2";
export const TABLE_BODY_SYNTAX_VERSION = "2.0.0";
export const tableSourceSchema = Object.freeze({
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: "azeforge.table/source/v2",
    type: "object",
    additionalProperties: false,
    properties: {
        id: {
            type: "string",
            pattern: "^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$",
        },
        number: { type: "boolean" },
        caption: { type: "string", minLength: 1, maxLength: 500 },
    },
});
export const tableDataSchema = Object.freeze({
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: "azeforge.table/data/v2",
    type: "object",
    additionalProperties: false,
    required: ["columns", "rows", "pluginVersion"],
    properties: {
        kind: { const: "table" },
        pluginVersion: { const: "2.0.0" },
        columns: {
            type: "array",
            minItems: 1,
            items: {
                type: "object",
                additionalProperties: false,
                required: ["key"],
                properties: {
                    key: {
                        type: "string",
                        pattern: "^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$",
                    },
                    name: { type: "string", minLength: 1 },
                    type: {
                        type: "string",
                        enum: [
                            "prose",
                            "text",
                            "integer",
                            "decimal",
                            "quantity",
                            "boolean",
                            "math",
                        ],
                    },
                    unit: { type: "string", minLength: 1 },
                    align: { type: "string", enum: ["left", "center", "right"] },
                },
            },
        },
        groups: {
            type: "array",
            items: {
                type: "object",
                additionalProperties: false,
                required: ["name", "columns"],
                properties: {
                    name: { type: "string", minLength: 1 },
                    columns: {
                        type: "array",
                        minItems: 1,
                        items: { type: "string", minLength: 1 },
                    },
                },
            },
        },
        rows: {
            type: "array",
            items: {
                type: "object",
                additionalProperties: {
                    type: "object",
                    required: ["kind"],
                    properties: {
                        kind: {
                            type: "string",
                            enum: [
                                "prose",
                                "text",
                                "integer",
                                "decimal",
                                "quantity",
                                "boolean",
                                "math",
                            ],
                        },
                    },
                },
            },
        },
    },
});
//# sourceMappingURL=table-schemas.js.map