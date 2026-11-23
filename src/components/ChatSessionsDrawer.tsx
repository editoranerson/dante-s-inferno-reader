import { useState } from 'react';
import { Archive, ArchiveRestore, ArrowLeft, LoaderCircle, MessageCircle, MoreVertical, Pencil, Plus, RefreshCw, ShieldAlert, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { mutateChatSession, sessionQuota, type ChatSession } from '@/lib/chatSessions';
import { useToast } from '@/components/Toast';

interface Props {
  sessions: ChatSession[];
  limit: number | null;
  loading: boolean;
  error: string;
  selectedId: string | null;
  pendingIds: Set<string>;
  hasLegacy: boolean;
  canClose: boolean;
  onClose: () => void;
  onRetry: () => void;
  onSelect: (id: string | null) => void;
  onChanged: (id?: string) => Promise<void>;
}

export function ChatSessionsDrawer(props: Props) {
  const { toast } = useToast();
  const [archived, setArchived] = useState(false);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<ChatSession | null>(null);
  const [deleting, setDeleting] = useState<ChatSession | null>(null);
  const [title, setTitle] = useState('');
  const activeQuota = sessionQuota(props.sessions, false, props.limit);
  const archiveQuota = sessionQuota(props.sessions, true, props.limit);
  const visible = props.sessions.filter((session) => session.is_archived === archived);

  const run = async (action: 'create' | 'rename' | 'archive' | 'unarchive' | 'delete', session?: ChatSession) => {
    if (busy) return;
    setBusy(true);
    try {
      const result = await mutateChatSession(action, session?.id, action === 'rename' ? title.trim() : undefined);
      setEditing(null);
      setDeleting(null);
      await props.onChanged(action === 'create' && typeof result?.id === 'string' ? result.id : undefined);
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Não foi possível alterar a sessão.', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="absolute inset-0 z-20 flex min-h-0 flex-col bg-background text-foreground animate-fade-in" aria-label="Sessões de conversa">
      <header className="flex items-center justify-between border-b border-border px-4 py-3">
        <h2 className="font-dante text-lg font-semibold">Conversas com Dante</h2>
        <Button variant="ghost" size="icon" onClick={props.onClose} aria-label={props.canClose ? 'Voltar à conversa' : 'Fechar sessões'} title={props.canClose ? 'Voltar à conversa' : 'Fechar sessões'}>
          {props.canClose ? <ArrowLeft /> : <X />}
        </Button>
      </header>
      <div className="space-y-3 px-4 pb-3 pt-4">
        <Button className="w-full" onClick={() => void run('create')} disabled={busy || props.loading || !!props.error || activeQuota.full}>
          {busy ? <LoaderCircle className="animate-spin" /> : <Plus />} Nova sessão
        </Button>
        <Tabs value={archived ? 'archived' : 'active'} onValueChange={(value) => setArchived(value === 'archived')}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="active" className="gap-1.5"><MessageCircle size={14} /> Ativas <span className="text-xs">{activeQuota.count}/{props.limit ?? '∞'}</span></TabsTrigger>
            <TabsTrigger value="archived" className="gap-1.5"><Archive size={14} /> Arquivadas <span className="text-xs">{archiveQuota.count}/{props.limit ?? '∞'}</span></TabsTrigger>
          </TabsList>
        </Tabs>
        {activeQuota.full && <p className="text-xs text-muted-foreground" role="status">Limite de sessões ativas atingido.</p>}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
        {props.loading ? <div className="flex justify-center py-12" role="status" aria-label="Carregando sessões"><LoaderCircle className="animate-spin text-muted-foreground" /></div>
          : props.error ? <div className="space-y-3 py-8 text-center"><p className="text-sm text-destructive" role="alert">{props.error}</p><Button variant="outline" onClick={props.onRetry}><RefreshCw /> Tentar novamente</Button></div>
          : <div className="space-y-3">
            {visible.map((session) => (
              <div key={session.id} className={`dante-session-border flex items-center gap-1 rounded-lg bg-card p-1 ${session.is_archived ? 'dante-session-archived' : ''} ${props.selectedId === session.id ? 'ring-1 ring-ring' : ''}`}>
                <Button variant="ghost" className="h-auto min-h-16 min-w-0 flex-1 justify-start gap-3 whitespace-normal px-3 py-3 text-left" onClick={() => props.onSelect(session.id)} disabled={busy}>
                  {session.is_archived ? <Archive className="text-muted-foreground" /> : <MessageCircle className="text-primary" />}
                  <span className="min-w-0 flex-1">
                    <span className="line-clamp-2 break-words font-medium [overflow-wrap:anywhere]">{session.title}</span>
                    <span className="mt-1 block text-xs text-muted-foreground">{new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' }).format(new Date(session.updated_at))}</span>
                  </span>
                  {props.pendingIds.has(session.id) && <ShieldAlert className="text-destructive" aria-label="Denúncia em análise" />}
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" disabled={busy} aria-label={`Menu de ${session.title}`} title="Opções da sessão"><MoreVertical /></Button></DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="z-[70]">
                    <DropdownMenuItem onSelect={() => { setEditing(session); setTitle(session.title); }}><Pencil /> Renomear</DropdownMenuItem>
                    <DropdownMenuItem disabled={session.is_archived ? activeQuota.full : archiveQuota.full} onSelect={() => void run(session.is_archived ? 'unarchive' : 'archive', session)}>
                      {session.is_archived ? <ArchiveRestore /> : <Archive />}{session.is_archived ? 'Reativar' : 'Arquivar'}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem disabled={props.pendingIds.has(session.id)} className="text-destructive focus:text-destructive" onSelect={() => setDeleting(session)}><Trash2 /> Excluir{props.pendingIds.has(session.id) ? ' · em análise' : ''}</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            ))}
            {visible.length === 0 && <div className="flex flex-col items-center gap-3 py-12 text-muted-foreground">{archived ? <Archive size={28} /> : <MessageCircle size={28} />}<p className="text-sm">{archived ? 'Nenhuma sessão arquivada.' : 'Nenhuma sessão ativa.'}</p></div>}
            {props.hasLegacy && archived && <Button variant="outline" className="h-auto w-full justify-start py-3" onClick={() => props.onSelect(null)}><Archive /> Conversa anterior <span className="ml-auto text-xs text-muted-foreground">Só leitura</span></Button>}
          </div>}
      </div>
      <Dialog open={!!editing} onOpenChange={(open) => { if (!open && !busy) setEditing(null); }}>
        <DialogContent className="z-[80] max-w-[calc(100%-2rem)] text-foreground sm:max-w-lg">
          <DialogHeader><DialogTitle>Renomear sessão</DialogTitle><DialogDescription>Nome da conversa</DialogDescription></DialogHeader>
          <form onSubmit={(event) => { event.preventDefault(); if (editing && title.trim()) void run('rename', editing); }}>
            <input aria-label="Nome da sessão" autoFocus maxLength={80} value={title} onChange={(event) => setTitle(event.target.value)} disabled={busy} className="mb-4 w-full rounded-md border border-input bg-background px-3 py-2 text-foreground outline-none focus:ring-1 focus:ring-ring" />
            <DialogFooter><Button type="button" variant="outline" disabled={busy} onClick={() => setEditing(null)}>Cancelar</Button><Button type="submit" disabled={busy || !title.trim()}>Salvar</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog open={!!deleting} onOpenChange={(open) => { if (!open && !busy) setDeleting(null); }}>
        <DialogContent className="z-[80] max-w-[calc(100%-2rem)] text-foreground sm:max-w-lg">
          <DialogHeader><DialogTitle>Excluir sessão?</DialogTitle><DialogDescription>“{deleting?.title}” e suas mensagens serão excluídas permanentemente.</DialogDescription></DialogHeader>
          <DialogFooter><Button variant="outline" disabled={busy} onClick={() => setDeleting(null)}>Cancelar</Button><Button variant="destructive" disabled={busy} onClick={() => { if (deleting) void run('delete', deleting); }}>{busy && <LoaderCircle className="animate-spin" />}Excluir sessão</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}