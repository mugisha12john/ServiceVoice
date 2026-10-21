import { Client } from "pg";
import { createInterface } from "node:readline/promises";
import { Writable } from "node:stream";
import {
  AdminBootstrapError,
  administratorExists,
  createFirstAdministrator,
  adminBootstrapErrorMessage,
} from "./lib/admin-bootstrap";

async function main() {
  if (!process.stdin.isTTY) throw new AdminBootstrapError("INTERACTIVE");
  if (!process.env.DATABASE_URL) throw new AdminBootstrapError("DATABASE_URL");
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: 10000,
  });
  try {
    await client.connect();
    // Explain an existing administrator before asking for a new password.
    if (await administratorExists(client))
      throw new AdminBootstrapError("EXISTS");
    const input = await promptForAdministrator();
    // Recheck under a transaction lock in case another operator raced the prompt.
    await createFirstAdministrator(client, input);
    console.log(
      "First administrator created with an unverified email. Sign in and verify the mailbox through the application. No credentials were printed.",
    );
  } finally {
    await client.end().catch(() => {});
  }
}

async function promptForAdministrator() {
  let hidden = false;
  const output = new Writable({
    write(chunk, _encoding, callback) {
      if (!hidden) process.stdout.write(chunk);
      callback();
    },
  });
  const rl = createInterface({ input: process.stdin, output, terminal: true });
  try {
    const username = await rl.question("Administrator username: "),
      email = await rl.question("Administrator email: ");
    process.stdout.write("Password (hidden, 12–72 characters): ");
    hidden = true;
    const password = await rl.question("");
    hidden = false;
    process.stdout.write("\n");
    return { username: username.trim(), email: email.trim(), password };
  } finally {
    rl.close();
  }
}

main().catch((error: unknown) => {
  console.error(
    `Administrator bootstrap failed: ${adminBootstrapErrorMessage(error)}`,
  );
  process.exitCode = 1;
});
