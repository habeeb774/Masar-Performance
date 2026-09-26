import "server-only";
import bcrypt from "bcryptjs";

const COST = 12;

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, COST);
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

// A real bcrypt hash of a random string: comparing against it keeps login timing
// constant when the email does not exist (prevents user enumeration).
export const DUMMY_HASH = "$2b$12$lUSOBrV.qIxktRQs.HTx.ud0bdyEvNcmXMT6fDGVvRI6FzY2rQa8e";
