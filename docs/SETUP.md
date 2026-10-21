# Setup — your steps, in order

Things only you can do (accounts, keys, downloads). Do them top to bottom.
**Part A** is needed now. **Part B** can wait until the phase that needs it.

Never commit `.env.local` or any key — it is already in `.gitignore`.

---

## Part A — needed now

### A1. Make the GitHub repo private

1. Open https://github.com/aragamix01/nutrition-app/settings
2. Scroll to **Danger Zone** → **Change repository visibility** → **Make private**.
3. Open https://github.com/settings/emails and check that `aragamix01@gmail.com` shows **Verified**.

### A2. Install the Vercel CLI

```bash
npm i -g vercel
```

```bash
vercel login
```

Choose **Continue with GitHub** and sign in as `aragamix01`.

### A3. Create the Vercel project

1. Go to https://vercel.com/new
2. **Import Git Repository** → pick `aragamix01/nutrition-app` (click **Adjust GitHub App Permissions** if it is not listed).
3. Framework Preset: **Next.js** (auto-detected). Leave everything else as is.
4. Click **Deploy** and wait for it to finish.
5. Open `https://<your-project>.vercel.app/api/health` — expect `{"ok":true,"db":"not_configured"}`.

### A4. Put functions in Singapore (closest to Thailand)

1. Project → **Settings** → **Functions** → **Function Region**.
2. Choose **Singapore (sin1)** → **Save**.

### A5. Add the Neon database

1. Project → **Storage** tab → **Create Database** → **Neon** → **Continue**.
2. Plan: **Free**. Region: **Singapore (aws-ap-southeast-1)**. Name: `nutrition`.
3. Connect it to the project for **Development, Preview, Production** → **Connect**.
   Vercel now has `DATABASE_URL` set automatically.

### A6. Create a separate dev database branch

So testing never touches your real data.

1. Storage tab → click the Neon database → **Open in Neon Console**.
2. **Branches** → **New Branch** → name `dev`, parent `main` → **Create**.
3. On the `dev` branch click **Connect** → copy the connection string
   (starts with `postgresql://`, ends with `?sslmode=require...`). Keep it for A8.

### A7. Link this folder to Vercel and pull env vars

In the project folder:

```bash
vercel link
```

Answer: yes → your account → **Link to existing project** → `nutrition-app`.

```bash
vercel env pull .env.local
```

### A8. Edit `.env.local`

Open `.env.local` and:

1. Replace the `DATABASE_URL=` value with the **dev** branch string from A6.
2. Add this line at the end:

```
DEV_BYPASS_AUTH=true
```

> Every time you run `vercel env pull` again, the file is overwritten — redo A8.
> **Never** add `DEV_BYPASS_AUTH` in the Vercel dashboard.

### A9. Create the tables (dev branch)

```bash
npm run db:migrate
```

### A10. Download the USDA data

1. Go to https://fdc.nal.usda.gov/download-datasets
2. Under **SR Legacy**, download the **CSV** zip.
3. Extract it into `data/usda/` inside the project, so you have
   `data/usda/FoodData_Central_sr_legacy_food_csv_.../food.csv`.

### A11. Import USDA into the dev database

```bash
npm run db:import-usda
```

Expect `Parsed ~7,7xx foods` then `Done.`

### A12. Check it works locally

```bash
npm run dev
```

1. http://localhost:3000/api/health → `"db":"ok"`
2. http://localhost:3000/api/ingredients/search?q=rice%20white%20cooked → list of cooked white rice
3. http://localhost:3000/profile → fill in → **บันทึกโปรไฟล์** → reload, values stay
4. http://localhost:3000 → the ring shows your daily target

**Tell Claude when A12 passes** (or paste any error).

---

## Part B — later, when the phase needs it

### B1. Gemini API key (phase 5 — photo analysis)

1. Go to https://aistudio.google.com/apikey → **Create API key** → copy it.
2. Vercel project → **Settings** → **Environment Variables** → add for all three environments:
   - `GEMINI_API_KEY` = the key
   - `GEMINI_MODEL` = the current free **Flash-Lite** (or Flash) model name shown in AI Studio
3. Re-run `vercel env pull .env.local`, then redo A8.

### B2. Scraper contact (phase 6 — Thai FCD)

Vercel → Environment Variables → add `SCRAPER_CONTACT` = an email you read (sent in the User-Agent so INMU can reach you). Pull + redo A8.

### B3. LINE Login channel + LIFF (phase 7)

1. Go to https://developers.line.biz/console/ → log in with your LINE account.
2. **Create a new provider** → name e.g. `personal`.
3. In the provider → **Create a new channel** → **LINE Login**.
   - Region: Thailand. App types: **Web app**. Fill name/description → agree → **Create**.
4. **Basic settings** tab:
   - Copy **Channel ID** → Vercel env `LINE_CHANNEL_ID`.
   - Copy **Your user ID** (starts with `U`) → Vercel env `ALLOWED_LINE_USER_ID`.
5. **LIFF** tab → **Add**:
   - Size: **Full**
   - Endpoint URL: `https://<your-project>.vercel.app`
   - Scopes: `openid`, `profile`
   - **Add** → copy the **LIFF ID** → Vercel env `NEXT_PUBLIC_LIFF_ID`.
6. Leave the channel in **Developing** — it works for your own account.
7. Pull + redo A8.

### B4. Production database (phase 7 — go live)

Run migrations and the USDA import once against **main** (the real database).
Copy the `main` branch connection string from the Neon Console, then:

```bash
DATABASE_URL='<main connection string>' npm run db:migrate
```

```bash
DATABASE_URL='<main connection string>' npm run db:import-usda
```

Then in Vercel → **Deployments** → latest → **⋯** → **Redeploy**.

### B5. Final check

1. Open the LIFF URL (`https://liff.line.me/<LIFF ID>`) in your own LINE chat → the app opens and works.
2. Open `https://<your-project>.vercel.app/api/profile` in a normal browser → must answer 401 (no token).

---

## If something fails

| Symptom                     | Fix                                                                                  |
| --------------------------- | ------------------------------------------------------------------------------------ |
| `DATABASE_URL is not set`   | A7–A8 not done, or `.env.local` was overwritten — redo A8                            |
| `db:"error"` on /api/health | Wrong connection string; copy it again from the Neon Console                         |
| `No food.csv in data/usda`  | Zip not extracted into `data/usda/` (A10)                                            |
| Vercel deploy **blocked**   | Commit author must be `aragamix01 <aragamix01@gmail.com>`, no `Co-Authored-By` lines |
| 403 from the API in LINE    | `ALLOWED_LINE_USER_ID` does not match your user ID (B3 step 4)                       |
