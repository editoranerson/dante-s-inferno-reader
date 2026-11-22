export interface DanteCoffeeItem {
  id: string;
  name: string;
  description: string | null;
  icon: string;
  price_dantes: number;
  is_active: boolean;
  sort_order: number;
  created_at?: string;
}

export interface CoffeeDonationEvent {
  receipt: CoffeeReceipt;
}

export type DanteBlockReason = "tired" | "violation";

export interface DanteBlock {
  until: string;
  reason: DanteBlockReason;
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
    reason: profile.dante_block_reason === "violation" ? "violation" : "tired",
  };
}

export function formatBlockCountdown(until: string, now = Date.now()): string {
  const totalSeconds = Math.max(0, Math.ceil((new Date(until).getTime() - now) / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export const MAX_COFFEE_PER_ITEM = 10;
export const COFFEE_RECEIPT_PREFIX = "[RECIBO_CAFE]";

export interface CoffeeReceiptItem {
  name: string;
  icon: string;
  quantity: number;
  price: number;
}

export interface CoffeeReceipt {
  items: CoffeeReceiptItem[];
  total: number;
}

export interface CoffeeBatchResult {
  success: boolean;
  error?: string;
  total_price?: number;
  total_spent?: number;
  items_summary?: Array<{ name: string; icon: string; quantity: number; total_price: number }>;
}

/** Keeps each coffee quantity between 0 and the per-item limit. */
export function clampCoffeeQuantity(value: number): number {
  return Math.max(0, Math.min(MAX_COFFEE_PER_ITEM, Math.round(value)));
}

export function cartTotal(
  items: Pick<DanteCoffeeItem, "id" | "price_dantes">[],
  cart: Record<string, number>,
): number {
  return items.reduce(
    (sum, item) => sum + item.price_dantes * clampCoffeeQuantity(cart[item.id] ?? 0),
    0,
  );
}

export function receiptFromBatch(result: CoffeeBatchResult): CoffeeReceipt {
  return {
    items: (result.items_summary ?? []).map((i) => ({
      name: i.name,
      icon: i.icon,
      quantity: i.quantity,
      price: i.total_price,
    })),
    total: Number(result.total_price ?? result.total_spent ?? 0),
  };
}

export function parseCoffeeReceipt(content: string): CoffeeReceipt | null {
  if (!content.startsWith(COFFEE_RECEIPT_PREFIX)) return null;
  try {
    const parsed: unknown = JSON.parse(content.slice(COFFEE_RECEIPT_PREFIX.length));
    if (!parsed || typeof parsed !== "object") return null;
    const candidate = parsed as Record<string, unknown>;
    if (!Array.isArray(candidate.items) || candidate.items.length === 0) return null;

    const items: CoffeeReceiptItem[] = [];
    for (const rawItem of candidate.items) {
      if (!rawItem || typeof rawItem !== "object") return null;
      const item = rawItem as Record<string, unknown>;
      if (
        typeof item.name !== "string" ||
        !item.name.trim() ||
        typeof item.quantity !== "number" ||
        !Number.isFinite(item.quantity) ||
        item.quantity <= 0 ||
        typeof item.price !== "number" ||
        !Number.isFinite(item.price) ||
        item.price < 0
      )
        return null;
      items.push({
        name: item.name,
        icon: typeof item.icon === "string" ? item.icon : "coffee",
        quantity: Math.max(1, Math.round(item.quantity)),
        price: item.price,
      });
    }

    if (
      typeof candidate.total !== "number" ||
      !Number.isFinite(candidate.total) ||
      candidate.total < 0
    )
      return null;

    return {
      items,
      total: candidate.total,
    };
  } catch {
    return null;
  }
}
