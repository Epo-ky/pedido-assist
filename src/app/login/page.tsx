"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import styles from "./login.module.css";

export default function LoginPage() {
  const router = useRouter();
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErro(null);
    setEnviando(true);

    const form = new FormData(event.currentTarget);

    try {
      const resposta = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: form.get("email"),
          senha: form.get("senha"),
        }),
      });

      if (!resposta.ok) {
        const corpo = await resposta.json().catch(() => null);
        setErro(corpo?.erro ?? "Não foi possível entrar. Tente novamente.");
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
        <p className={styles.subtitulo}>Acesse sua conta</p>

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
          Senha
          <input
            name="senha"
            type="password"
            autoComplete="current-password"
            required
          />
        </label>

        <span
          className={styles.recuperar}
          aria-disabled="true"
          title="Em breve"
        >
          Esqueci minha senha (em breve)
        </span>

        <p className={styles.erro} role="alert">
          {erro}
        </p>

        <button type="submit" disabled={enviando}>
          {enviando ? "Entrando..." : "Entrar"}
        </button>

        <Link href="/cadastro" className={styles.criarConta}>
          Criar conta
        </Link>
      </form>
    </main>
  );
}
