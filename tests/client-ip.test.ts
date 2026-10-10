import { describe, expect, it } from "vitest";
import { getClientIp } from "@/lib/client-ip";

function requisicao(cabecalhos: Record<string, string>) {
  return new Request("http://localhost/api/login", { method: "POST", headers: cabecalhos });
}

describe("getClientIp", () => {
  it("usa o primeiro endereço do x-forwarded-for, que é o do cliente original", () => {
    const ip = getClientIp(requisicao({ "x-forwarded-for": "203.0.113.7, 10.0.0.1, 10.0.0.2" }));

    expect(ip).toBe("203.0.113.7");
  });

  it("usa o x-real-ip quando não há x-forwarded-for", () => {
    expect(getClientIp(requisicao({ "x-real-ip": "198.51.100.4" }))).toBe("198.51.100.4");
  });

  it("devolve um valor fixo quando nenhum cabeçalho existe", () => {
    expect(getClientIp(requisicao({}))).toBe("desconhecido");
  });
});
