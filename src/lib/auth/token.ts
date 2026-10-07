import { jwtVerify, SignJWT } from "jose";
import { z } from "zod";

export const SESSION_COOKIE = "session";
export const SESSION_DURATION_SECONDS = 7 * 24 * 60 * 60;

const secret = process.env.SESSION_SECRET;

if (!secret) {
  throw new Error(
    "SESSION_SECRET não definida. Copie .env.example para .env e preencha um valor longo e aleatório.",
  );
}

const key = new TextEncoder().encode(secret);

const payloadSchema = z.object({
  clienteId: z.number().int().positive(),
});

export type SessionPayload = z.infer<typeof payloadSchema>;

export async function signSession(payload: SessionPayload): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DURATION_SECONDS}s`)
    .sign(key);
}

// Devolve null para qualquer token inválido: assinatura errada, expirado ou com formato inesperado.
export async function verifySession(
  token: string | undefined,
): Promise<SessionPayload | null> {
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, key, { algorithms: ["HS256"] });
    const parsed = payloadSchema.safeParse(payload);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
