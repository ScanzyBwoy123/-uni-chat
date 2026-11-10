# u n i chat — starter

This is the visual starter for the private two-person messaging app.

## Current status
- Responsive mobile-first interface
- Chat preview with sample messages only
- PWA manifest and service-worker foundation
- No authentication or real message storage is connected yet

## Next implementation steps
1. Add the two approved email addresses to Supabase Auth allow-list logic.
2. Create the profiles, conversations, messages, device subscriptions and presence tables.
3. Enable Row Level Security on every exposed table.
4. Add message ownership rules, including Delete for Me and Delete for Everyone.
5. Connect Supabase Realtime.
6. Add Storage policies for private photo and voice uploads.
7. Configure push notifications with VAPID keys stored only on the server.
8. Test on both Android phones.

## Security
Do not add a service-role or secret key to `app.js`. The browser will use only the Supabase publishable key. Server-only secrets belong in Supabase Edge Function secrets.

The sample chat is not a working messaging service yet.
