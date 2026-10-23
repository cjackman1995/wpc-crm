# Sales CRM

A bare-bones, Salesforce-style CRM for a small sales team. It tracks leads from first inquiry to close, along with tasks, imports and exports, and reports.

- **Web app:** Expo (React Native for Web) with Expo Router, deployed to **EAS Hosting**
- **Database, logins and permissions:** **Supabase** (Postgres + Auth + row-level security)
- **Code and CI:** **GitHub**, with checks on every push. An EAS Workflow deploys every push to `main`.

## What it does

| Area | Details |
|---|---|
| **Leads** | Company, contact, email, phone, equipment, price, stage, probability, expected close, quote #, source, notes, owner. Search, filter, sort, and export to CSV. |
| **Pipeline** | Kanban board, one column per stage. Drag cards between stages (or use the arrows). Each column shows its total and weighted value. |
| **Lead page** | Salesforce-style stage path. Click a stage to move the lead there. The activity timeline holds notes, calls, emails, meetings, and automatic stage-change entries. Each lead has its own tasks. Marking a lead lost asks for a reason. |
| **Tasks** | Overdue / Today / Upcoming / No date. Optionally linked to a lead. Managers can assign tasks to reps. |
| **Import** | Upload CSV or .xlsx. The app finds the right sheet and header row and auto-matches columns, which you can adjust. It normalizes money and dates, then checks for duplicates by email or company across the whole CRM, including other reps' leads, before importing. Your existing pipeline tracker imports as-is. |
| **Dashboard** | Open pipeline, weighted forecast, closed won, win rate, average deal, pipeline by stage, revenue projection by close month, tasks due, stale and past-due deals. |
| **Reports** | Pipeline by stage, won/lost by month, rep performance, stage conversion, time in stage, leads by source, lost reasons, stale deals. Every report filters by date range and exports to CSV. |
| **Team** (managers) | Promote or demote, deactivate, rename, and transfer a rep's whole book to someone else. |
| **Settings** | Your name and password. Managers can also edit pipeline stages and default probabilities. |

### Who sees what

The database enforces these rules (Postgres row-level security), so they hold no matter how someone calls the API:

- **Reps** see and edit only the leads and tasks they own. They can't reassign a lead to someone else, delete leads, or change roles.
- **Managers** see and edit everything. Their dashboard and reports show the whole company, or one rep at a time.
- **Deactivated users** see nothing.
- **The first account created is the manager.** Everyone after that starts as a rep, and a manager promotes people from the Team page.

`supabase/tests/rls_test.sql` checks each of these rules against a real Postgres. Run it with `npm run test:db`.

---

## Setup checklist

### 1. Create the Supabase project (about 10 minutes)

