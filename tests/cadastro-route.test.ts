import { eq, like } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createSession } from "@/lib/auth/session";
import { db, pool } from "@/lib/db";
import { clientes } from "@/lib/db/schema";
import { consumeRateLimit } from "@/lib/rate-limit";
import { POST } from "@/app/api/cadastro/route";

// Sem cookies reais e sem contador real. O banco é o real, e as contas criadas aqui são apagadas no fim.
vi.mock("@/lib/auth/session", () => ({ createSession: vi.fn() }));
vi.mock("@/lib/rate-limit", () => ({ consumeRateLimit: vi.fn() }));

const createSessionMock = vi.mocked(createSession);
const consumeMock = vi.mocked(consumeRateLimit);

const PREFIXO_EMAIL = "teste.limite.";
let contador = 0;
const novoEmail = () => `${PREFIXO_EMAIL}${Date.now()}-${contador++}@exemplo.com`;

function requisicao(corpo: unknown) {
  return new Request("http://localhost/api/cadastro", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-forwarded-for": "203.0.113.7, 10.0.0.1" },
    body: JSON.stringify(corpo),
  });
}

const cadastro = (email: string) => ({ nome: "Pessoa de Teste", email, senha: "senha-boa-123" });

async function existe(email: string) {
  const linhas = await db.select({ id: clientes.id }).from(clientes).where(eq(clientes.email, email));
  return linhas.length > 0;
}

beforeEach(() => {
  vi.resetAllMocks();
  consumeMock.mockResolvedValue({ allowed: true, contagem: 1, retryAfterSeconds: 3600 });
});

afterAll(async () => {
  await db.delete(clientes).where(like(clientes.email, `${PREFIXO_EMAIL}%`));
  await pool.end();
});

describe("POST /api/cadastro com limite por IP", () => {
  it("bloqueia com 429 e Retry-After sem criar a conta nem a sessão", async () => {
    consumeMock.mockResolvedValueOnce({ allowed: false, contagem: 6, retryAfterSeconds: 1800 });
    const email = novoEmail();

    const resposta = await POST(requisicao(cadastro(email)));

    expect(resposta.status).toBe(429);
    expect(resposta.headers.get("Retry-After")).toBe("1800");
    expect((await resposta.json()).erro).toContain("30 minuto");
    expect(await existe(email)).toBe(false);
    expect(createSessionMock).not.toHaveBeenCalled();
  });

  it("conta o limite no primeiro IP do x-forwarded-for", async () => {
    await POST(requisicao(cadastro(novoEmail())));

    expect(consumeMock.mock.calls[0][0]).toBe("cadastro:ip:203.0.113.7");
  });

  it("não muda o cadastro normal quando está dentro do limite", async () => {
    const email = novoEmail();

    const resposta = await POST(requisicao(cadastro(email)));

    expect(resposta.status).toBe(201);
    expect(await existe(email)).toBe(true);
    expect(createSessionMock).toHaveBeenCalledOnce();
  });

  it("não gasta limite com corpo inválido", async () => {
    const resposta = await POST(requisicao({ nome: "x", email: "ruim", senha: "1" }));

    expect(resposta.status).toBe(400);
    expect(consumeMock).not.toHaveBeenCalled();
  });
});
