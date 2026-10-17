import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import { zite } from 'zitejs/db';

const profile = z.object({
  name: z.string(), firstName: z.string(), lastName: z.string(), image: z.string().nullable(),
  bio: z.string(), statusText: z.string(), statusEmoji: z.string(), pronouns: z.string(),
  showOnlineStatus: z.boolean(), sendReadReceipts: z.boolean(), enterToSend: z.boolean(),
});

export default createEndpoint({
  description: 'Reads or updates the signed-in user’s profile and privacy settings',
  authenticated: true,
  inputSchema: z.object({ update: profile.partial().optional() }),
  outputSchema: profile,
  execute: async ({ input, context }) => {
    const me = context.user.id;
    const u = input.update;
    if (u) {
      if (u.firstName !== undefined || u.lastName !== undefined || u.image !== undefined) {
        const first = (u.firstName ?? context.user.firstName ?? '').trim();
        const last = (u.lastName ?? context.user.lastName ?? '').trim();
        await zite.auth.updateUserProfile(me, {
          ...(u.firstName !== undefined || u.lastName !== undefined ? { firstName: first, lastName: last } : {}),
          ...(u.image !== undefined ? { image: u.image } : {}),
        } as never);
      }
      const rec: Record<string, unknown> = { userKey: me, person: me };
      for (const k of ['bio', 'statusText', 'statusEmoji', 'pronouns', 'showOnlineStatus', 'sendReadReceipts', 'enterToSend'] as const) {
        if (u[k] !== undefined) rec[k] = typeof u[k] === 'string' ? (u[k] as string).slice(0, 500) : u[k];
      }
      await zite.profiles.bulkCreate({ records: [rec as never], matchOn: ['userKey'] });
    }
    const [p, users] = await Promise.all([
      zite.profiles.findOne({ filters: { userKey: me } }),
      zite.sql({ query: `SELECT "name", "image" FROM "ziteUsers" WHERE id::text = $1`, params: [me] }),
    ]);
    const row = users.rows[0] ?? {};
    const first = u?.firstName ?? context.user.firstName ?? '';
    const last = u?.lastName ?? context.user.lastName ?? '';
    return {
      name: String(row.name || [first, last].filter(Boolean).join(' ') || context.user.email.split('@')[0]),
      firstName: first, lastName: last,
      image: row.image ? String(row.image) : null,
      bio: p?.bio ?? '', statusText: p?.statusText ?? '', statusEmoji: p?.statusEmoji ?? '', pronouns: p?.pronouns ?? '',
      showOnlineStatus: p?.showOnlineStatus ?? true, sendReadReceipts: p?.sendReadReceipts ?? true, enterToSend: p?.enterToSend ?? true,
    };
  },
});
