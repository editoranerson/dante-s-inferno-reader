import { Coffee, CupSoda, Flame, Zap } from 'lucide-react';

const ICONS = {
  coffee: Coffee,
  'cup-soda': CupSoda,
  flame: Flame,
  zap: Zap,
};

export function DanteCoffeeIcon({ icon, size = 22 }: { icon: string; size?: number }) {
  const Icon = ICONS[icon as keyof typeof ICONS] ?? Coffee;
  return <Icon size={size} aria-hidden="true" />;
}
