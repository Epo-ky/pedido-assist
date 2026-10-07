"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import styles from "../login/login.module.css";

export default function CadastroPage() {
  const router = useRouter();
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErro(null);

    const form = new FormData(event.currentTarget);

    if (form.get("senha") !== form.get("confirmarSenha")) {
      setErro("As senhas não são iguais.");
      return;
    }

    setEnviando(true);

    try {
      const resposta = await fetch("/api/cadastro", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nome: form.get("nome"),
          email: form.get("email"),
          senha: form.get("senha"),
        }),
      });

      if (!resposta.ok) {
        const corpo = await resposta.json().catch(() => null);
        setErro(corpo?.erro ?? "Não foi possível criar a conta. Tente novamente.");
        return;
      }

      router.push("/chat");
      router.refresh();
    } catch {
      setErro("Não foi possível conectar ao servidor. Tente novamente.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <main className={styles.pagina}>
      <form className={styles.cartao} onSubmit={handleSubmit}>
        <h1 className={styles.titulo}>Pedido Assist</h1>
        <p className={styles.subtitulo}>Crie sua conta</p>

        <label className={styles.campo}>
          Nome
          <input
            name="nome"
            type="text"
            autoComplete="name"
            required
            minLength={2}
            maxLength={80}
          />
        </label>

        <label className={styles.campo}>
          E-mail
          <input
            name="email"
            type="email"
            autoComplete="email"
            required
            placeholder="seuemail@gmail.com"
          />
        </label>

        <label className={styles.campo}>
          Senha (de 8 a 72 caracteres)
          <input
            name="senha"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            maxLength={72}
          />
        </label>

        <label className={styles.campo}>
          Confirmar senha
          <input
            name="confirmarSenha"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            maxLength={72}
          />
        </label>

        <p className={styles.erro} role="alert">
          {erro}
        </p>

        <button type="submit" disabled={enviando}>
          {enviando ? "Criando conta..." : "Criar conta"}
        </button>

        <Link href="/login" className={styles.linkSecundario}>
          Já tenho conta
        </Link>
      </form>
    </main>
  );
}
