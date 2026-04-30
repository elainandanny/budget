# Finance Tracker GitHub Version

Files:
- `index.html` - page markup and Supabase/Chart.js CDN imports
- `styles.css` - all extracted styles
- `app.js` - app logic

This version keeps the same Supabase login foundation as the uploaded gas tracker app. It uses the same Supabase project URL and anon key, but expects these finance tables in Supabase:

- `transactions`
- `income`
- `subscriptions`
- `goals`
- `settings`

Important: enable Row Level Security and create policies so each user can only access rows where `auth.uid() = user_id`.

For the `settings` table, make `user_id` unique if you want one settings row per user.

Deploy on GitHub Pages by committing these files to your repo root and enabling Pages for the branch.
