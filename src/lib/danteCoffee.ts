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
  item: DanteCoffeeItem;
  caffeineAdded: number;
  bottleAdded: number;
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
