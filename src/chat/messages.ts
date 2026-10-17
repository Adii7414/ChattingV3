import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { deleteMessage, editMessage, getMessages, messageAction, sendMessage, toggleReaction, type GetMessagesOutputType } from 'zitejs/api';
import { useChat, usePoll } from './store';

export type Msg = GetMessagesOutputType['messages'][number] & { pending?: boolean };
type Pending = Msg & { realId?: string };
export type Draft = { body: string; files: { url: string; filename: string; mimeType: string }[]; replyTo?: Msg | null };

/** Messages for a conversation (or one thread), with optimistic send/react/edit/delete/pin/star. */
export function useMessages(conversationId: string, parentMessageId?: string) {
  const { me, refresh } = useChat();
  const [data, setData] = useState<GetMessagesOutputType | null>(null);
  const [pending, setPending] = useState<Pending[]>([]);
  const [error, setError] = useState(false);
  const [firstUnreadAt, setFirstUnreadAt] = useState<string | null>(null);
  const lastMarked = useRef<string | null>(null);
  const inflight = useRef(false);

  useEffect(() => { setData(null); setPending([]); setError(false); setFirstUnreadAt(null); lastMarked.current = null; }, [conversationId, parentMessageId]);

  const load = async () => {
    if (inflight.current) return; // never stack requests on a slow network
    inflight.current = true;
    try {
      const prevLast = lastMarked.current;
      const d = await getMessages({ conversationId, parentMessageId, markRead: false });
      const last = d.messages[d.messages.length - 1]?.id ?? null;
      // Mark read only when a new message arrived since we last did — keeps polling cheap.
      if (!parentMessageId && last && last !== prevLast && !document.hidden) {
        if (prevLast === null && d.myLastReadAt) setFirstUnreadAt(d.myLastReadAt);
        lastMarked.current = last;
        getMessages({ conversationId, markRead: true }).then(() => refresh()).catch(() => {});
      }
      setData(d);
      setError(false);
    } catch { setError(true); } finally { inflight.current = false; }
  };
  usePoll(load, 8000, [conversationId, parentMessageId]); // fallback; live updates arrive via 'chat:live'
  const loadRef = useRef(load);
  loadRef.current = load;
  useEffect(() => {
    const f = (e: Event) => { if ((e as CustomEvent).detail === conversationId) { if (inflight.current) setTimeout(() => loadRef.current(), 150); else loadRef.current(); } };
    window.addEventListener('chat:live', f);
    return () => window.removeEventListener('chat:live', f);
  }, [conversationId]);

  const messages = useMemo(() => {
    const real = data?.messages ?? [];
    const ids = new Set(real.map((m) => m.id));
    const shown = pending.filter((p) => !(p.realId && ids.has(p.realId)) &&
      !(!p.realId && real.some((m) => m.senderId === me.id && m.body === p.body && +new Date(m.sentAt) >= +new Date(p.sentAt) - 30_000 && m.attachments.length === p.attachments.length)));
    return [...real, ...shown] as Msg[];
  }, [data, pending, me.id]);
  useEffect(() => {
    const ids = new Set((data?.messages ?? []).map((m) => m.id));
    if (pending.some((p) => p.realId && ids.has(p.realId))) setPending((ps) => ps.filter((p) => !(p.realId && ids.has(p.realId))));
  }, [data, pending]);

  const send = async (d: Draft, target = conversationId) => {
    const local = target === conversationId;
    const tmp: Pending = {
      id: `tmp-${Date.now()}-${Math.random()}`, body: d.body, senderId: me.id, sentAt: new Date().toISOString(), editedAt: null,
      reactions: [], replyCount: 0, lastReplyAt: null, pending: true, pinned: false, starred: false,
      replyTo: d.replyTo ? { id: d.replyTo.id, body: d.replyTo.body, senderId: d.replyTo.senderId } : null,
      attachments: d.files.map((f) => ({ url: f.url, name: f.filename, mimeType: f.mimeType })),
    };
    if (local) setPending((p) => [...p, tmp]);
    try {
      const { id } = await sendMessage({
        conversationId: target, body: d.body, parentMessageId: local ? parentMessageId : undefined, replyToId: d.replyTo?.id,
        attachments: d.files.map(({ url, filename }) => ({ url, filename })),
      });
      if (local) { setPending((p) => p.map((m) => (m.id === tmp.id ? { ...m, realId: id } : m))); lastMarked.current = id; load(); }
      refresh();
      return true;
    } catch (e) {
      if (local) setPending((p) => p.filter((m) => m.id !== tmp.id));
      toast.error(e instanceof Error ? e.message : 'Message not sent');
      return false;
    }
  };

  const patch = (id: string, fn: (m: Msg) => Msg | null) =>
    setData((d) => d && { ...d, messages: d.messages.map((m) => (m.id === id ? fn(m) : m)).filter(Boolean) as Msg[] });

  const react = async (messageId: string, emoji: string) => {
    patch(messageId, (m) => ({ ...m, reactions: flip(m.reactions, emoji, me.id) }));
    try { await toggleReaction({ conversationId, messageId, emoji }); } catch { toast.error('Couldn’t react'); load(); }
  };
  const edit = async (messageId: string, body: string) => {
    patch(messageId, (m) => ({ ...m, body, editedAt: new Date().toISOString() }));
    try { await editMessage({ messageId, body }); } catch (e) { toast.error(e instanceof Error ? e.message : 'Couldn’t edit'); load(); }
  };
  const remove = async (messageId: string) => {
    patch(messageId, () => null);
    try { await deleteMessage({ messageId }); toast.success('Message deleted'); refresh(); } catch (e) { toast.error(e instanceof Error ? e.message : 'Couldn’t delete'); load(); }
  };
  const toggle = async (messageId: string, action: 'pin' | 'star') => {
    const key = action === 'pin' ? 'pinned' : 'starred';
    patch(messageId, (m) => ({ ...m, [key]: !m[key] }));
    try { const { on } = await messageAction({ messageId, action }); toast.success(action === 'pin' ? (on ? 'Pinned to the chat' : 'Unpinned') : on ? 'Saved' : 'Removed from saved'); }
    catch { toast.error('Couldn’t update'); load(); }
  };

  return { data, messages, error, send, react, edit, remove, toggle, firstUnreadAt };
}

function flip(rs: Msg['reactions'], emoji: string, me: string) {
  const has = rs.find((r) => r.emoji === emoji);
  if (!has) return [...rs, { emoji, userIds: [me] }];
  const userIds = has.userIds.includes(me) ? has.userIds.filter((u) => u !== me) : [...has.userIds, me];
  return rs.map((r) => (r.emoji === emoji ? { ...r, userIds } : r)).filter((r) => r.userIds.length);
}

export function readersOf(sentAt: string, reads: GetMessagesOutputType['reads']) {
  return reads.filter((r) => r.lastReadAt >= sentAt).map((r) => r.userId);
}
export function receiptFor(sentAt: string, reads: GetMessagesOutputType['reads'], isGroup?: boolean) {
  const n = readersOf(sentAt, reads).length;
  if (!n) return 'Delivered';
  return isGroup ? `Seen by ${n}` : 'Read';
}
