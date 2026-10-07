import { sql } from "drizzle-orm";
import { db, pool } from "../src/lib/db";

async function main() {
  try {
    const result = await db.execute(sql`select version()`);
    console.log(result.rows[0]);
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error("Falha ao consultar o banco:", error);
  process.exit(1);
});
