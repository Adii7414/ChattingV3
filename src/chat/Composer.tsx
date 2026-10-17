import { useEffect, useRef, useState } from 'react';
import { ArrowUp, FileText, Loader2, Paperclip, Smile, X } from 'lucide-react';
import { toast } from 'sonner';
import { useUpload } from 'zitejs/upload';
import { setTyping } from 'zitejs/api';
import { Popover, PopoverContent, PopoverTrigger } from '@project/components/ui/popover';
import PersonAvatar from './Avatars';
import type { Draft, Msg } from './messages';
import { useChat, type Person } from './store';
export type { Draft };

const EMOJIS = '😀 😂 🥹 😊 😍 🥰 😘 😎 🤩 🥳 😇 🙂 😉 😌 🤔 🤨 😐 🙄 😏 😴 😮 😢 😭 😤 😡 🤯 😱 🤗 🤭 🫡 👍 👎 👏 🙌 🙏 💪 👋 🤝 ✌️ 🤞 👀 ❤️ 🧡 💛 💚 💙 💜 🖤 💔 ✨ 🔥 💯 🎉 🎂 🎁 ☕ 🍕 🍜 🌮 🌴 ☀️ 🌙 ⭐ 🌈 ⚡ 🚀 ✅ ❌ ⚠️ 📌 📎 💡 🎧 📷 🎮 ⚽ 🏆'.split(' ');

type Props = {
  onSend: (d: Draft) => void; placeholder?: string; autoFocus?: boolean; draftKey: string; typingKey: string;
  replyTo?: Msg | null; onCancelReply?: () => void; dropped?: File[] | null; mentionable?: Person[];
};