1. Sign up at [supabase.com](https://supabase.com) and create a new project. The free tier is fine to start.
2. Open **SQL Editor** → New query. Paste the full contents of `supabase/migrations/20261023000000_init.sql` and click **Run**.
   This creates the tables, the permission rules, and your 9 pipeline stages.
3. Go to **Authentication → Sign In / Providers** and **turn off "Allow new users to sign up"**. Only you should be able to add people.
4. Go to **Authentication → URL Configuration**:
   - **Site URL:** your production URL once you have it (step 4), e.g. `https://sales-crm.expo.app`
   - **Redirect URLs:** add `https://<your-site>/reset-password` and `http://localhost:8081/reset-password`
5. Go to **Authentication → Users → Add user → Create new user**. Enter **your own** email and a password, and tick **Auto Confirm User**.
   The first user becomes the manager.
6. Go to **Project Settings → API** (or **API Keys**) and copy the **Project URL** and the **anon** (or **publishable**) key.
   Never put the `service_role` / secret key in this app.

### 2. Run it on your computer

Requires Node 20 or newer.

```bash
npm install
cp .env.example .env        # then paste the URL and anon key into .env
npm run web                 # opens http://localhost:8081
```

Sign in with the user from step 1.5. Open **Import** and upload your pipeline tracker .xlsx. It picks the *Pipeline* tab and maps every column automatically.

### 3. Put the code on GitHub

```bash
git remote add origin https://github.com/<you>/sales-crm.git
git push -u origin main
```

The repo already has an initial commit. `.env` is git-ignored, so your keys stay off GitHub.
On every push, GitHub Actions (`.github/workflows/ci.yml`) runs the typecheck, unit tests, database permission tests and a web build.

### 4. Deploy with Expo (EAS Hosting)

One-time setup:

```bash
npm install -g eas-cli
eas login                   # create a free Expo account if you don't have one
eas init                    # links this folder to a new Expo project (adds the project id to app.json; commit that change)

# Store the Supabase settings for production builds:
eas env:create --environment production --name EXPO_PUBLIC_SUPABASE_URL --value "https://YOUR-PROJECT.supabase.co" --visibility plaintext
eas env:create --environment production --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value "YOUR-ANON-KEY" --visibility plaintext

npm run deploy              # builds the site and deploys it; the first run asks you to choose a subdomain
```

Put the resulting `https://<name>.expo.app` URL into Supabase's **Site URL** and **Redirect URLs** (step 1.4).

**Automatic deploys from GitHub:** on expo.dev, open the project → **GitHub** and connect the repository.
After that, `.eas/workflows/deploy.yml` deploys every push to `main` to production.

### 5. Add your team

For each rep, go to Supabase → **Authentication → Users → Add user**. You can **Send invitation**, which emails them a link to set a password, or **Create new user** with a temporary password and Auto Confirm.
They appear on the app's **Team** page as reps. Set their name there, and promote anyone who should see the whole company to manager.
To bring in a rep's existing leads, sign in as a manager, open Import, and add an *Owner* column (rep name or email) or choose a default owner.

---

## Project layout

```
src/app/                 screens (Expo Router: every file is a route)
  login.tsx, reset-password.tsx
  (app)/_layout.tsx      signed-in shell: sidebar, role check
  (app)/index.tsx        dashboard (rep: own numbers; manager: company or per-rep)
  (app)/pipeline.tsx     kanban board
  (app)/leads/…          list, new, detail
  (app)/tasks.tsx, reports.tsx, import.tsx, team.tsx, settings.tsx
src/lib/
  api.ts                 every Supabase query
  metrics.ts             report math (pure functions, unit tested)
  importer.ts            CSV/XLSX column matching and cleanup (unit tested)
  auth.tsx, data.tsx     session/profile and shared data
src/components/          UI kit, charts, lead and task components
supabase/migrations/     database schema + permission rules
supabase/tests/          permission tests (run against plain Postgres)
```

## Commands

| Command | What it does |
|---|---|
| `npm run web` | Local dev server |
| `npm run typecheck` | TypeScript check |
| `npm test` | Unit tests for reports and import |
| `npm run test:db` | Permission tests; needs a local Postgres (`TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/postgres`) |
| `npm run build:web` | Static build into `dist/` |
| `npm run deploy` | Build and deploy to EAS Hosting production |

## Changing the database later

Put each change in a new file in `supabase/migrations/` (for example `20261101000000_add_industry.sql`) and run it in the SQL Editor, or use the Supabase CLI (`npx supabase link` then `npx supabase db push`). Don't edit the original migration after it has been applied.

## Notes and limits

- Reports are calculated in the browser from the rows the viewer is allowed to see. That stays fast up to tens of thousands of leads. Past that, move the heavy reports into SQL views.
- This is web-only. The app uses a few browser controls directly (dropdowns, date pickers, file upload, drag-and-drop). Making native phone apps later would mean swapping those for native components.
- `npm audit` flags `node-forge` inside Expo's command-line tooling. That tooling runs only when you build, and none of it ships to the browser.
