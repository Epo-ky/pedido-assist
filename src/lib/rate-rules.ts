import type { RateLimitRule } from "./rate-limit";

// Limites do chat. Existem para proteger a cota do plano gratuito do provedor de LLM:
// sem eles, um único visitante (ou um robô) poderia esgotá-la para todo mundo.
export const CHAT_POR_CLIENTE: RateLimitRule = { max: 20, janelaSegundos: 60 * 60 };
export const CHAT_GLOBAL: RateLimitRule = { max: 300, janelaSegundos: 24 * 60 * 60 };
