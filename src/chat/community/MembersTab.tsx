import { useState } from 'react';
import { Crown, MoreHorizontal, Search } from 'lucide-react';
import { configureCommunity } from 'zitejs/api';
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@project/components/ui/dropdown-menu';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogTitle } from '@project/components/ui/alert-dialog';
import PersonAvatar from '../Avatars';
import { useChat } from '../store';
import { topRole } from '../../lib/community';
import { input, Section, useRun, type TabProps } from './kit';

type Act = { kind: 'kick' | 'ban' | 'transfer'; id: string; name: string } | null;

export default function MembersTab({ d, reload }: TabProps) {
  const { me } = useChat();
  const [q, setQ] = useState('');
  const [nick, setNick] = useState<{ id: string; v: string } | null>(null);
  const [act, setAct] = useState<Act>(null);
  const { run } = useRun(reload);
  const has = (p: string) => (d.myPerms as string[]).includes(p);
  const cid = d.id;
  const list = d.members.filter((m) => !q || `${m.name} ${m.email} ${d.s.nicknames[m.id] ?? ''}`.toLowerCase().includes(q.toLowerCase()));
  const hoisted = d.s.roles.filter((r) => r.hoist);
  const groups = [...hoisted.map((r) => ({ key: r.id, label: r.name, color: r.color, people: list.filter((m) => topRole({ ...d.s, roles: hoisted }, m.id)?.id === r.id) })),
    { key: 'rest', label: 'Members', color: undefined, people: list.filter((m) => !topRole({ ...d.s, roles: hoisted }, m.id)) }];
  const setRoles = (uid: string, roleIds: string[]) => run('a', () => configureCommunity({ communityId: cid, action: 'assignRoles', userId: uid, roleIds }), 'Roles updated');

  return (
    <Section title={`Members · ${d.members.length}`} desc="Give roles, set nicknames, or remove people.">
      <label className="flex h-10 items-center gap-2 rounded-xl bg-secondary px-3"><Search className="h-4 w-4 text-muted-foreground" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search members" className="w-full bg-transparent text-sm outline-none" /></label>
      {groups.map((g) => g.people.length > 0 && (
        <div key={g.key}>
          <p className="px-1 pb-1 pt-2 text-xs font-semibold uppercase tracking-wide" style={{ color: g.color }}>{g.label} — {g.people.length}</p>
          {g.people.map((m) => {
            const mine = d.s.memberRoles[m.id] ?? [];
            const role = topRole(d.s, m.id);
            const canEditNick = m.id === me.id || has('manageCommunity');
            return (
              <div key={m.id} className="flex items-center gap-3 rounded-xl px-1 py-2">
                <PersonAvatar name={m.name} image={m.image} size={36} />
                <div className="min-w-0 flex-1">
                  {nick && nick.id === m.id ? (
                    <form onSubmit={(e) => { e.preventDefault(); const v = nick.v; run('n', () => configureCommunity({ communityId: cid, action: 'nickname', userId: m.id, nickname: v }), 'Nickname saved'); setNick(null); }}>
                      <input autoFocus value={nick.v} onChange={(e) => setNick({ id: m.id, v: e.target.value })} onBlur={() => setNick(null)} maxLength={32} placeholder={m.name} className={`${input} h-8`} />
                    </form>
                  ) : (
                    <p className="flex items-center gap-1.5 truncate text-sm font-medium" style={{ color: role?.color }}>
                      {d.s.nicknames[m.id] ?? m.name}{m.id === d.ownerId && <Crown className="h-3.5 w-3.5 text-amber-500" />}
                    </p>
                  )}
                  <p className="truncate text-xs text-muted-foreground">{d.s.nicknames[m.id] ? `${m.name} · ` : ''}{mine.map((r) => d.s.roles.find((x) => x.id === r)?.name).filter(Boolean).join(', ') || m.email}</p>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger aria-label="Member options" className="grid h-8 w-8 place-items-center rounded-full hover:bg-secondary"><MoreHorizontal className="h-4 w-4" /></DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56">
                    {canEditNick && <DropdownMenuItem onClick={() => setNick({ id: m.id, v: d.s.nicknames[m.id] ?? '' })}>Set nickname</DropdownMenuItem>}
                    {has('manageRoles') && d.s.roles.length > 0 && <><DropdownMenuSeparator /><DropdownMenuLabel className="text-xs">Roles</DropdownMenuLabel>
                      {d.s.roles.map((r) => (
                        <DropdownMenuCheckboxItem key={r.id} checked={mine.includes(r.id)} onSelect={(e) => e.preventDefault()} onCheckedChange={(v) => setRoles(m.id, v ? [...mine, r.id] : mine.filter((x) => x !== r.id))}>
                          <span className="mr-2 h-2.5 w-2.5 rounded-full" style={{ background: r.color }} />{r.name}
                        </DropdownMenuCheckboxItem>
                      ))}</>}
                    {m.id !== me.id && m.id !== d.ownerId && (has('kick') || has('ban')) && <DropdownMenuSeparator />}
                    {m.id !== me.id && m.id !== d.ownerId && has('kick') && <DropdownMenuItem className="text-destructive" onClick={() => setAct({ kind: 'kick', id: m.id, name: m.name })}>Remove from community</DropdownMenuItem>}
                    {m.id !== me.id && m.id !== d.ownerId && has('ban') && <DropdownMenuItem className="text-destructive" onClick={() => setAct({ kind: 'ban', id: m.id, name: m.name })}>Ban</DropdownMenuItem>}
                    {me.id === d.ownerId && m.id !== me.id && <><DropdownMenuSeparator /><DropdownMenuItem onClick={() => setAct({ kind: 'transfer', id: m.id, name: m.name })}>Transfer ownership</DropdownMenuItem></>}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            );
          })}
        </div>
      ))}
      <AlertDialog open={!!act} onOpenChange={(o) => !o && setAct(null)}>
        <AlertDialogContent>
          <AlertDialogTitle>{act?.kind === 'transfer' ? `Make ${act.name} the owner?` : act?.kind === 'ban' ? `Ban ${act?.name}?` : `Remove ${act?.name}?`}</AlertDialogTitle>
          <AlertDialogDescription>{act?.kind === 'transfer' ? 'They’ll get full control and you’ll become a regular member.' : act?.kind === 'ban' ? 'They’ll be removed and can’t rejoin until unbanned.' : 'They’ll leave every channel. They can rejoin with an invite.'}</AlertDialogDescription>
          <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => act && run('x', () => configureCommunity({ communityId: cid, action: act.kind, userId: act.id }), 'Done')}>Confirm</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Section>
  );
}
