import { Coffee, Coins } from "lucide-react";
import { type CoffeeReceipt } from "@/lib/danteCoffee";

export function CoffeeReceiptCard({ receipt }: { receipt: CoffeeReceipt }) {
  return (
    <article
      className="dante-coffee-receipt w-[92%] overflow-hidden rounded-2xl bg-coffee-matte px-4 py-3.5 text-grape-50 shadow-xl"
      role="status"
      aria-label="Recibo de Café"
    >
      <header className="flex items-center gap-2 border-b border-grape-50/10 pb-2.5">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gold-400/10 text-gold-400">
          <Coffee size={18} aria-hidden="true" />
        </span>
        <div>
          <h4 className="font-display text-sm font-semibold">Recibo de Café</h4>
          <p className="text-[10px] uppercase text-grape-200/60">Presente confirmado</p>
        </div>
      </header>
      <ul className="mt-3 space-y-1.5">
        {receipt.items.map((item, index) => (
          <li key={`${item.name}-${index}`} className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1 text-xs">
            <span className="min-w-0 flex-1 break-words text-grape-100/85">
              <strong className="font-semibold text-gold-400">{item.quantity}x</strong>{" "}{item.name}
            </span>
            <span className="whitespace-nowrap text-[11px] text-grape-200/60">
              {item.price.toLocaleString("pt-BR")} Dantes
            </span>
          </li>
        ))}
      </ul>
      <div className="mt-3 flex items-center gap-1.5 border-t border-grape-50/10 pt-2.5 text-xs font-semibold text-gold-400">
        <Coins size={13} aria-hidden="true" /> {receipt.total.toLocaleString("pt-BR")} Dantes
      </div>
    </article>
  );
}
