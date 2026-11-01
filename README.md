# PUC Center Manager

PUC Center Manager manages customers, vehicles, PUC expiry dates, reports, and Gujarati WhatsApp reminders. Customer, reminder, activity, and center settings data is stored in Supabase PostgreSQL so it is available after a refresh and on other devices.

The website opens with a simple 4-digit PIN screen. The PIN is verified **server-side** by a Supabase Edge Function — the website's code contains neither the PIN nor the Supabase account password. After unlocking, the browser uses Supabase's public/anonymous key with the signed-in user's session. Row Level Security and an administrator-managed user allow-list protect the data. **Never put a Supabase `service_role` or secret key — or the PIN — in this app.**

## What the app supports

- Open the dashboard with a 4-digit PIN; a **Lock** button (header) returns to the PIN screen.

- Add, edit, delete, search, filter, sort, export, and report on customers.
- Import `.xlsx`, `.xls`, and `.csv` files with column matching, validation, a preview, duplicate detection, and a database-save report.
- Calculate and track the 30-day, 15-day, and 7-day reminders.
- Create the existing Gujarati messages and open WhatsApp click-to-chat links. The owner still presses Send in WhatsApp; the app never sends automatically.
- Keep reminder history, center settings, and activity in Supabase.
- Offer a one-time migration of older localStorage data. Local browser data is not deleted by migration.

## Setup on Windows with VS Code

### 1. Create a Supabase project