export default function Composer({ onSend, placeholder = 'Message', autoFocus, draftKey, typingKey, replyTo, onCancelReply, dropped, mentionable = [] }: Props) {
  const { profile, people, me } = useChat();
  const enterSends = profile?.enterToSend ?? true;
  const [body, setBody] = useState(() => localStorage.getItem(`draft:${draftKey}`) ?? '');
  const [files, setFiles] = useState<Draft['files']>([]);
  const [mention, setMention] = useState<string | null>(null);
  const { upload, isUploading } = useUpload();
  const input = useRef<HTMLInputElement>(null);
  const text = useRef<HTMLTextAreaElement>(null);
  const sending = useRef(false);
  const lastTyping = useRef(0);
  const can = (body.trim() || files.length) && !isUploading;

  useEffect(() => { body ? localStorage.setItem(`draft:${draftKey}`, body) : localStorage.removeItem(`draft:${draftKey}`); }, [body, draftKey]);
  useEffect(() => { if (replyTo) text.current?.focus(); }, [replyTo]);
  useEffect(() => { if (dropped?.length) addFiles(dropped); }, [dropped]); // eslint-disable-line react-hooks/exhaustive-deps

  const addFiles = async (list: File[]) => {
    for (const f of list.slice(0, 10 - files.length)) {
      try { const { url } = await upload(f); setFiles((s) => [...s, { url, filename: f.name || 'pasted-image.png', mimeType: f.type }]); }
      catch { toast.error(`Couldn’t upload ${f.name || 'that file'}`); }
    }
    if (input.current) input.current.value = '';
  };
  const change = (v: string) => {
    setBody(v);
    const m = /(?:^|\s)@([\w.-]*)$/.exec(v.slice(0, text.current?.selectionStart ?? v.length));
    setMention(m ? m[1].toLowerCase() : null);
    if (v && Date.now() - lastTyping.current > 3000) { lastTyping.current = Date.now(); setTyping({ where: typingKey }).catch(() => {}); }
  };
  const insert = (s: string) => {
    const el = text.current; const at = el?.selectionStart ?? body.length;
    setBody(body.slice(0, at) + s + body.slice(at));
    requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(at + s.length, at + s.length); });
  };
  const pickMention = (p: Person) => {
    const at = text.current?.selectionStart ?? body.length;
    const before = body.slice(0, at).replace(/@[\w.-]*$/, `@${p.name.split(' ')[0]} `);
    setBody(before + body.slice(at)); setMention(null); text.current?.focus();
  };
  const submit = () => {
    if (!can || sending.current) return;
    sending.current = true;
    setTimeout(() => { sending.current = false; }, 300);
    onSend({ body: body.trim(), files, replyTo });
    setBody(''); setFiles([]); onCancelReply?.(); lastTyping.current = 0;
  };
  const matches = mention === null ? [] : mentionable.filter((p) => p.id !== me.id && p.name.toLowerCase().includes(mention)).slice(0, 6);

  return (
    <div className="relative shrink-0 border-t border-border px-3 pb-[max(env(safe-area-inset-bottom),12px)] pt-3 sm:px-6">
      <div className="mx-auto max-w-3xl">
        {matches.length > 0 && (
          <div className="absolute bottom-full left-3 right-3 mx-auto mb-2 max-w-sm overflow-hidden rounded-2xl border border-border bg-popover p-1 shadow-lg sm:left-6">
            {matches.map((p) => <button key={p.id} onMouseDown={(e) => { e.preventDefault(); pickMention(p); }} className="flex w-full items-center gap-2 rounded-xl px-2 py-1.5 text-left text-sm hover:bg-secondary"><PersonAvatar name={p.name} image={p.image} size={24} />{p.name}</button>)}
          </div>
        )}
        {replyTo && (
          <div className="mb-2 flex items-center gap-3 rounded-2xl border-l-4 border-primary bg-secondary px-3 py-2">
            <div className="min-w-0 flex-1"><p className="text-xs font-medium text-primary">Replying to {replyTo.senderId === me.id ? 'yourself' : people.get(replyTo.senderId)?.name ?? 'Someone'}</p><p className="truncate text-sm text-muted-foreground">{replyTo.body || 'Attachment'}</p></div>
            <button onClick={onCancelReply} aria-label="Cancel reply"><X className="h-4 w-4 text-muted-foreground" /></button>
          </div>
        )}
        {(files.length > 0 || isUploading) && (
          <div className="mb-2 flex flex-wrap gap-2">
            {files.map((f, i) => (
              <div key={f.url} className="relative">
                {f.mimeType.startsWith('image/') ? <img src={f.url} alt="" className="h-16 w-16 rounded-xl object-cover" />
                  : <div className="flex h-16 w-40 items-center gap-2 rounded-xl border border-border px-2 text-xs"><FileText className="h-4 w-4 shrink-0" /><span className="truncate">{f.filename}</span></div>}
                <button onClick={() => setFiles((s) => s.filter((_, j) => j !== i))} aria-label="Remove" className="absolute -right-1.5 -top-1.5 grid h-5 w-5 place-items-center rounded-full bg-foreground text-background"><X className="h-3 w-3" /></button>
              </div>
            ))}
            {isUploading && <div className="grid h-16 w-16 place-items-center rounded-xl bg-secondary"><Loader2 className="h-4 w-4 animate-spin" /></div>}
          </div>
        )}
        <div className="flex items-end gap-1.5">
          <input ref={input} type="file" multiple hidden onChange={(e) => addFiles(Array.from(e.target.files ?? []))} />
          <button onClick={() => input.current?.click()} disabled={isUploading || files.length >= 10} aria-label="Attach" title="Attach files" className="focus-ring grid h-10 w-10 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-secondary disabled:opacity-40"><Paperclip className="h-5 w-5" /></button>
          <div className="relative flex-1">
            <textarea ref={text} value={body} onChange={(e) => change(e.target.value)} rows={1} maxLength={5000} placeholder={placeholder} autoFocus={autoFocus}
              onPaste={(e) => { const imgs = Array.from(e.clipboardData.files).filter((f) => f.type.startsWith('image/')); if (imgs.length) { e.preventDefault(); addFiles(imgs); } }}
              onKeyDown={(e) => {
                if (e.key === 'Escape' && replyTo) onCancelReply?.();
                if (e.key === 'Tab' && matches[0]) { e.preventDefault(); pickMention(matches[0]); }
                if (e.key !== 'Enter' || e.nativeEvent.isComposing || e.repeat) return;
                if (matches[0]) { e.preventDefault(); pickMention(matches[0]); return; }
                if (enterSends ? !e.shiftKey : e.metaKey || e.ctrlKey) { e.preventDefault(); submit(); }
              }}
              className="block max-h-40 min-h-10 w-full resize-none rounded-[20px] border border-input bg-background py-2 pl-4 pr-10 text-[15px] outline-none [field-sizing:content] focus:ring-2 focus:ring-ring" />
            <Popover>
              <PopoverTrigger aria-label="Emoji" title="Emoji" className="absolute bottom-1 right-1 grid h-8 w-8 place-items-center rounded-full text-muted-foreground hover:bg-secondary"><Smile className="h-5 w-5" /></PopoverTrigger>
              <PopoverContent side="top" align="end" className="grid w-72 grid-cols-8 gap-0.5 p-2">
                {EMOJIS.map((e) => <button key={e} onClick={() => insert(e)} className="grid h-8 w-8 place-items-center rounded-lg text-xl hover:bg-secondary">{e}</button>)}
              </PopoverContent>
            </Popover>
          </div>
          <button onClick={submit} disabled={!can} aria-label="Send" className="focus-ring grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground transition active:scale-90 disabled:opacity-30"><ArrowUp className="h-5 w-5" /></button>
        </div>
        <p className="mt-1.5 hidden text-center text-[11px] text-muted-foreground sm:block">**bold** · _italic_ · `code` · @mention · paste or drop images</p>
      </div>
    </div>
  );
}
