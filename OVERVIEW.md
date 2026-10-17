# Chatting

Chatting is a messaging product for friends, groups, teams and communities. The site has three parts:

- **Landing page** (`/`) — a polished, Apple-style public page. Its main button reads "Get Chatting" for visitors and "Open Chatting" for people who are already signed in.
- **The chat app** (`/app`) — behind email sign-in. It has direct messages and custom groups (with a name, emoji, description, admins and member management), threaded replies, communities with channels (public ones can be found in Discover, private ones are joined by invite link), reactions, message editing and deleting, photos and files, pin and mute, presence, read receipts, search, and a full profile and privacy settings page.
- **Legal pages** (`/privacy`, `/terms`) — written to match the data the app actually stores.

## Live delivery & communities (latest)
- Messages, reactions, read receipts and "typing…" arrive live: the app keeps a waiting connection open that answers the moment anything changes.
- Communities are deeply customisable from their settings page (`/app/community/:id`): icon, banner, accent colour, tagline, tags, custom invite link, quick reactions, categories and channel order, channel emoji/topic/slow mode/announcement/private-to-roles, custom roles with colours and 9 permissions, nicknames, join modes (open / approval / invite-only) with requests, kick/ban/unban, blocked words, link blocking, max message length, welcome messages, rules members must accept, ownership transfer and an audit log.
