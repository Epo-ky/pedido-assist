import { SignJWT } from "jose";
import { describe, expect, it } from "vitest";
import { signSession, verifySession } from "@/lib/auth/token";

const chaveDoProjeto = new TextEncoder().encode(process.env.SESSION_SECRET);
const outraChave = new TextEncoder().encode(
  "outra-chave-qualquer-com-tamanho-suficiente-123456",
);

async function assinar(
  payload: Record<string, unknown>,
  chave: Uint8Array,
  expiracao: string | number,
) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime(expiracao)
    .sign(chave);
}

describe("sessão por JWT", () => {
  it("aceita um token válido e devolve o clienteId", async () => {
    const token = await signSession({ clienteId: 1 });

    expect(await verifySession(token)).toEqual({ clienteId: 1 });
  });

  it("recusa um token cujo payload foi adulterado", async () => {
    const token = await signSession({ clienteId: 1 });
    const [cabecalho, , assinatura] = token.split(".");
    const payloadForjado = Buffer.from(
      JSON.stringify({ clienteId: 2 }),
    ).toString("base64url");

    expect(
      await verifySession(`${cabecalho}.${payloadForjado}.${assinatura}`),
    ).toBeNull();
  });

  it("recusa um token assinado com outra chave", async () => {
    const token = await assinar({ clienteId: 2 }, outraChave, "1h");

    expect(await verifySession(token)).toBeNull();
  });

  it("recusa um token expirado", async () => {
    const umMinutoAtras = Math.floor(Date.now() / 1000) - 60;
    const token = await assinar({ clienteId: 1 }, chaveDoProjeto, umMinutoAtras);

    expect(await verifySession(token)).toBeNull();
  });

  it("recusa um token com o clienteId em formato inválido", async () => {
    const token = await assinar({ clienteId: "abc" }, chaveDoProjeto, "1h");

    expect(await verifySession(token)).toBeNull();
  });

  it("recusa quando não há token", async () => {
    expect(await verifySession(undefined)).toBeNull();
    expect(await verifySession("")).toBeNull();
  });
});
