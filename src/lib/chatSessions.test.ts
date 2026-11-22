import { describe, expect, it, vi } from 'vitest';
vi.mock('@/lib/supabase', () => ({ supabase: { rpc: vi.fn() } }));
import { supabase } from '@/lib/supabase';
import { canSendToSession, fetchSessionLimit, mutateChatSession, sessionHistoryScope, sessionQuota, type ChatSession } from './chatSessions';
import { createDanteReportPayload } from './danteReports';

const session = (id: string, archived = false): ChatSession => ({ id, user_id: 'user', title: 'Conversa', is_archived: archived, created_at: '2026-11-22', updated_at: '2026-11-22' });

describe('Sessões do Dante', () => {
  it.each([['Free', 5], ['Plus', 10], ['Premium', 15], ['Premium+', 20]] as const)('%s permite %i ativas e a mesma cota independente para arquivo', (_plan, limit) => {
    const rows = Array.from({ length: limit }, (_, i) => session(String(i)));
    expect(sessionQuota(rows, false, limit)).toEqual({ count: limit, full: true });
    expect(sessionQuota(rows.slice(1), false, limit).full).toBe(false);
    expect(sessionQuota(rows, true, limit)).toEqual({ count: 0, full: false });
    const archives = Array.from({ length: limit }, (_, i) => session(`archive-${i}`, true));
    expect(sessionQuota([...rows, ...archives], true, limit)).toEqual({ count: limit, full: true });
  });
  it('ADMIN mantém sessões ilimitadas', async () => {
    vi.mocked(supabase.rpc).mockResolvedValueOnce({ data: 999999, error: null } as never);
    expect(await fetchSessionLimit('admin')).toBeNull();
    expect(sessionQuota(Array.from({ length: 21 }, (_, i) => session(String(i))), false, null).full).toBe(false);
  });
  it('arquivo e ausência de sessão não permitem conversar', () => {
    expect(canSendToSession(session('active'))).toBe(true);
    expect(canSendToSession(session('archived', true))).toBe(false);
    expect(canSendToSession(null)).toBe(false);
  });
  it('histórico recebe o identificador exclusivo da sessão', () => {
    expect(sessionHistoryScope('fofoca')).toEqual({ column: 'session_id', value: 'fofoca' });
    expect(sessionHistoryScope('servicos')).toEqual({ column: 'session_id', value: 'servicos' });
    expect(sessionHistoryScope(null)).toBeNull();
  });
  it('denúncia pendente fica vinculada à sessão para impedir exclusão', () => {
    expect(createDanteReportPayload({ userId: 'user', userMessage: 'Oi', danteResponse: 'Resposta', reason: 'other', sessionId: 'fofoca' })).toMatchObject({ session_id: 'fofoca', status: 'pending' });
  });
  it('exclusão usa RPC e propaga a trava de moderação sem apagar diretamente', async () => {
    vi.mocked(supabase.rpc).mockResolvedValueOnce({ data: null, error: { message: 'Esta sessão possui uma mensagem em análise pela moderação e não pode ser excluída.' } } as never);
    await expect(mutateChatSession('delete', 'fofoca')).rejects.toThrow('em análise pela moderação');
    expect(supabase.rpc).toHaveBeenLastCalledWith('delete_chat_session', { p_session_id: 'fofoca' });
  });
  it('respeita recusas de cota retornadas pelo banco', async () => {
    vi.mocked(supabase.rpc).mockResolvedValueOnce({ data: { ok: false, error: 'limit_reached' }, error: null } as never);
    await expect(mutateChatSession('create')).rejects.toThrow('limite de sessões ativas');
  });
});