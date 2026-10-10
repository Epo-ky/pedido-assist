import Groq from "groq-sdk";
import { describe, expect, it } from "vitest";
import { classificarErro } from "@/lib/ai/groq-provider";

function erroDoGroq(status: number | undefined, corpo?: object) {
  return Groq.APIError.generate(status, corpo, `erro ${status}`, new Headers());
}

describe("classificarErro (Groq -> tipo neutro)", () => {
  it("429 é limite de uso", () => {
    expect(classificarErro(erroDoGroq(429, { error: { message: "limite" } }))).toBe("rate_limit");
  });

  it("400 com tool_use_failed é chamada de tool malformada, que vale corrigir", () => {
    const corpo = { error: { code: "tool_use_failed", message: "Tool call validation failed" } };

    expect(classificarErro(erroDoGroq(400, corpo))).toBe("invalid_tool_call");
  });

  it("400 por outro motivo é recusa definitiva", () => {
    expect(classificarErro(erroDoGroq(400, { error: { code: "invalid_request_error" } }))).toBe("rejected");
  });

  it("401 (chave inválida) e 404 (modelo inexistente) são recusas definitivas", () => {
    expect(classificarErro(erroDoGroq(401, { error: { message: "chave" } }))).toBe("rejected");
    expect(classificarErro(erroDoGroq(404, { error: { code: "model_not_found" } }))).toBe("rejected");
  });

  it("5xx e queda de conexão (sem status) são falhas passageiras", () => {
    expect(classificarErro(erroDoGroq(503, { error: { message: "indisponível" } }))).toBe("unavailable");
    expect(classificarErro(erroDoGroq(500))).toBe("unavailable");
    expect(classificarErro(erroDoGroq(undefined))).toBe("unavailable");
  });
});
