import { useEffect, useState } from "react";
import { Flag, LoaderCircle } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/components/Toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  createDanteReportPayload,
  DANTE_REPORT_REASON_OPTIONS,
  type DanteReportReason,
} from "@/lib/danteReports";

export interface DanteReportTarget {
  id: string;
  userMessage: string;
  danteResponse: string;
}

export function DanteReportDialog({
  target,
  onClose,
}: {
  target: DanteReportTarget | null;
  onClose: () => void;
}) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [reason, setReason] = useState<DanteReportReason | "">("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setReason("");
    setBusy(false);
  }, [target?.id]);

  const submit = async () => {
    if (!target || !user || !reason || busy) return;
    setBusy(true);
    const { error } = await supabase.from("dante_reports").insert(
      createDanteReportPayload({
        userId: user.id,
        userMessage: target.userMessage,
        danteResponse: target.danteResponse,
        reason,
      }),
    );
    setBusy(false);

    if (error) {
      toast(`Não foi possível enviar a denúncia: ${error.message}`, "error");
      return;
    }

    toast("Denúncia enviada com sucesso.", "success");
    onClose();
  };

  return (
    <Dialog
      open={!!target}
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <DialogContent className="max-w-md border-white/10 bg-ink-900 text-grape-50">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-display">
            <Flag size={18} className="text-rose-300" /> Denunciar resposta do Dante
          </DialogTitle>
          <DialogDescription className="text-grape-200/60">
            Escolha o motivo. A denúncia será enviada para revisão do administrador.
          </DialogDescription>
        </DialogHeader>

        <fieldset className="space-y-2" disabled={busy}>
          <legend className="sr-only">Motivo da denúncia</legend>
          {DANTE_REPORT_REASON_OPTIONS.map((option) => (
            <label
              key={option.value}
              className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition ${reason === option.value ? "border-rose-400/50 bg-rose-500/10" : "border-white/10 bg-white/5 hover:bg-white/10"}`}
            >
              <input
                type="radio"
                name="dante-report-reason"
                value={option.value}
                checked={reason === option.value}
                onChange={() => setReason(option.value)}
                className="mt-1 accent-rose-400"
              />
              <span>
                <span className="block text-sm font-semibold">{option.label}</span>
                <span className="mt-0.5 block text-xs leading-relaxed text-grape-200/55">
                  {option.description}
                </span>
              </span>
            </label>
          ))}
        </fieldset>

        <DialogFooter className="gap-2 sm:space-x-0">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="btn-ghost px-4 py-2 text-sm"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!reason || busy || !user}
            className="btn-danger px-4 py-2 text-sm"
          >
            {busy ? <LoaderCircle size={15} className="animate-spin" /> : <Flag size={15} />}
            {busy ? "Enviando..." : "Enviar denúncia"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
