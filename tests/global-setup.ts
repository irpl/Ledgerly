import { execSync } from "child_process";

const TEST_DATABASE_URL = "postgresql://jan:jan@localhost:5432/jan_test";

export default function setup() {
  // Sync the schema into the dedicated test database.
  execSync("npx prisma db push --accept-data-loss", {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
  });
}
