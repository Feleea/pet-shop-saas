import type { Role } from "./session";
import { ForbiddenError } from "./tenant";

export type Action = "read" | "write" | "delete";

const MATRIX: Record<Role, Action[]> = {
  ADMIN: ["read", "write", "delete"],
  ATTENDANT: ["read", "write"],
  GROOMER: ["read"],
  VET: ["read"],
};

export function can(role: Role, action: Action): boolean {
  return MATRIX[role].includes(action);
}

export function assertCan(session: { role: Role }, action: Action): void {
  if (!can(session.role, action)) throw new ForbiddenError("Você não tem permissão para esta ação");
}
