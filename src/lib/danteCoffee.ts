export interface DanteCoffeeItem {
  id: string;
  name: string;
  description: string | null;
  icon: string;
  price_dantes: number;
  caffeine_pct: number;
  is_active: boolean;
  sort_order: number;
  created_at?: string;
}

export interface CoffeeDonationResult {
  success: boolean;
  error?: string;
  points_remaining?: number;
  caffeine_level?: number;
  caffeine_bottle?: number;
  bottle_added?: number;
}

export interface BottleRefillResult {
  success: boolean;
  error?: string;
  caffeine_level?: number;
  caffeine_bottle?: number;
  transferred?: number;
}

export interface CoffeeDonationEvent {
  receipt: CoffeeReceipt;
}

export type DanteBlockReason = 'tired' | 'violation';

export interface DanteBlock {
  until: string;
  reason: DanteBlockReason;
}

export interface CaffeineMode {
  label: string;
  shortLabel: string;
  emoji: string;
  description: string;
}

export function getCaffeineMode(value: number | null | undefined): CaffeineMode {
  const level = Math.max(0, Math.min(100, Number(value ?? 50)));
  if (level <= 20) {
    return {
      label: 'Abstinência',
      shortLabel: 'Sem paciência',
      emoji: '😴',
      description: 'Respostas curtas, secas e com a simpatia de uma porta com Wi-Fi.',
    };
  }
  if (level <= 50) {
    return {
      label: 'Ranzinza Funcional',
      shortLabel: 'Fazendo um favor',
      emoji: '🥱',
      description: 'Ele responde, mas deixa claro que isso está interrompendo o descanso dele.',
    };
  }
  if (level <= 80) {
    return {
      label: 'Dante Casual',
      shortLabel: 'Sarcasmo equilibrado',
      emoji: '☕',
      description: 'Sarcástico, opinativo, curioso e pronto para uma boa fofoca.',
    };
  }
  return {
    label: 'O Cara do Vale do Silício',
    shortLabel: 'Modo visionário',
    emoji: '⚡',
    description: 'Respostas ricas, provocativas e com deboche de alto nível intelectual.',
  };
}

export function formatCaffeine(value: number | null | undefined): string {
  const safe = Math.max(0, Number(value ?? 0));
  return `${safe.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;
}

export function getActiveDanteBlock(
  profile: {
    dante_blocked_until?: string | null;
    dante_block_reason?: string | null;
  } | null,
  now = Date.now(),
): DanteBlock | null {
  if (!profile?.dante_blocked_until) return null;
  if (new Date(profile.dante_blocked_until).getTime() <= now) return null;
  return {
    until: profile.dante_blocked_until,
    reason: profile.dante_block_reason === 'violation' ? 'violation' : 'tired',
  };
}

export function formatBlockCountdown(until: string, now = Date.now()): string {
  const totalSeconds = Math.max(0, Math.ceil((new Date(until).getTime() - now) / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export const MAX_COFFEE_PER_ITEM = 10;
export const COFFEE_RECEIPT_PREFIX = '[RECIBO_CAFE]';

export interface CoffeeReceiptItem {
  name: string;
  icon: string;
  quantity: number;
  price: number;
}

export interface CoffeeReceipt {
  items: CoffeeReceiptItem[];
  total: number;
  caffeine_added: number;
  bottle_added: number;
}

export interface CoffeeBatchResult {
  success: boolean;
  error?: string;
  total_price?: number;
  caffeine_added?: number;
  bottle_added?: number;
  items_summary?: Array<{ name: string; icon: string; quantity: number; total_price: number }>;
}

/** Keeps each coffee quantity between 0 and the per-item limit. */
export function clampCoffeeQuantity(value: number): number {
  return Math.max(0, Math.min(MAX_COFFEE_PER_ITEM, Math.round(value)));
}

export function cartTotal(items: Pick<DanteCoffeeItem, 'id' | 'price_dantes'>[], cart: Record<string, number>): number {
  return items.reduce((sum, item) => sum + item.price_dantes * clampCoffeeQuantity(cart[item.id] ?? 0), 0);
}

export function receiptFromBatch(result: CoffeeBatchResult): CoffeeReceipt {
  return {
    items: (result.items_summary ?? []).map((i) => ({ name: i.name, icon: i.icon, quantity: i.quantity, price: i.total_price })),
    total: Number(result.total_price ?? 0),
    caffeine_added: Number(result.caffeine_added ?? 0),
    bottle_added: Number(result.bottle_added ?? 0),
  };
}

export function parseCoffeeReceipt(content: string): CoffeeReceipt | null {
  if (!content.startsWith(COFFEE_RECEIPT_PREFIX)) return null;
  try {
    const parsed = JSON.parse(content.slice(COFFEE_RECEIPT_PREFIX.length));
    if (!Array.isArray(parsed.items)) return null;
    return parsed as CoffeeReceipt;
  } catch {
    return null;
  }
}
