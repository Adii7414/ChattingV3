import { useEffect, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { isToday, isYesterday, format } from 'date-fns';
import { Archive, ArchiveRestore, ArrowDown, ArrowLeft, BellOff, Bell, ImagePlus, Info, Loader2, MoreHorizontal, Pin, PinOff, Search, Settings2, X } from 'lucide-react';
import { toast } from 'sonner';
import { updateConversation } from 'zitejs/api';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@project/components/ui/dropdown-menu';
import { ConvAvatar } from './Avatars';
import MessageItem, { RichText, type MsgActions } from './MessageItem';
import Composer from './Composer';
import ThreadPanel from './ThreadPanel';
import InfoSheet from './InfoSheet';
import PersonDialog from './PersonDialog';
import ForwardDialog from './ForwardDialog';
import { readersOf, receiptFor, useMessages, type Msg } from './messages';
import { useChat } from './store';
import ChannelBar from './ChannelBar';

const dayLabel = (iso: string) => { const d = new Date(iso); return isToday(d) ? 'Today' : isYesterday(d) ? 'Yesterday' : format(d, 'EEEE, d MMMM'); };
export const jumpTo = (id: string) => {
  const el = document.getElementById(`msg-${id}`);
  if (!el) return toast('That message is further back in the chat');
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  el.classList.add('bg-primary/10'); setTimeout(() => el.classList.remove('bg-primary/10'), 1600);
};

export function MessageList({ messages, isGroup, receiptId, receipt, seenBy, inThread, actions, unreadAfter, highlight, scroller }: {
  messages: Msg[]; isGroup: boolean; receiptId?: string; receipt?: string; seenBy?: (m: Msg) => string[] | undefined; inThread?: boolean;
  actions: MsgActions; unreadAfter?: string | null; highlight?: string; scroller?: React.RefObject<HTMLDivElement>;
}) {
  const { me } = useChat();
  const endRef = useRef<HTMLDivElement>(null);
  const count = useRef(0);
  const [newBelow, setNewBelow] = useState(0);
  const [away, setAway] = useState(false);
  useEffect(() => {
    const el = scroller?.current; if (!el) return;
    const f = () => { const far = el.scrollHeight - el.scrollTop - el.clientHeight > 200; setAway(far); if (!far) setNewBelow(0); };
    el.addEventListener('scroll', f, { passive: true }); return () => el.removeEventListener('scroll', f);
  }, [scroller]);
  useEffect(() => {
    const added = messages.length - count.current;
    const lastMine = messages[messages.length - 1]?.senderId === me.id;
    if (added > 0) {
      if (!count.current || !away || lastMine) endRef.current?.scrollIntoView({ behavior: count.current ? 'smooth' : 'auto', block: 'end' });
      else setNewBelow((n) => n + added);
    }
    count.current = messages.length;
  }, [messages.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const firstUnread = unreadAfter ? messages.find((m) => m.senderId !== me.id && m.sentAt > unreadAfter)?.id : undefined;

  return (
    <div className="mx-auto flex max-w-3xl flex-col">
      {messages.map((m, i) => (
        <div key={m.id}>
          {(!messages[i - 1] || dayLabel(messages[i - 1].sentAt) !== dayLabel(m.sentAt)) && !inThread && (
            <div className="sticky top-0 z-[1] my-4 flex justify-center"><span className="rounded-full border border-border bg-background/90 px-3 py-1 text-[11px] font-medium text-muted-foreground backdrop-blur">{dayLabel(m.sentAt)}</span></div>
          )}
          {m.id === firstUnread && <div className="my-3 flex items-center gap-3 text-[11px] font-semibold uppercase tracking-wide text-primary"><span className="h-px flex-1 bg-primary/40" />New messages<span className="h-px flex-1 bg-primary/40" /></div>}
          <MessageItem m={m} prev={messages[i - 1]} next={messages[i + 1]} isGroup={isGroup} inThread={inThread} highlight={highlight}
            receipt={m.id === receiptId ? receipt : undefined} seenBy={seenBy?.(m)} {...actions} />
        </div>
      ))}
      <div ref={endRef} />
      {away && scroller && (
        <button onClick={() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); setNewBelow(0); }}
          className="sticky bottom-2 ml-auto flex h-10 items-center gap-1.5 rounded-full border border-border bg-background px-3 text-sm shadow-lg">
          <ArrowDown className="h-4 w-4" />{newBelow > 0 && <span className="font-medium">{newBelow} new</span>}
        </button>
      )}
    </div>
  );
}

export function Typing({ ids }: { ids: string[] }) {
  const { people } = useChat();
  if (!ids.length) return null;
  const names = ids.map((i) => people.get(i)?.name.split(' ')[0] ?? 'Someone');
  return (
    <div className="mx-auto flex max-w-3xl items-center gap-2 px-2 pt-2 text-xs text-muted-foreground">
      <span className="flex gap-0.5">{[0, 1, 2].map((i) => <span key={i} className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground" style={{ animationDelay: `${i * 0.15}s` }} />)}</span>
      {names.length > 2 ? 'Several people are typing…' : `${names.join(' and ')} ${names.length > 1 ? 'are' : 'is'} typing…`}
    </div>
  );
}

export default function Thread() {
  const { id = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const threadId = params.get('thread');
  const { conversations, titleOf, othersOf, me, refresh, communities, settingsOf, channelOf, can, isAdmin } = useChat();
  const conv = conversations?.find((c) => c.id === id);
  const { data, messages, error, send, react, edit, remove, toggle, firstUnreadAt } = useMessages(id);
  const [info, setInfo] = useState(false);
  const [person, setPerson] = useState<string | null>(null);
  const [replyTo, setReplyTo] = useState<Msg | null>(null);
  const [forward, setForward] = useState<Msg | null>(null);
  const [search, setSearch] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [dropped, setDropped] = useState<File[] | null>(null);
  const [pinIdx, setPinIdx] = useState(0);
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => { setReplyTo(null); setSearch(null); setPinIdx(0); }, [id]);
  useEffect(() => {
    const f = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && threadId) setParams({});
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'f' && !e.shiftKey) { e.preventDefault(); setSearch((s) => s ?? ''); }
    };
    window.addEventListener('keydown', f); return () => window.removeEventListener('keydown', f);
  }, [threadId, setParams]);

  if (error && !data) return <section className="flex flex-1 items-center justify-center text-muted-foreground">This conversation isn’t available. <Link to="/app" className="ml-1 underline">Go back</Link></section>;
  const others = conv ? othersOf(conv) : [];
  const community = communities.find((c) => c.id === conv?.communityId);
  const online = others.filter((o) => o.online).length;
  const status = !conv ? '' : conv.communityId ? (conv.description || community?.name || '')
    : conv.isGroup ? `${conv.memberIds.length} members${online ? ` · ${online} online` : ''}`
    : others[0]?.statusText ? `${others[0].statusEmoji ?? ''} ${others[0].statusText}` : others[0]?.online ? 'Online' : 'Offline';
  const myLast = [...(data?.messages ?? [])].reverse().find((m) => m.senderId === me.id);
  const flag = async (action: 'pin' | 'mute' | 'archive') => {
    try { await updateConversation({ conversationId: id, action }); await refresh(); if (action === 'archive') toast.success(conv?.archived ? 'Moved back to chats' : 'Archived'); } catch { toast.error('Couldn’t update'); }
  };
  const shown = search && search.length >= 2 ? messages.filter((m) => m.body.toLowerCase().includes(search.toLowerCase())) : messages;
  const pinned = messages.filter((m) => m.pinned);
  const pin = pinned[pinIdx % Math.max(pinned.length, 1)];
  const cs = settingsOf(conv?.communityId);
  const chs = conv ? channelOf(conv) : null;
  const canModerate = conv ? (conv.communityId ? can(conv.communityId, 'manageMessages') : conv.isGroup && isAdmin(conv)) : false;
  const locked = !!(conv?.communityId && chs?.announcement && !can(conv.communityId, 'postAnnouncements'));
  const actions: MsgActions = {
    community: cs, canModerate,
    onReact: react, onDelete: remove, onEdit: edit, onReply: (mid) => setParams({ thread: mid }), onPerson: (u) => u !== me.id && setPerson(u),
    onQuote: setReplyTo, onForward: setForward, onToggle: toggle, onJump: (mid) => { setSearch(null); setTimeout(() => jumpTo(mid), 50); },
  };

  return (
    <>
      <section className={`relative min-w-0 flex-1 flex-col ${threadId ? 'hidden lg:flex' : 'flex'}`}
        onDragOver={(e) => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); setDragging(true); } }}
        onDragLeave={(e) => { if (e.currentTarget === e.target) setDragging(false); }}
        onDrop={(e) => { e.preventDefault(); setDragging(false); const f = Array.from(e.dataTransfer.files); if (f.length) setDropped(f); }}>
        {dragging && <div className="pointer-events-none absolute inset-3 z-20 grid place-items-center rounded-3xl border-2 border-dashed border-primary bg-background/80 backdrop-blur"><p className="flex items-center gap-2 font-medium"><ImagePlus className="h-5 w-5 text-primary" /> Drop to attach</p></div>}
        <header className="flex h-16 shrink-0 items-center gap-2 border-b border-border px-3 sm:px-5">
          <Link to="/app" className="grid h-9 w-9 place-items-center rounded-full hover:bg-secondary md:hidden" aria-label="Back"><ArrowLeft className="h-5 w-5" /></Link>
          {search !== null ? (
            <label className="flex h-10 flex-1 items-center gap-2 rounded-xl bg-secondary px-3">
              <Search className="h-4 w-4 text-muted-foreground" />
              <input autoFocus value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search in this chat" className="w-full bg-transparent text-sm outline-none" />
              {search.length >= 2 && <span className="shrink-0 text-xs text-muted-foreground">{shown.length} found</span>}
              <button onClick={() => setSearch(null)} aria-label="Close search"><X className="h-4 w-4" /></button>
            </label>
          ) : (
            <button onClick={() => (conv?.isGroup ? setInfo(true) : others[0] && setPerson(others[0].id))} className="flex min-w-0 flex-1 items-center gap-3 text-left">
              {conv && <ConvAvatar c={conv} size={38} />}
              <div className="min-w-0"><p className="truncate font-semibold">{conv ? titleOf(conv) : ' '}</p><p className="truncate text-xs text-muted-foreground">{data?.typing.length ? <span className="text-primary">typing…</span> : status}</p></div>
            </button>
          )}
          {search === null && <button onClick={() => setSearch('')} className="grid h-9 w-9 place-items-center rounded-full hover:bg-secondary" aria-label="Search in chat" title="Search (Ctrl+F)"><Search className="h-[18px] w-[18px]" /></button>}
          {conv && (
            <DropdownMenu>
              <DropdownMenuTrigger className="grid h-9 w-9 place-items-center rounded-full hover:bg-secondary" aria-label="Conversation options"><MoreHorizontal className="h-5 w-5" /></DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setInfo(true)}><Info className="mr-2 h-4 w-4" /> {conv.communityId ? 'Channel info' : conv.isGroup ? 'Group info' : 'Media & pinned'}</DropdownMenuItem>
                {conv.communityId && <DropdownMenuItem asChild><Link to={`/app/community/${conv.communityId}`}><Settings2 className="mr-2 h-4 w-4" /> Community settings</Link></DropdownMenuItem>}
                <DropdownMenuItem onClick={() => flag('pin')}>{conv.pinned ? <PinOff className="mr-2 h-4 w-4" /> : <Pin className="mr-2 h-4 w-4" />}{conv.pinned ? 'Unpin chat' : 'Pin chat to top'}</DropdownMenuItem>
                <DropdownMenuItem onClick={() => flag('mute')}>{conv.muted ? <Bell className="mr-2 h-4 w-4" /> : <BellOff className="mr-2 h-4 w-4" />}{conv.muted ? 'Unmute' : 'Mute'}</DropdownMenuItem>
                <DropdownMenuItem onClick={() => flag('archive')}>{conv.archived ? <ArchiveRestore className="mr-2 h-4 w-4" /> : <Archive className="mr-2 h-4 w-4" />}{conv.archived ? 'Unarchive' : 'Archive'}</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </header>
        {pin && !search && (
          <button onClick={() => { jumpTo(pin.id); setPinIdx((i) => i + 1); }} className="flex shrink-0 items-center gap-3 border-b border-border bg-secondary/40 px-4 py-2 text-left sm:px-6">
            <Pin className="h-4 w-4 shrink-0 text-primary" />
            <div className="min-w-0 flex-1"><p className="text-[11px] font-medium text-primary">Pinned message{pinned.length > 1 && ` ${(pinIdx % pinned.length) + 1} of ${pinned.length}`}</p><p className="truncate text-sm"><RichText text={pin.body || 'Attachment'} /></p></div>
          </button>
        )}
        <div ref={scroller} className="flex-1 overflow-y-auto px-3 pb-5 sm:px-6">
          {!data ? <div className="grid h-full place-items-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div> : (
            <>
              {messages.length === 0 && <p className="py-20 text-center text-muted-foreground">{conv?.communityId ? `This is the start of ${conv ? titleOf(conv) : 'the channel'}.` : 'Say hello 👋'}</p>}
              {search && search.length >= 2 && !shown.length && <p className="py-20 text-center text-muted-foreground">No messages match “{search}”.</p>}
              <MessageList messages={shown} isGroup={!!conv?.isGroup} receiptId={myLast?.id} scroller={scroller} highlight={search ?? undefined} unreadAfter={firstUnreadAt}
                receipt={myLast ? receiptFor(myLast.sentAt, data.reads, conv?.isGroup) : undefined} actions={actions}
                seenBy={(m) => (m.senderId === me.id && conv?.isGroup ? readersOf(m.sentAt, data.reads) : undefined)} />
              <Typing ids={data.typing} />
            </>
          )}
        </div>
        {conv?.communityId && cs && <ChannelBar key={conv.communityId} cs={cs} slowmode={chs?.slowmode ?? 0} communityId={conv.communityId} />}
        {locked ? <p className="border-t border-border px-4 py-4 text-center text-sm text-muted-foreground">📣 This is an announcement channel — only some roles can post here.</p> :
        <Composer key={id} draftKey={id} typingKey={id} onSend={(d) => send(d)} replyTo={replyTo} onCancelReply={() => setReplyTo(null)} dropped={dropped}
          mentionable={conv?.isGroup ? others : []} placeholder={conv ? `Message ${titleOf(conv)}` : 'Message'} />}
      </section>
      {threadId && conv && <ThreadPanel key={threadId} conversationId={id} parentId={threadId} isGroup={conv.isGroup} onClose={() => setParams({})} onPerson={actions.onPerson} mentionable={conv.isGroup ? others : []} />}
      {conv && <InfoSheet open={info} onOpenChange={setInfo} conv={conv} onPerson={(u) => setPerson(u)} onJump={(mid) => { setInfo(false); setTimeout(() => jumpTo(mid), 300); }} />}
      <PersonDialog userId={person} onClose={() => setPerson(null)} />
      <ForwardDialog message={forward} onClose={() => setForward(null)} send={send} />
    </>
  );
}
