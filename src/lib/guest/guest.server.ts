import bcrypt from "bcryptjs";

/**
 * Event password hashing. Verification happens inside the database (so guests
 * never need a privileged key), which understands these bcrypt hashes.
 */
export async function hashEventPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}
