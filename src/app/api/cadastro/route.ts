import bcrypt from "bcryptjs";
import { DrizzleQueryError } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { createSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { clientes } from "@/lib/db/schema";

// O bcrypt só considera os primeiros 72 bytes da senha, por isso o limite máximo.
const cadastroSchema = z.object({
  nome: z.string().trim().min(2).max(80),
  email: z.string().trim().toLowerCase().pipe(z.email()),
  senha: z.string().min(8).max(72),
});

const UNIQUE_VIOLATION = "23505";

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof DrizzleQueryError &&
    (error.cause as { code?: string } | undefined)?.code === UNIQUE_VIOLATION
  );
}

export async function POST(request: Request) {
  const corpo = await request.json().catch(() => null);
  const dados = cadastroSchema.safeParse(corpo);

  if (!dados.success) {
    return NextResponse.json(
      {
        erro: "Informe nome, um e-mail válido e uma senha de 8 a 72 caracteres.",
      },
      { status: 400 },
    );
  }

  const { nome, email, senha } = dados.data;
  const senhaHash = await bcrypt.hash(senha, 10);

  try {
    const [cliente] = await db
      .insert(clientes)
      .values({ nome, email, senhaHash })
      .returning({ id: clientes.id, nome: clientes.nome });

    await createSession(cliente.id);

    return NextResponse.json({ cliente }, { status: 201 });
  } catch (error) {
    // A unicidade é garantida pelo banco (constraint em clientes.email), sem corrida entre
    // "verificar se existe" e "inserir".
    if (isUniqueViolation(error)) {
      return NextResponse.json(
        { erro: "Já existe uma conta com esse e-mail." },
        { status: 409 },
      );
    }
    throw error;
  }
}
