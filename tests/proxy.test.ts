import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { proxy } from "@/proxy";
import { SESSION_COOKIE, signSession } from "@/lib/auth/token";

function requisicao(caminho: string, cookie?: string) {
  return new NextRequest(`http://localhost${caminho}`, {
    headers: cookie ? { cookie: `${SESSION_COOKIE}=${cookie}` } : {},
  });
}

// "next" = a requisição segue; senão, para onde foi redirecionada.
function destino(resposta: Response) {
  const local = resposta.headers.get("location");
  return local ? new URL(local).pathname : "next";
}

describe("proxy (redirecionamento por sessão)", () => {
  it("manda para o login quem não está logado e abre /chat ou /loja", async () => {
    expect(destino(await proxy(requisicao("/chat")))).toBe("/login");
    expect(destino(await proxy(requisicao("/loja")))).toBe("/login");
    expect(destino(await proxy(requisicao("/loja/qualquer-coisa")))).toBe("/login");
  });

  it("deixa passar quem tem uma sessão válida", async () => {
    const token = await signSession({ clienteId: 1 });

    expect(destino(await proxy(requisicao("/chat", token)))).toBe("next");
    expect(destino(await proxy(requisicao("/loja", token)))).toBe("next");
  });

  it("trata um cookie forjado ou lixo como se não houvesse sessão", async () => {
    const token = await signSession({ clienteId: 1 });
    const [cabecalho, , assinatura] = token.split(".");
    const forjado = `${cabecalho}.${Buffer.from(JSON.stringify({ clienteId: 2 })).toString("base64url")}.${assinatura}`;

    expect(destino(await proxy(requisicao("/loja", forjado)))).toBe("/login");
    expect(destino(await proxy(requisicao("/chat", "abc")))).toBe("/login");
  });

  it("manda quem já está logado de /login e /cadastro para o chat", async () => {
    const token = await signSession({ clienteId: 1 });

    expect(destino(await proxy(requisicao("/login", token)))).toBe("/chat");
    expect(destino(await proxy(requisicao("/cadastro", token)))).toBe("/chat");
  });

  it("deixa quem não está logado abrir /login e /cadastro", async () => {
    expect(destino(await proxy(requisicao("/login")))).toBe("next");
    expect(destino(await proxy(requisicao("/cadastro")))).toBe("next");
  });
});
