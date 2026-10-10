/**
 * Creates the platform super_admin account (cross-tenant, view-only oversight).
 *
 *   npm run db:create-super-admin -- --email you@example.com --name "Your Name"
 *
 * The password is prompted for (hidden). For non-interactive use, set
 * SUPER_ADMIN_PASSWORD instead. Targets whatever DATABASE_URL is in effect, so
 * to create the account in production run it locally with that database's URL:
 *
 *   DATABASE_URL="postgresql://..." npm run db:create-super-admin -- --email ... --name ...
 */
import readline from "node:readline";
import { parseArgs } from "node:util";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { hashPassword } from "../lib/password.js";
import { db, pool } from "./client.js";
import { users } from "./schema/index.js";

function promptHidden(question: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    let muted = false;
    // Echo nothing while typing, but still end the line when Enter is pressed.
    (rl as unknown as { _writeToOutput: (s: string) => void })._writeToOutput = (s) => {
      if (!muted) process.stdout.write(s);
      else if (s.includes("\n") || s.includes("\r")) process.stdout.write("\n");
    };
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
    muted = true;
  });
}

async function readPassword(): Promise<string> {
  if (process.env.SUPER_ADMIN_PASSWORD) return process.env.SUPER_ADMIN_PASSWORD;
  if (!process.stdin.isTTY) {
    throw new Error("No terminal to prompt in: set SUPER_ADMIN_PASSWORD to provide the password.");
  }
  const password = await promptHidden("Password (min 12 characters): ");
  const confirm = await promptHidden("Confirm password: ");
  if (password !== confirm) throw new Error("Passwords do not match.");
  return password;
}

const inputSchema = z.object({
  email: z.string({ required_error: "Provide --email you@example.com" }).email("Provide a valid --email"),
  name: z.string({ required_error: 'Provide --name "Your Name"' }).trim().min(2, 'Provide --name "Your Name"'),
  password: z.string().min(12, "Password must be at least 12 characters"),
});

async function main() {
  const { values } = parseArgs({
    options: { email: { type: "string" }, name: { type: "string" } },
  });

  const email = values.email?.trim().toLowerCase();
  const existing = email ? await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1) : [];
  if (existing.length > 0) throw new Error(`An account with ${email} already exists.`);

  const input = inputSchema.parse({ email, name: values.name, password: await readPassword() });

  const [user] = await db
    .insert(users)
    .values({
      name: input.name,
      email: input.email,
      passwordHash: await hashPassword(input.password),
      role: "super_admin",
      tenantId: null,
      // Created by whoever runs this command against the database directly.
      emailVerifiedAt: new Date(),
    })
    .returning({ id: users.id, email: users.email });

  console.log(`Super admin created: ${user!.email}`);
}

main()
  .then(() => pool.end())
  .catch(async (err) => {
    const message = err instanceof z.ZodError ? err.errors.map((e) => e.message).join("; ") : (err as Error).message;
    console.error(`Could not create super admin: ${message}`);
    await pool.end();
    process.exit(1);
  });