1. Go to [supabase.com](https://supabase.com), sign in, and create a project for your PUC center.
2. Save the database password somewhere private. Wait until the project says it is ready.
3. Open **SQL Editor** in the Supabase dashboard, choose **New query**, and run the contents of [`supabase/schema.sql`](./supabase/schema.sql). This creates the tables, access policies, duplicate protection, and database save functions. (Already created the project earlier? Run [`supabase/migrations/20261101120000_import_batches.sql`](./supabase/migrations/20261101120000_import_batches.sql) instead — it adds the Import History feature on top of an existing database. Both files are safe to re-run.)

### 2. Create and authorize the app account

The PIN unlock service signs in to one Supabase account behind the scenes — you never type an email or password in the website.

1. In Supabase, open **Authentication → Users** and add an account with an email and a strong password (this is the account the unlock service will use; treat the password like a secret). Make sure the user is confirmed (the dashboard's add-user form has an **Auto Confirm** option).
2. Open that user and copy the user's UUID (the ID, not the email).
3. Open **SQL Editor → New query** and run the following, replacing the example UUID with your user's UUID:

   ```sql
   insert into public.puc_authorized_users (user_id)
   values ('00000000-0000-0000-0000-000000000000');
   ```

4. In **Authentication → Providers / Sign-in methods**, keep Email enabled and turn off public sign-ups (sometimes called **Allow new users to sign up**). Only create or invite accounts you intend to authorize. To add another authorized device user later, create their Supabase account and insert their UUID into the same allow-list table.

The app's database policies only allow accounts in `puc_authorized_users` to read or change the shared records for this single PUC center. All approved staff accounts see the same center data. If two devices change data at the same time, the older copy is rejected instead of overwriting newer changes; refresh that device and repeat the change. No service-role key is used in the website.

### 3. Add the public Supabase keys to the project

1. In VS Code, open the project folder.
2. In the project root (next to `package.json`), create a file named `.env`. You can copy [`.env.example`](./.env.example) and rename the copy to `.env`.
3. In Supabase, open **Project Settings → API**. Copy the **Project URL** and the **anon/public** key (or the newer **publishable** key). Do not copy a `service_role` or secret key.
4. Put your values into `.env`, without quotes:

   ```text
   VITE_SUPABASE_URL=https://your-project-id.supabase.co
   VITE_SUPABASE_ANON_KEY=your-public-anon-or-publishable-key
   ```

5. In VS Code, open **Terminal → New Terminal** and run:

   ```powershell
   npm install
   npm run dev
   ```

6. Open the local address Vite prints, usually `http://localhost:5173`. After you complete the PIN setup in the next step, enter your PIN to open the dashboard.

Vite reads `.env` only when it starts. Stop it with **Ctrl+C** and run `npm run dev` again after changing the file. Do not send `.env` to anyone or commit it to Git.

### 4. Set up the 4-digit PIN unlock

The PIN is checked by a Supabase Edge Function (`supabase/functions/puc-unlock`). The PIN hash and the account password are stored only in Edge Function secrets — they are never part of the website code. This step is **required**: without it the PIN screen shows "The unlock service is not deployed yet."

1. Generate a PIN verifier. The PIN itself is never stored or printed:

   ```powershell
   npm run pin:hash
   ```

   Enter your chosen 4 digits when asked. Keep the PIN private — anyone who knows it can unlock the app. To change the PIN later, run this again and update the `PIN_VERIFIER` secret (no redeploy needed).

2. Sign in to the Supabase CLI (already installed as a dev dependency; requires Node.js 20+):

   ```powershell
   npx supabase login
   ```

   A browser window opens — approve it, or paste a personal access token from [supabase.com/dashboard/account/tokens](https://supabase.com/dashboard/account/tokens).

3. Link this folder to your project. Your project ref is in the dashboard URL: `https://supabase.com/dashboard/project/<PROJECT_REF>`:

   ```powershell
   npx supabase link --project-ref <PROJECT_REF>
   ```

   If it asks for the database password, press Enter to skip.

4. Add the three secrets — pick **one** method:

   - **Dashboard (easiest):** open [Edge Function Secrets](https://supabase.com/dashboard/project/_/functions/secrets) and add:

     | Key | Value |
     | --- | --- |
     | `PIN_VERIFIER` | the value printed by `npm run pin:hash` |
     | `APP_EMAIL` | the authorized account email from step 2 |
     | `APP_PASSWORD` | that account's password |

   - **CLI:**

     ```powershell
     npx supabase secrets set PIN_VERIFIER=your-value-here APP_EMAIL=you@example.com APP_PASSWORD=your-password
     ```

5. Deploy the unlock function:

   ```powershell
   npx supabase functions deploy puc-unlock
   ```

   The `verify_jwt = false` setting in [`supabase/config.toml`](./supabase/config.toml) lets the PIN screen call it before sign-in; the function enforces the PIN itself.

6. Restart `npm run dev` and unlock with your PIN. The dashboard should open.

#### How the PIN works — and its honest limits

- **Verified server-side:** the browser sends the PIN to the Edge Function over HTTPS; it is checked there against a salted PBKDF2 hash. The website's JavaScript contains no PIN, no hash, no email and no password — viewing the page source reveals nothing useful.
- **Database stays protected:** on a correct PIN the function exchanges the account credentials (kept only in Edge Function secrets) for a normal Supabase Auth session. All data access still passes Row Level Security and the `puc_authorized_users` allow-list exactly as before. No service-role key ever reaches the browser.
- **Guessing is slowed:** wrong PINs get progressively slower, and after 8 wrong attempts the function locks out for 5 minutes (best effort — the counter lives on the server instance and resets if the instance restarts).
- **Limits to be aware of:** a 4-digit PIN is a convenient family gate, not strong security. Anyone who knows the PIN can unlock the app. A device that is already unlocked (or still signed in) stays open until you press **Lock**. Anyone with access to your Supabase account can read the secrets — protect that account with a strong password and two-factor authentication.

### 5. Migrate old browser data

If this browser has customer records from the old version, after unlocking the app shows **Migrate existing data**. Choose it to copy local customers, reminder history, activity, and (where appropriate) settings to Supabase. Customers with an already-saved vehicle number are skipped, not duplicated. The old localStorage data is retained as a fallback; the app does not clear it.

For safety, check the migration result and the customer list before clearing browser data or removing any backup files. You can also download a JSON backup from **Settings → Data**.

### 6. Deploy or update the Vercel site

1. Push the updated project to the Git repository connected to Vercel, or import that repository into Vercel.
2. In Vercel, open the project **Settings → Environment Variables**.
3. Add these two variables for **Production** (and Preview too, if you use preview deployments):
   - `VITE_SUPABASE_URL` — the Supabase Project URL.
   - `VITE_SUPABASE_ANON_KEY` — the Supabase anon/public or publishable key.
4. Save the values and open **Deployments**. Redeploy the latest deployment so Vite builds with the new variables. (No new variables are needed for the PIN — the unlock function runs on Supabase, not Vercel.)
5. In Supabase, open **Authentication → URL Configuration**. Set the Site URL to `https://puc-center.vercel.app` and add that address to the allowed redirect URLs. Also add your localhost URL if you unlock during local development.
6. Open the deployed site and unlock it with your PIN. Add a test customer, refresh the page, then check that it is still listed. Unlock from another authorized device to check cloud access.

Vercel environment values are applied at build time. Redeploy after editing them. `.env` is for local development; Vercel's Environment Variables are for hosted builds.

## Importing customers

1. Open **Import Customers** and select an Excel or CSV file.
2. Check the detected columns, preview the records, and correct any invalid rows in the spreadsheet.
3. Choose whether duplicate vehicle numbers should be skipped or update the existing customer.
4. Confirm the import. The app only reports a successful import after Supabase accepts the save. If the connection or database fails, the import is not applied in the app and an error is displayed; correct the issue and retry.

Vehicle numbers are normalized before duplicate checks, and the database enforces uniqueness per authorized account as a final safeguard. Uploading the same file again will not create duplicate vehicles.

### Import History and deleting an import

Every confirmed import is recorded in **Import History** (sidebar → Customers → Import History) with the file name, date/time, total rows, imported count and duplicate-skipped count.

1. Open **Import History** and press **Delete Imported Data** on an import.
2. The confirmation dialog shows the file name and exactly how many customer records will be deleted.
3. Confirm to remove **only the customer records that import created**. Manually added customers, older data, and vehicles that already existed before the import (skipped duplicates) are never deleted.
4. If a record from the import was edited afterwards, it is kept by default; the dialog warns you and only deletes edited records when you explicitly tick the box. Linked reminder history is kept for audit (pending reminders of deleted customers are cancelled automatically).

Deletion runs through a database function with Row Level Security: it can only reach the customer ids belonging to that import batch.

## WhatsApp reminders

The app continues to prepare 30-, 15-, and 7-day reminder messages using the existing Gujarati templates. Open a reminder, review the message, choose **Open WhatsApp**, and press **Send** yourself in WhatsApp. Then return to the app and mark it as sent. WhatsApp delivery is not verified by the app.

## Troubleshooting

- **Supabase setup screen:** confirm `.env` is in the project root and contains both values, then restart Vite.
- **"The unlock service is not deployed yet":** run step 4.5 above — `npx supabase functions deploy puc-unlock` — after `npx supabase login` and `npx supabase link`.
- **"Incorrect PIN":** check the PIN you chose in `npm run pin:hash`. If needed, generate a new verifier and update the `PIN_VERIFIER` secret (readings take effect immediately, no redeploy).
- **"Too many attempts":** wait for the stated time, then try again.
- **"The unlock service could not open a session":** check the `APP_EMAIL` / `APP_PASSWORD` secrets match the authorized account, and that the user is confirmed in Supabase Authentication.
- **Could not connect / database save failed:** check internet access, the project URL/key, the SQL setup, and Supabase project status. Failed changes are not shown as saved.
- **Account not authorized:** add that account's user UUID to `public.puc_authorized_users`.
- **Vercel still shows the setup screen:** add both Vercel environment variables and redeploy.
- **Duplicate vehicle error:** refresh the page to load the latest cloud data, then choose skip or update during import.

## Run tests and build

```powershell
npm test
npm run build
```
