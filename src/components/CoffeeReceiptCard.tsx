import { Coffee, Coins, CupSoda, Zap } from "lucide-react";
import { formatCaffeine, type CoffeeReceipt } from "@/lib/danteCoffee";

export function CoffeeReceiptCard({ receipt }: { receipt: CoffeeReceipt }) {
  return (
    <article
      className="dante-coffee-receipt w-[92%] overflow-hidden rounded-2xl bg-ink-900/90 px-4 py-3.5 text-grape-50 shadow-xl"
      role="status"
      aria-label="Recibo de Café"
    >
      <header className="flex items-center gap-2 border-b border-gold-400/15 pb-2.5">
        <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-gold-400/10 text-gold-400">
          <Coffee size={18} aria-hidden="true" />
        </span>
        <div>
          <h4 className="font-display text-sm font-semibold">Recibo de Café</h4>
          <p className="text-[10px] uppercase tracking-widest text-grape-200/45">
            Doação confirmada
          </p>
        </div>
      </header>

      <ul className="mt-3 space-y-1.5">
        {receipt.items.map((item, index) => (
          <li
            key={`${item.name}-${index}`}
            className="flex items-center justify-between gap-3 text-xs"
          >
            <span className="text-grape-100/85">
              <strong className="font-semibold text-gold-300">{item.quantity}x</strong> {item.name}
            </span>
            <span className="whitespace-nowrap text-[11px] text-grape-200/50">
              {item.price.toLocaleString("pt-BR")} Dantes
            </span>
          </li>
        ))}
      </ul>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-gold-400/15 pt-2.5 text-xs">
        <span className="flex items-center gap-1.5 font-semibold text-gold-300">
          <Coins size={13} aria-hidden="true" /> {receipt.total.toLocaleString("pt-BR")} Dantes
        </span>
        <span className="flex items-center gap-1.5 font-semibold text-gold-400">
          <Zap size={13} aria-hidden="true" /> +{formatCaffeine(receipt.caffeine_added)} de cafeína
        </span>
      </div>

      {receipt.bottle_added > 0 && (
        <p className="mt-2.5 flex items-start gap-1.5 rounded-lg bg-sky2-400/5 px-2.5 py-2 text-[11px] leading-relaxed text-sky2-300">
          <CupSoda size={13} className="mt-0.5 flex-shrink-0" aria-hidden="true" />
          {formatCaffeine(receipt.bottle_added)} do excedente foram guardados na sua Garrafa
          Térmica.
        </p>
      )}
    </article>
  );
}
