/**
 * CLI to create a user — the only way accounts come into existence (brief
 * §9: no public sign-up). Typical first use:
 *
 *   pnpm tsx scripts/create-user.ts --username admin --password secret --role admin
 *
 * The password can also be piped via stdin instead of --password, so it
 * doesn't end up in shell history:
 *
 *   echo "secret" | pnpm tsx scripts/create-user.ts --username admin --role admin --stdin
 */
import { hash } from "@node-rs/argon2";
import { ulid } from "ulid";
import { eq } from "drizzle-orm";
import { db, client } from "@/server/db";
import { users, type UserRole } from "@/server/db/schema";

interface Args {
  username: string;
  password?: string;
  role: UserRole;
  displayName?: string;
  stdin: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Partial<Args> = { role: "player", stdin: false };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    switch (flag) {
      case "--username":
        args.username = argv[++i];
        break;
      case "--password":
        args.password = argv[++i];
        break;
      case "--role": {
        const role = argv[++i];
        if (role !== "admin" && role !== "player") {
          throw new Error(`--role must be "admin" or "player", got "${role}"`);
        }
        args.role = role;
        break;
      }
      case "--display-name":
        args.displayName = argv[++i];
        break;
      case "--stdin":
        args.stdin = true;
        break;
      default:
        throw new Error(`Unknown argument: ${flag}`);
    }
  }
  if (!args.username) throw new Error("--username is required");
  return args as Args;
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).toString("utf-8").trim();
}

const USERNAME_PATTERN = /^[a-z0-9_-]{3,24}$/;

export async function createUser(rawArgs: string[]): Promise<{ username: string; role: UserRole }> {
  const args = parseArgs(rawArgs);
  const username = args.username.toLowerCase();

  if (!USERNAME_PATTERN.test(username)) {
    throw new Error("username must be 3-24 chars, lowercase letters/digits/underscore/hyphen only");
  }

  const password = args.stdin ? await readStdin() : args.password;
  if (!password || password.length < 8) {
    throw new Error("password is required and must be at least 8 characters");
  }

  const existing = await db.select().from(users).where(eq(users.username, username)).limit(1);
  if (existing.length > 0) {
    throw new Error(`username "${username}" already exists`);
  }

  const passwordHash = await hash(password);

  await db.insert(users).values({
    username,
    displayName: args.displayName ?? username,
    passwordHash,
    role: args.role,
    avatarSeed: ulid(),
  });

  return { username, role: args.role };
}

const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  createUser(process.argv.slice(2))
    .then(({ username, role }) => {
      console.log(JSON.stringify({ event: "create_user_complete", username, role }));
      return client.close();
    })
    .catch((error: unknown) => {
      console.error(JSON.stringify({ event: "create_user_failed", error: String(error) }));
      process.exit(1);
    });
}
