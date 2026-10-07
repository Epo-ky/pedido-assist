import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { createSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { clientes } from "@/lib/db/schema";

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email()),
  senha: z.string().min(1),
});

// Hash falso para gastar o mesmo tempo quando o e-mail não existe.
// Sem isso, a resposta mais rápida revelaria quais e-mails estão cadastrados.
const HASH_FALSO = bcrypt.hashSync("senha-que-nunca-sera-usada", 10);

function credenciaisInvalidas() {
  return NextResponse.json(
    { erro: "E-mail ou senha inválidos." },
    { status: 401 },
  );
}

export async function POST(request: Request) {
  const corpo = await request.json().catch(() => null);
  const dados = loginSchema.safeParse(corpo);

  if (!dados.success) {
    return NextResponse.json(
      { erro: "Informe um e-mail válido e a senha." },
      { status: 400 },
    );
  }

  const { email, senha } = dados.data;

  const [cliente] = await db
    .select({ id: clientes.id, nome: clientes.nome, senhaHash: clientes.senhaHash })
    .from(clientes)
    .where(eq(clientes.email, email))
    .limit(1);

  const senhaConfere = await bcrypt.compare(senha, cliente?.senhaHash ?? HASH_FALSO);

  if (!cliente || !senhaConfere) {
    return credenciaisInvalidas();
  }

  await createSession(cliente.id);

  return NextResponse.json({ cliente: { id: cliente.id, nome: cliente.nome } });
}
