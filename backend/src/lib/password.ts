import argon2 from "argon2";

export async function hashPassword(plain: string): Promise<string> {
  return argon2.hash(plain, { type: argon2.argon2id });
}

export async function verifyPassword(hash: string, plain: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, plain);
  } catch {
    return false;
  }
}

let dummyHash: Promise<string> | undefined;

/**
 * Does the same work as checking a real password. Used when the email isn't registered, so a wrong
 * email and a wrong password take the same time and the response can't be used to find out which
 * addresses have accounts.
 */
export async function burnPasswordCheck(plain: string): Promise<void> {
  dummyHash ??= hashPassword("timing-equalizer-not-a-real-password");
  await verifyPassword(await dummyHash, plain);
}
