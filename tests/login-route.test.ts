import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createSession } from "@/lib/auth/session";
import { pool } from "@/lib/db";
import { consumeRateLimit } from "@/lib/rate-limit";
import { POST } from "@/app/api/login/route";

// Sem cookies reais e sem contador real: o que se testa aqui é a regra da rota. O banco é o real (com o seed).
vi.mock("@/lib/auth/session", () => ({ createSession: vi.fn() }));
vi.mock("@/lib/rate-limit", () => ({ consumeRateLimit: vi.fn() }));

const createSessionMock = vi.mocked(createSession);
const consumeMock = vi.mocked(consumeRateLimit);

const LIBERADO = { allowed: true, contagem: 1, retryAfterSeconds: 900 };
const BLOQUEADO = { allowed: false, contagem: 31, retryAfterSeconds: 600 };

function requisicao(corpo: unknown) {
  return new Request("http://localhost/api/login", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-forwarded-for": "203.0.113.7, 10.0.0.1" },
    body: JSON.stringify(corpo),
  });
}

const CREDENCIAIS_DA_ANA = { email: "  ANA@exemplo.com ", senha: "senha123" };

beforeEach(() => {
  vi.resetAllMocks();
  consumeMock.mockResolvedValue(LIBERADO);
});

afterAll(async () => {
  await pool.end();
});

describe("POST /api/login com limite de tentativas", () => {
  it("bloqueia por IP mesmo com a senha certa, sem criar sessão e sem tocar no contador do e-mail", async () => {
    consumeMock.mockResolvedValueOnce(BLOQUEADO);

    const resposta = await POST(requisicao(CREDENCIAIS_DA_ANA));

    expect(resposta.status).toBe(429);
    expect(resposta.headers.get("Retry-After")).toBe("600");
    expect((await resposta.json()).erro).toContain("Muitas tentativas");
    expect(createSessionMock).not.toHaveBeenCalled();
    expect(consumeMock.mock.calls.map(([chave]) => chave)).toEqual(["login:ip:203.0.113.7"]);
  });

  it("bloqueia por e-mail, usando o e-mail normalizado como chave", async () => {
    consumeMock.mockResolvedValueOnce(LIBERADO).mockResolvedValueOnce(BLOQUEADO);

    const resposta = await POST(requisicao(CREDENCIAIS_DA_ANA));

    expect(resposta.status).toBe(429);
    expect(createSessionMock).not.toHaveBeenCalled();
    expect(consumeMock.mock.calls.map(([chave]) => chave)).toEqual([
      "login:ip:203.0.113.7",
      "login:email:ana@exemplo.com",
    ]);
  });

  it("não muda o login normal quando está dentro do limite", async () => {
    const resposta = await POST(requisicao(CREDENCIAIS_DA_ANA));

    expect(resposta.status).toBe(200);
    expect((await resposta.json()).cliente.nome).toBe("Ana Souza");
    expect(createSessionMock).toHaveBeenCalledOnce();
  });

  it("conta também a tentativa com senha errada", async () => {
    const resposta = await POST(requisicao({ email: "ana@exemplo.com", senha: "errada" }));

    expect(resposta.status).toBe(401);
    expect(consumeMock).toHaveBeenCalledTimes(2);
  });

  it("não gasta limite com corpo inválido", async () => {
    const resposta = await POST(requisicao({ email: "isto-nao-e-email", senha: "" }));

    expect(resposta.status).toBe(400);
    expect(consumeMock).not.toHaveBeenCalled();
  });
});
