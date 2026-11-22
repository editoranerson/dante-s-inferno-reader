import { supabase } from '@/lib/supabase';

export interface ChatSession {
  id: string;
  user_id: string;
  title: string;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
}

export function sessionQuota(sessions: ChatSession[], archived: boolean, limit: number | null) {
  const count = sessions.filter((session) => session.is_archived === archived).length;
  return { count, full: limit !== null && count >= limit };
}

export function canSendToSession(session: ChatSession | null) {
  return session !== null && !session.is_archived;
}

export function sessionHistoryScope(sessionId: string | null) {
  return sessionId ? { column: 'session_id' as const, value: sessionId } : null;
}

const SESSION_ERRORS: Record<string, string> = {
  limit_reached: 'Você atingiu o limite de sessões ativas. Arquive uma conversa para liberar espaço.',
  active_limit_reached: 'Você atingiu o limite de sessões ativas. Arquive uma conversa para liberar espaço.',
  session_limit_reached: 'Você atingiu o limite de sessões ativas. Arquive uma conversa para liberar espaço.',
  archive_limit_reached: 'Seu arquivo está cheio. Reative ou exclua uma sessão arquivada para liberar espaço.',
  unauthenticated: 'Sua sessão expirou. Faça login novamente.',
  not_found: 'Sessão não encontrada. Atualize a lista de conversas.',
};

export async function fetchChatSessions(userId: string) {
  const { data, error } = await supabase.from('chat_sessions').select('*')
    .eq('user_id', userId).order('updated_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as ChatSession[];
}

export async function fetchSessionLimit(userId: string): Promise<number | null> {
  const { data, error } = await supabase.rpc('get_user_session_limit', { p_user_id: userId });
  if (error) throw new Error(error.message);
  const limit = Number(data);
  if (!Number.isFinite(limit) || limit < 0) throw new Error('Não foi possível consultar o limite de sessões.');
  return limit >= 999999 ? null : limit;
}

export async function mutateChatSession(
  action: 'create' | 'rename' | 'archive' | 'unarchive' | 'delete',
  sessionId?: string,
  title?: string,
) {
  const names = {
    create: 'create_chat_session', rename: 'rename_chat_session', archive: 'archive_chat_session',
    unarchive: 'unarchive_chat_session', delete: 'delete_chat_session',
  };
  const args = action === 'create' ? { p_title: title ?? 'Nova conversa' }
    : action === 'rename' ? { p_session_id: sessionId, p_title: title }
    : { p_session_id: sessionId };
  const { data, error } = await supabase.rpc(names[action], args);
  if (error) throw new Error(error.message);
  if (data && typeof data === 'object' && data.ok === false) {
    throw new Error(SESSION_ERRORS[String(data.error)] ?? 'Não foi possível alterar esta sessão.');
  }
  return data;
}