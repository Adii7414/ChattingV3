import { useEffect, useState } from 'react';
import { formatDistanceToNowStrict } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Loader2, MessageCircle } from 'lucide-react';
import { createConversation, getPerson, type GetPersonOutputType } from 'zitejs/api';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@project/components/ui/dialog';
import PersonAvatar from './Avatars';
import { useChat } from './store';

export default function PersonDialog({ userId, onClose }: { userId: string | null; onClose: () => void }) {
  const { people, refresh } = useChat();
  const navigate = useNavigate();
  const [p, setP] = useState<GetPersonOutputType['profile'] | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setP(undefined);
    if (userId) getPerson({ userId }).then((r) => setP(r.profile)).catch(() => setP(null));
  }, [userId]);
  const online = userId ? people.get(userId)?.online : false;

  const message = async () => {
    if (!userId) return;
    setBusy(true);
    try { const { id } = await createConversation({ memberIds: [userId] }); await refresh(); onClose(); navigate(`/app/c/${id}`); }
    catch { toast.error('Couldn’t open the chat'); } finally { setBusy(false); }
  };

  return (
    <Dialog open={!!userId} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-sm">
        {p === undefined ? <div className="grid h-48 place-items-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          : p === null ? <><DialogTitle>Profile unavailable</DialogTitle><DialogDescription>You can only see people you share a chat or community with.</DialogDescription></>
          : (
            <div className="flex flex-col items-center text-center">
              <PersonAvatar name={p.name} image={p.image} size={88} online={online} />
              <DialogTitle className="mt-4 text-xl tracking-tight">{p.name}</DialogTitle>
              <DialogDescription className="mt-0.5">{[p.pronouns, p.email].filter(Boolean).join(' · ')}</DialogDescription>
              {(p.statusText || p.statusEmoji) && <p className="mt-3 rounded-full bg-secondary px-3 py-1 text-sm">{p.statusEmoji} {p.statusText}</p>}
              {p.bio && <p className="mt-4 whitespace-pre-wrap text-sm">{p.bio}</p>}
              <p className="mt-4 text-xs text-muted-foreground">{online ? 'Online now' : p.lastSeenAt ? `Last seen ${formatDistanceToNowStrict(new Date(p.lastSeenAt))} ago` : 'Last seen a while ago'}</p>
              <button onClick={message} disabled={busy} className="mt-5 flex h-11 w-full items-center justify-center gap-2 rounded-full bg-foreground font-medium text-background">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageCircle className="h-4 w-4" />} Message
              </button>
            </div>
          )}
      </DialogContent>
    </Dialog>
  );
}
