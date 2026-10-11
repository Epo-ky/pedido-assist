import type { RateLimitRule } from "./rate-limit";

// Limites do chat. Existem para proteger a cota do plano gratuito do provedor de LLM:
// sem eles, um único visitante (ou um robô) poderia esgotá-la para todo mundo.
export const CHAT_POR_CLIENTE: RateLimitRule = { max: 20, janelaSegundos: 60 * 60 };
export const CHAT_GLOBAL: RateLimitRule = { max: 300, janelaSegundos: 24 * 60 * 60 };

// Login: o limite por e-mail segura quem tenta adivinhar a senha de uma conta; o por IP segura quem testa
// muitos e-mails de um mesmo lugar. Contam todas as tentativas, certas ou erradas.
export const LOGIN_POR_EMAIL: RateLimitRule = { max: 10, janelaSegundos: 15 * 60 };
export const LOGIN_POR_IP: RateLimitRule = { max: 30, janelaSegundos: 15 * 60 };

// Cadastro: segura a criação de contas em massa (que também furaria o limite do chat por cliente).
export const CADASTRO_POR_IP: RateLimitRule = { max: 5, janelaSegundos: 60 * 60 };

// Compras na loja: cada compra grava um pedido no banco, então sem limite alguém poderia encher o banco gratuito.
export const COMPRA_POR_CLIENTE: RateLimitRule = { max: 5, janelaSegundos: 60 * 60 };

// Confirmar ou recusar propostas de ação: é um clique de gente, então 30 por hora sobra, e evita tentativas em massa.
export const ACAO_POR_CLIENTE: RateLimitRule = { max: 30, janelaSegundos: 60 * 60 };
