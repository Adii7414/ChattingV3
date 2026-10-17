import { z } from 'zod';
import { createEndpoint, ZiteError } from 'zitejs/backend';
import { zite } from 'zitejs/db';
import { ids, requireMember } from '../server/chat';
import { loadCommunity } from '../server/community';
import { parseChannel, permsOf } from '../lib/community';

const reject = (msg: string) => { const e = new ZiteError(msg); e.userFacingMessage = msg; return e; };

/** Announcement channels, slow mode and auto-moderation for community channels. */
async function enforceRules(communityId: string, rawChannel: unknown, cid: string, me: string, body: string) {
  const { s, ownerId } = await loadCommunity(communityId);
  const ch = parseChannel(rawChannel);
  const perms = permsOf(s, ownerId, me);
  if (ch.announcement && !perms.has('postAnnouncements')) throw reject('Only certain roles can post in this announcement channel.');
  if (/@everyone\b/i.test(body) && !perms.has('mentionEveryone')) throw reject('You don’t have permission to use @everyone here.');
  if (perms.has('bypassSlowmode')) return;
  if (body.length > s.maxLength) throw reject(`Messages here can be at most ${s.maxLength} characters.`);
  if (s.blockLinks && /(https?:\/\/|www\.)\S+/i.test(body)) throw reject('Links aren’t allowed in this community.');
  const lower = body.toLowerCase();
  if (s.bannedWords.some((w) => w && lower.includes(w))) throw reject('Your message contains a word this community has blocked.');
  if (ch.slowmode > 0) {
    const r = await zite.sql({
      query: `SELECT MAX(m.created_at) AS last FROM "Messages" m JOIN "ConversationsMessages" l ON l."messagesId" = m.id
              WHERE l."conversationsId" = $1::uuid AND m."sender"->>0 = $2`,
      params: [cid, me],
    });
    const last = r.rows[0]?.last ? new Date(String(r.rows[0].last)).getTime() : 0;
    const wait = Math.ceil((last + ch.slowmode * 1000 - Date.now()) / 1000);
    if (wait > 0) throw reject(`Slow mode is on — you can send again in ${wait}s.`);
  }
}

export default createEndpoint({
  description: 'Sends a message (with optional files), optionally as a thread reply or a quoted reply',
  authenticated: true,
  inputSchema: z.object({
    conversationId: z.string(),
    body: z.string().max(5000),
    attachments: z.array(z.object({ url: z.string(), filename: z.string() })).max(10).optional(),
    parentMessageId: z.string().optional(),
    replyToId: z.string().optional(),
  }),
  outputSchema: z.object({ id: z.string(), sentAt: z.string() }),
  execute: async ({ input, context }) => {
    const body = input.body.trim();
    const files = input.attachments ?? [];
    if (!body && !files.length) throw new ZiteError('Empty message');
    const me = context.user.id;
    const cid = input.conversationId;

    // Access checks run together instead of one after another.
    const [conv] = await Promise.all([
      requireMember(cid, me),
      input.parentMessageId && zite.messages.findOne({ id: input.parentMessageId }).then((p) => {
        if (!p || !ids(p.conversation).includes(cid)) throw new ZiteError('Thread not found');
      }),
    ]);
    if (conv.communityId) await enforceRules(conv.communityId, conv.settings, cid, me, body);

    const now = new Date().toISOString();
    const who = context.user.firstName || context.user.email.split('@')[0];
    const what = body || `sent ${files.length > 1 ? `${files.length} files` : 'a file'}`;
    const preview = (input.parentMessageId ? `${who} replied in a thread: ${what}` : body ? `${who}: ${body}` : `${who} ${what}`).slice(0, 140);

    // The message, the conversation's preview, the sender's read marker and clearing "typing…" all write in parallel.
    const [msg] = await Promise.all([
      zite.messages.create({
        record: {
          body, conversation: cid, sender: me, attachments: files.length ? files : null, reactions: null,
          parentMessageId: input.parentMessageId ?? null, replyToId: input.replyToId ?? null, editedAt: null,
        } as never,
      }),
      zite.conversations.update({ id: cid, record: { lastMessageAt: now, lastMessagePreview: preview, archivedBy: [] } as never }),
      input.parentMessageId ? null : zite.readReceipts.bulkCreate({
        records: [{ key: `${cid}:${me}`, conversation: cid, reader: me, lastReadAt: now }], matchOn: ['key'],
      }),
      zite.presence.bulkCreate({ records: [{ userKey: me, person: me, lastSeenAt: now, typingIn: null, typingAt: null } as never], matchOn: ['userKey'] }),
    ]);
    return { id: msg.id, sentAt: now };
  },
});
