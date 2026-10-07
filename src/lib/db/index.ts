import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error(
    "DATABASE_URL não definida. Copie .env.example para .env e preencha a conexão com o Postgres.",
  );
}

export const pool = new Pool({ connectionString });

export const db = drizzle({ client: pool });
