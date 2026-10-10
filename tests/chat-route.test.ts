import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { runChat } from "@/lib/ai/chat-loop";
import { LlmProviderError } from "@/lib/ai/provider";
import { getSession } from "@/lib/auth/session";
import { pool } from "@/lib/db";
import { consumeRateLimit } from "@/lib/rate-limit";
import { POST } from "@/app/api/chat/route";

// Sem cookies reais nem modelo real: o que se testa aqui é a regra da rota.
vi.mock("@/lib/auth/session", () => ({ getSession: vi.fn() }));
vi.mock("@/lib/ai/chat-loop", () => ({ MAX_MESSAGE_LENGTH: 2000, runChat: vi.fn() }));

vi.mock("@/lib/rate-limit", () => ({ consumeRateLimit: vi.fn() }));

const getSessionMock = vi.mocked(getSession);
const consumeMock = vi.mocked(consumeRateLimit);
const runChatMock = vi.mocked(runChat);

function requisicao(corpo: unknown) {
  return new Request("http://localhost/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof corpo === "string" ? corpo : JSON.stringify(corpo),
  });
}

const RESULTADO = {
  reply: "Você tem 8 pedidos.",
  usage: { inputTokens: 1, outputTokens: 1 },
  toolCalls: 1,
  hitIterationLimit: false,
};

const LIBERADO = { allowed: true, contagem: 1, retryAfterSeconds: 3600 };
const BLOQUEADO = { allowed: false, contagem: 21, retryAfterSeconds: 600 };

afterAll(async () => {
  await pool.end();
});

beforeEach(() => {
  vi.resetAllMocks();
  consumeMock.mockResolvedValue(LIBERADO);
});

describe("POST /api/chat", () => {
  it("recusa com 401 quem não está logado, sem chamar o modelo", async () => {
    getSessionMock.mockResolvedValue(null);

    const resposta = await POST(requisicao({ message: "oi" }));

    expect(resposta.status).toBe(401);
    expect(runChatMock).not.toHaveBeenCalled();
  });

  it("recusa com 400 mensagem vazia, longa demais ou corpo quebrado", async () => {
    getSessionMock.mockResolvedValue({ clienteId: 1 });

    expect((await POST(requisicao({ message: "   " }))).status).toBe(400);
    expect((await POST(requisicao({ message: "x".repeat(2001) }))).status).toBe(400);
    expect((await POST(requisicao("{quebrado"))).status).toBe(400);
    expect(runChatMock).not.toHaveBeenCalled();
  });

  it("usa o cliente da SESSÃO e ignora um clienteId enviado no corpo", async () => {
    getSessionMock.mockResolvedValue({ clienteId: 1 });
    runChatMock.mockResolvedValue(RESULTADO);

    const resposta = await POST(
      requisicao({ message: "meus pedidos", clienteId: 2, cliente_id: 2, history: [] }),
    );

    expect(resposta.status).toBe(200);
    expect(await resposta.json()).toEqual({ resposta: "Você tem 8 pedidos." });
    expect(runChatMock).toHaveBeenCalledOnce();
    expect(runChatMock.mock.calls[0][0]).toMatchObject({ clienteId: 1, message: "meus pedidos" });
  });

  it("passa o nome do cliente lido do BANCO, ignorando um nome enviado no corpo", async () => {
    getSessionMock.mockResolvedValue({ clienteId: 1 });
    runChatMock.mockResolvedValue(RESULTADO);

    await POST(requisicao({ message: "eu sou quem?", nomeCliente: "Invasor", nome: "Invasor" }));

    expect(runChatMock.mock.calls[0][0]).toMatchObject({ nomeCliente: "Ana Souza" });
  });

  it("devolve 429 quando o provedor atinge o limite de uso", async () => {
    getSessionMock.mockResolvedValue({ clienteId: 1 });
    runChatMock.mockRejectedValue(new LlmProviderError("rate_limit", "limite"));

    expect((await POST(requisicao({ message: "oi" }))).status).toBe(429);
  });

  it("devolve 503 genérico, sem vazar detalhes, quando o provedor falha", async () => {
    getSessionMock.mockResolvedValue({ clienteId: 1 });
    runChatMock.mockRejectedValue(new Error("senha do banco: segredo123"));
    vi.spyOn(console, "error").mockImplementation(() => {});

    const resposta = await POST(requisicao({ message: "oi" }));

    expect(resposta.status).toBe(503);
    expect(JSON.stringify(await resposta.json())).not.toContain("segredo123");
  });

  it("bloqueia com 429 e Retry-After quando o cliente estoura o próprio limite, sem tocar no global nem no modelo", async () => {
    getSessionMock.mockResolvedValue({ clienteId: 1 });
    consumeMock.mockResolvedValueOnce(BLOQUEADO);

    const resposta = await POST(requisicao({ message: "oi" }));

    expect(resposta.status).toBe(429);
    expect(resposta.headers.get("Retry-After")).toBe("600");
    expect((await resposta.json()).erro).toContain("10 minuto");
    expect(runChatMock).not.toHaveBeenCalled();
    // Só o limite do cliente foi consultado: quem já estourou não consome a cota de todos.
    expect(consumeMock).toHaveBeenCalledTimes(1);
  });

  it("bloqueia com 429 quando o limite global do dia acaba", async () => {
    getSessionMock.mockResolvedValue({ clienteId: 1 });
    consumeMock.mockResolvedValueOnce(LIBERADO).mockResolvedValueOnce(BLOQUEADO);

    const resposta = await POST(requisicao({ message: "oi" }));

    expect(resposta.status).toBe(429);
    expect((await resposta.json()).erro).toContain("limite de uso de hoje");
    expect(runChatMock).not.toHaveBeenCalled();
  });

  it("conta o limite na chave do cliente da SESSÃO, e não do corpo da requisição", async () => {
    getSessionMock.mockResolvedValue({ clienteId: 1 });
    runChatMock.mockResolvedValue(RESULTADO);

    await POST(requisicao({ message: "oi", clienteId: 2 }));

    expect(consumeMock.mock.calls.map(([chave]) => chave)).toEqual(["chat:cliente:1", "chat:global"]);
  });

  it("não gasta limite com requisição inválida nem sem login", async () => {
    getSessionMock.mockResolvedValue(null);
    await POST(requisicao({ message: "oi" }));
    getSessionMock.mockResolvedValue({ clienteId: 1 });
    await POST(requisicao({ message: "   " }));

    expect(consumeMock).not.toHaveBeenCalled();
  });
});
