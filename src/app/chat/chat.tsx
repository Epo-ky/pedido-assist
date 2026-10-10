"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import styles from "./chat.module.css";

type Mensagem = { role: "user" | "assistant"; content: string; erro?: boolean };

const SUGESTOES = [
  "Quais são os meus pedidos?",
  "Tenho algum pedido atrasado?",
  "Onde está o meu pedido mais recente?",
];

export function Chat({ nome, historicoInicial }: { nome: string; historicoInicial: Mensagem[] }) {
  const router = useRouter();
  const [mensagens, setMensagens] = useState<Mensagem[]>(historicoInicial);
  const [texto, setTexto] = useState("");
  const [carregando, setCarregando] = useState(false);
  const fimRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fimRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [mensagens, carregando]);

  async function enviar(conteudo: string) {
    const message = conteudo.trim();
    if (!message || carregando) return;

    // O histórico fica no servidor: a tela só manda a mensagem nova.
    setMensagens([...mensagens, { role: "user", content: message }]);
    setTexto("");
    setCarregando(true);

    try {
      const resposta = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
      });

      if (resposta.status === 401) {
        router.push("/login");
        router.refresh();
        return;
      }

      const corpo = await resposta.json().catch(() => null);

      if (resposta.ok && typeof corpo?.resposta === "string") {
        setMensagens((atuais) => [...atuais, { role: "assistant", content: corpo.resposta }]);
      } else {
        setMensagens((atuais) => [
          ...atuais,
          {
            role: "assistant",
            content: corpo?.erro ?? "Não foi possível falar com o Volt. Tente novamente.",
            erro: true,
          },
        ]);
      }
    } catch {
      setMensagens((atuais) => [
        ...atuais,
        {
          role: "assistant",
          content: "Não foi possível conectar ao servidor. Tente novamente.",
          erro: true,
        },
      ]);
    } finally {
      setCarregando(false);
    }
  }

  async function limparConversa() {
    if (carregando || !window.confirm("Apagar toda a conversa com o Volt?")) return;

    try {
      const resposta = await fetch("/api/chat", { method: "DELETE" });
      if (resposta.ok) setMensagens([]);
    } catch {
      // Sem conexão: a conversa continua na tela e no servidor, e dá para tentar de novo.
    }
  }

  return (
    <section className={styles.chat}>
      {mensagens.length > 0 && (
        <div className={styles.acoes}>
          <button type="button" onClick={limparConversa} disabled={carregando}>
            Limpar conversa
          </button>
        </div>
      )}

      <div className={styles.mensagens} aria-live="polite">
        {mensagens.length === 0 && (
          <div className={styles.boasVindas}>
            <p>
              Olá, {nome}! Eu sou o Volt, o assistente da Voltz. Posso ajudar com os seus
              pedidos, entregas e valores.
            </p>
            <div className={styles.sugestoes}>
              {SUGESTOES.map((sugestao) => (
                <button key={sugestao} type="button" onClick={() => enviar(sugestao)}>
                  {sugestao}
                </button>
              ))}
            </div>
          </div>
        )}

        {mensagens.map((mensagem, indice) => (
          <div
            key={indice}
            className={`${styles.balao} ${
              mensagem.role === "user" ? styles.usuario : styles.assistente
            } ${mensagem.erro ? styles.erro : ""}`}
          >
            {mensagem.content}
          </div>
        ))}

        {carregando && (
          <div className={`${styles.balao} ${styles.assistente} ${styles.digitando}`}>
            O Volt está consultando os seus pedidos...
          </div>
        )}

        <div ref={fimRef} />
      </div>

      <form
        className={styles.formulario}
        onSubmit={(evento) => {
          evento.preventDefault();
          enviar(texto);
        }}
      >
        <input
          value={texto}
          onChange={(evento) => setTexto(evento.target.value)}
          placeholder="Pergunte sobre os seus pedidos"
          maxLength={2000}
          aria-label="Mensagem para o Volt"
          autoFocus
        />
        <button type="submit" disabled={carregando || texto.trim() === ""}>
          Enviar
        </button>
      </form>
    </section>
  );
}
