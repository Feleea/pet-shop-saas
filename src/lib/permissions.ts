import type { Role } from "./session";
import { ForbiddenError } from "./tenant";

/**
 * catalog = gerenciar serviços, produtos e preços (e ajustar estoque)
 * users   = convidar e gerenciar a equipe
 * sell    = usar o PDV e ver as vendas
 * stock   = registrar entradas de estoque
 * Todos os papéis LEEM catálogo, produtos e estoque; só quem vende vê as vendas (dinheiro).
 */
export type Action = "read" | "write" | "delete" | "catalog" | "users" | "sell" | "stock";

const MATRIX: Record<Role, Action[]> = {
  ADMIN: ["read", "write", "delete", "catalog", "users", "sell", "stock"],
  ATTENDANT: ["read", "write", "sell", "stock"],
  GROOMER: ["read"],
  VET: ["read"],
};

export function can(role: Role, action: Action): boolean {
  return MATRIX[role].includes(action);
}

export function assertCan(session: { role: Role }, action: Action): void {
  if (!can(session.role, action)) throw new ForbiddenError("Você não tem permissão para esta ação");
}
