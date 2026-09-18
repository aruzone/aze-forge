export class CompilerConfigurationError extends Error {
    code;
    constructor(code, message) {
        super(message);
        this.name = "CompilerConfigurationError";
        this.code = code;
    }
}
//# sourceMappingURL=configuration-error.js.map