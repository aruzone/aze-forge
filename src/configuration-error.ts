export class CompilerConfigurationError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "CompilerConfigurationError";
    this.code = code;
  }
}
