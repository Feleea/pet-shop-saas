export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

/** Também é usado quando o registro existe em OUTRO tenant: não revelamos a existência (404, não 403). */
export class NotFoundError extends Error {
  constructor(what = "Registro") {
    super(`${what} não encontrado`);
    this.name = "NotFoundError";
  }
}
