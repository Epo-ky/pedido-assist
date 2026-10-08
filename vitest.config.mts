import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Carrega o .env (DATABASE_URL, SESSION_SECRET) para os testes. Na CI, as variáveis vêm do ambiente.
try {
  process.loadEnvFile();
} catch {
  // Sem .env: segue com as variáveis que já estiverem definidas.
}

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    include: ["tests/**/*.test.ts"],
  },
});
