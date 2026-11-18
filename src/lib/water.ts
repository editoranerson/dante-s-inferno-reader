export const ML_PER_MESSAGE = 25;
export const WATER_LEVELS = [
  { max: 100, emoji: '💧', label: 'Algumas gotas', quip: 'Mal molhei os servidores. Pergunte mais, mortal.' },
  { max: 250, emoji: '🥛', label: 'Um copo d\u2019água', quip: 'Um copo inteiro evaporado por suas dúvidas existenciais.' },
  { max: 500, emoji: '🍼', label: 'Uma garrafinha', quip: 'Meia garrafa de água sacrificada no altar da sua curiosidade.' },
  { max: 1500, emoji: '🫗', label: 'Uma jarra', quip: 'Uma jarra inteira. O data center já está suando.' },
  { max: 5000, emoji: '🪣', label: 'Um balde', quip: 'Um balde! Os peixes do rio mandam lembranças.' },
  { max: 20000, emoji: '🛢️', label: 'Um galão de 20L', quip: 'Um galão inteiro. Você é oficialmente uma seca ambulante.' },
  { max: Infinity, emoji: '🚛', label: 'Um caminhão-pipa', quip: 'Chamaram o caminhão-pipa. Parabéns, Lúcifer está orgulhoso.' },
];
export function waterFor(messages: number) {
  const ml = messages * ML_PER_MESSAGE;
  const i = WATER_LEVELS.findIndex((l) => ml < l.max);
  const level = WATER_LEVELS[i];
  const prevMax = i > 0 ? WATER_LEVELS[i - 1].max : 0;
  const progress = level.max === Infinity ? 1 : (ml - prevMax) / (level.max - prevMax);
  const toNext = level.max === Infinity ? 0 : Math.ceil((level.max - ml) / ML_PER_MESSAGE);
  return { ml, level, next: WATER_LEVELS[i + 1], progress, toNext };
}
export const formatMl = (ml: number) => (ml < 1000 ? `${ml} ml` : `${(ml / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} L`);
