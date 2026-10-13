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

/** Violação de unicidade (ex.: nome de serviço repetido dentro do mesmo pet shop). */
export class ConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConflictError";
  }
}

/** Convite inexistente, expirado ou já usado: a mensagem é a mesma para os três casos, de propósito. */
export class InvalidInviteError extends Error {
  constructor() {
    super("Convite inválido ou expirado");
    this.name = "InvalidInviteError";
  }
}
