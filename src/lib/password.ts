import bcrypt from "bcryptjs";

function cost(): number {
  return Number(process.env.BCRYPT_COST ?? 10);
}

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, cost());
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}
