"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { AcaoProposta } from "@/lib/actions";
import { formatBRL } from "@/lib/money";
import styles from "./chat.module.css";

// "aviso" é uma nota da própria tela (ex.: "Pedido cancelado"), que não faz parte da conversa com o modelo.
type Mensagem = { role: "user" | "assistant"; content: string; erro?: boolean; aviso?: boolean };

const SUGESTOES = [
  "Quais são os meus pedidos?",
  "Tenho algum pedido atrasado?",
  "Onde está o meu pedido mais recente?",
];

export function Chat({
  nome,
  historicoInicial,
  propostasIniciais,
}: {
  nome: string;
  historicoInicial: Mensagem[];
  propostasIniciais: AcaoProposta[];
}) {
  const router = useRouter();
  const [mensagens, setMensagens] = useState<Mensagem[]>(historicoInicial);
  // Propostas do Volt que aguardam o clique do cliente (ex.: cancelar um pedido).
  const [propostas, setPropostas] = useState<AcaoProposta[]>(propostasIniciais);
  const [decidindo, setDecidindo] = useState<string | null>(null);
  const [erroDaProposta, setErroDaProposta] = useState<Record<string, string>>({});
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

        const novas: AcaoProposta[] = Array.isArray(corpo.acoes) ? corpo.acoes : [];
        if (novas.length) {
          setPropostas((atuais) => [...atuais, ...novas.filter((nova) => !atuais.some((a) => a.id === nova.id))]);
        }
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

  // O clique do cliente: é a ÚNICA coisa que cancela um pedido. O servidor confere de novo se a proposta é dele.
  async function decidir(proposta: AcaoProposta, decisao: "confirmar" | "recusar") {
    setDecidindo(proposta.id);
    setErroDaProposta((atuais) => ({ ...atuais, [proposta.id]: "" }));

    try {
      const resposta = await fetch(`/api/acoes/${proposta.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decisao }),
      });

      if (resposta.status === 401) {
        router.push("/login");
        router.refresh();
        return;
      }

      const corpo = await resposta.json().catch(() => null);

      if (resposta.ok) {
        setPropostas((atuais) => atuais.filter((a) => a.id !== proposta.id));
        setMensagens((atuais) => [
          ...atuais,
          { role: "assistant", content: corpo?.mensagem ?? "Pronto.", aviso: true },
        ]);
      } else {
        setErroDaProposta((atuais) => ({
          ...atuais,
          [proposta.id]: corpo?.erro ?? "Não foi possível concluir. Tente novamente.",
        }));
        // Proposta que não existe mais (expirou, já usada) ou pedido que mudou: o cartão não serve mais.
        if (resposta.status === 404 || resposta.status === 409) {
          setPropostas((atuais) => atuais.filter((a) => a.id !== proposta.id));
          setMensagens((atuais) => [
            ...atuais,
            { role: "assistant", content: corpo?.erro ?? "Essa confirmação não vale mais.", aviso: true },
          ]);
        }
      }
    } catch {
      setErroDaProposta((atuais) => ({
        ...atuais,
        [proposta.id]: "Não foi possível conectar ao servidor. Tente novamente.",
      }));
    } finally {
      setDecidindo(null);
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
            } ${mensagem.erro ? styles.erro : ""} ${mensagem.aviso ? styles.avisoTela : ""}`}
          >
            {mensagem.content}
          </div>
        ))}

        {propostas.map((proposta) => (
          <div key={proposta.id} className={styles.proposta} role="group" aria-label="Confirmação de cancelamento">
            <p className={styles.propostaTexto}>
              Cancelar o pedido nº {proposta.pedidoId} ({formatBRL(proposta.total)})? O pedido só será cancelado se
              você confirmar.
            </p>
            <div className={styles.propostaBotoes}>
              <button
                type="button"
                className={styles.confirmar}
                onClick={() => decidir(proposta, "confirmar")}
                disabled={decidindo === proposta.id}
              >
                {decidindo === proposta.id ? "Aguarde..." : "Confirmar cancelamento"}
              </button>
              <button
                type="button"
                className={styles.manter}
                onClick={() => decidir(proposta, "recusar")}
                disabled={decidindo === proposta.id}
              >
                Manter pedido
              </button>
            </div>
            {erroDaProposta[proposta.id] && <p className={styles.erroProposta}>{erroDaProposta[proposta.id]}</p>}
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
