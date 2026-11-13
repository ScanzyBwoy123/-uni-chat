# u n i chat — complete responsive frontend rebuild

This ZIP contains the full static frontend replacement for the `ScanzyBwoy123/-uni-chat` repository. It is designed for the existing Supabase project and keeps the original repository's public browser key. It does not modify GitHub, deploy anything, change Supabase settings, or execute SQL.

## Included
- `index.html`, `styles.css`, `app.js`
- `sw.js`, `manifest.webmanifest`, `icons/icon.svg`
- `TESTING.md` and this guide

## Existing Supabase configuration
- Project URL: `https://zrgbzzxnoylevpwjavwr.supabase.co`
- Project ID: `zrgbzzxnoylevpwjavwr`
- Browser key: the existing Supabase publishable key already present in `app.js`.
- Supabase JS v2 is loaded from jsDelivr.

The frontend uses the existing schema/API names confirmed in the public repository source and the previous rebuilt implementation:

| Feature | Existing objects / fields used |
|---|---|
| Profiles | `profiles`: `id`, `display_name`, `username`, `avatar_path` |
| Conversation membership | `conversation_members`: `conversation_id`, `user_id` |
| Messages | `messages`: `id`, `conversation_id`, `sender_id`, `body`, `message_type`, `attachment_path`, `created_at`, `deleted_for_everyone` |
| Hidden messages | `message_user_hides`: `message_id`, `user_id` |
| Direct conversation | RPC `start_direct_conversation({ p_other_user_id })` |
| Status updates | `status_updates`: `id`, `user_id`, `status_type`, `text_content`, `media_path`, `background_color`, `created_at`, `expires_at` |
| Status views | `status_views`: `status_id`, `viewer_id` |
| WebRTC call records | `call_sessions`: `id`, `conversation_id`, `caller_id`, `callee_id`, `call_type`, `status`, `created_at` |
| WebRTC signalling | `call_signals`: `call_id`, `sender_id`, `recipient_id`, `signal_type`, `payload`, `created_at` |
| Storage | `profile-pictures`, `status-media`, `chat-media` |
| Push registration function | `save-push-subscription` Edge Function |
| Push delivery function | `send-push` Edge Function |

The call table/columns and signalling payload shape above are taken from the original repository's WebRTC code. The frontend assumes the corresponding Supabase tables, RLS policies and Realtime publication are already deployed and enabled. No migration is included or executed.

## Calling
- Starts audio/video calls by creating a `call_sessions` row with `status: "ringing"`.
- Exchanges WebRTC offers, answers and ICE candidates through `call_signals` and Supabase Realtime.
- Supports incoming-call prompts, accept, decline, end, microphone mute, camera toggle, and recent call history.
- Calls require HTTPS (or localhost), microphone/camera permissions, browser WebRTC support, and working Supabase RLS/Realtime configuration.
- The included ICE configuration uses public Google STUN servers. STUN-only connectivity is not guaranteed across all carrier, campus, office or restrictive NAT/firewall networks. A TURN service may be required for reliable connectivity; no TURN credentials are included.
- The app requests the existing `send-push` Edge Function with `{ call_id }` to alert the recipient of an incoming call.

## Push notifications
- Uses the VAPID public key already present in the original repository's `app.js`.
- Requests browser notification permission.
- Creates/reuses a `PushSubscription` and registers `{ endpoint, p256dh, auth }` through `save-push-subscription`.
- Requests `send-push` with `{ message_id }` for new messages and `{ call_id }` for incoming calls.
- The service worker displays push events and opens the URL supplied in the notification payload.
- The VAPID private key must remain in Supabase Edge Function secrets; it is not included in this ZIP.

The push registration and delivery Edge Functions must already exist and accept the request bodies described above. The frontend cannot create server-side push delivery by itself.

## Local installation
1. Download and extract the ZIP.
2. Serve the directory over HTTP (do not open `index.html` using `file://`):
   - `python -m http.server 8080`
   - or use VS Code Live Server.
3. Open `http://localhost:8080`.
4. Sign in with an existing account or register if Supabase Auth permits it.

## GitHub Pages deployment
1. Review and test this ZIP locally.
2. Extract the contents into the repository root in your own working copy.
3. Commit and push only after you approve the result.
4. The app uses relative asset paths for the GitHub Pages project site.

## Supabase deployment checks (no changes made by this task)
Before production use, verify in your Supabase project:
- Existing tables and columns listed above still match the app.
- RLS permits authenticated members to read/write only conversations and calls they participate in.
- `call_sessions` and `call_signals` are included in the `supabase_realtime` publication.
- The existing `save-push-subscription` and `send-push` Edge Functions are deployed and configured with their server-side secrets, including the VAPID private key.
- Storage policies permit the intended authenticated uploads/reads in `profile-pictures`, `status-media` and `chat-media`.

No database migration is required by the frontend changes if these existing objects are already present. No SQL was run.

## Known limitations
- Live Supabase integration was not exercised in this environment; actual call signalling, Edge Function responses and push delivery are not verified here.
- STUN-only WebRTC may fail on some networks; TURN is the usual reliability improvement and requires your own service/credentials.
- Browser push support varies by browser/platform. Permission must be granted and the Edge Functions must be deployed correctly.
- Call history depends on `call_sessions` read policies allowing the signed-in user to read their own caller/callee records.
- The frontend does not create or alter Supabase schema, RLS, Realtime publication, or Edge Functions.

## Security
The browser key is a publishable key and is intended for frontend use. Never add a Supabase service-role key, VAPID private key, or other server secret to this repository.
