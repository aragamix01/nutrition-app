# Setup: your steps, in order

These are the steps only you can do (accounts, keys, downloads). Do them top to bottom.
**Part A** is needed now. **Part B** can wait until the phase that needs it.

Everything is done in the browser. You don't need the Vercel CLI.
The repo can stay public: keys live only in the Vercel dashboard and your local `.env.local`, which is never committed.

---

## Try it now (no setup)

Before any of the steps below, you can already use the app on your computer:

```bash
npm install
```

```bash
npm run dev
```

Open http://localhost:3000. Without `DATABASE_URL`, the app uses a local test database in `.pglite/` with about 25 sample ingredients and 2 sample dishes (approximate values, for trying things out only).
To start over, stop the server and delete the `.pglite` folder.

To fill the History charts with 14 days of fake meals and weights, stop `npm run dev` first, then:

```bash
npm run db:seed-demo
```

Remove the fake meals again with `npm run db:seed-demo -- --clear`.
With `DATABASE_URL` set, the same command writes to that database instead, so only point it at the `dev` branch.

---

## Part A: needed now

### A1. Check your GitHub email

Vercel's free plan only deploys commits whose author is the account owner.

1. Open https://github.com/settings/emails
2. Check that `aragamix01@gmail.com` is listed and shows **Verified**.

### A2. Create the Vercel project

1. Go to https://vercel.com/new and sign in with **GitHub** as `aragamix01`.
2. Under **Import Git Repository**, pick `aragamix01/nutrition-app`.
   If it isn't listed, click **Adjust GitHub App Permissions** and allow the repo.
3. Framework Preset should say **Next.js**. Leave everything else as it is.
4. Click **Deploy** and wait for it to finish.
5. Open `https://<your-project>.vercel.app/api/health`. You should see `{"ok":true,"db":"not_configured"}`.

From now on, every push to `main` deploys automatically.

### A3. Put the server in Singapore (closest to Thailand)

1. In the project, go to **Settings**, then **Functions**, then **Function Region**.
2. Choose **Singapore (sin1)** and click **Save**.

### A4. Add the Neon database

1. In the project, open the **Storage** tab, click **Create Database**, choose **Neon**, then **Continue**.
2. Plan: **Free**. Region: **Singapore (aws-ap-southeast-1)**. Name: `nutrition`.
3. Connect it to **Development, Preview and Production**, then click **Connect**.
   Vercel now sets `DATABASE_URL` for the live site automatically.

### A5. Make a separate dev database

This keeps testing away from your real data.

1. In the **Storage** tab, click the Neon database, then **Open in Neon Console**.
2. Go to **Branches**, click **New Branch**, name it `dev` with parent `main`, and click **Create**.
3. With the `dev` branch selected, click **Connect** and copy the connection string.
   It starts with `postgresql://`. Keep it for the next step.

### A6. Create `.env.local` on your computer

In the project folder, copy the example file:

```bash
cp .env.example .env.local
```

Open `.env.local` and:

1. Paste the **dev** connection string from A5 after `DATABASE_URL=`.
2. Check that `DEV_BYPASS_AUTH=true` is there. It's already in the example. It skips the LINE login on your computer only.

Leave the other lines empty for now.

> **Never** add `DEV_BYPASS_AUTH` in the Vercel dashboard. On the live site it would let anyone use the app.

### A7. Create the tables in the dev database

```bash
npm run db:migrate
```

### A8. Download the USDA data

1. Go to https://fdc.nal.usda.gov/download-datasets
2. Under **SR Legacy**, download the **CSV** zip.
3. Extract it into `data/usda/` inside the project, so that this file exists:
   `data/usda/FoodData_Central_sr_legacy_food_csv_.../food.csv`
   (`data/usda/` is never committed.)

### A9. Load USDA into the dev database

```bash
npm run db:import-usda
```

You should see `Parsed ~7,7xx foods`, then `Done.`

### A10. Check it works on your computer

```bash
npm run dev
```

Open each of these:

1. http://localhost:3000/api/health should show `"db":"ok"`.
2. http://localhost:3000/api/ingredients/search?q=rice%20white%20cooked should list cooked white rice.
3. http://localhost:3000/profile: fill it in and press **บันทึกโปรไฟล์**. Reload the page; your values should still be there.
4. http://localhost:3000 should show the ring with your daily target.

**Tell Claude when A10 works, or paste any error you see.**

---

## Part B: later, when the phase needs it

Every key in Part B goes in two places:

- **Vercel:** in the project, go to **Settings**, then **Environment Variables**. Add it with all three environments ticked, and save.
- **Your computer:** add the same `NAME=value` line to `.env.local`.

After adding keys in Vercel, redeploy: go to **Deployments**, open the **⋯** menu on the latest one, and click **Redeploy**.

### B1. Gemini API key (phase 5: photo analysis)

1. Go to https://aistudio.google.com/apikey, click **Create API key**, and copy it.
2. Add `GEMINI_API_KEY` = the key.
3. Add `GEMINI_MODEL` = the current free **Flash-Lite** (or Flash) model name shown in AI Studio.

### B2. Scraper contact (phase 6: Thai FCD)

Add `SCRAPER_CONTACT` = an email address you read. It's sent with each Thai FCD request so INMU can contact you.

### B3. LINE Login channel and LIFF app (phase 7)

1. Go to https://developers.line.biz/console/ and log in with your LINE account.
2. Click **Create a new provider** and name it, for example `personal`.
3. Inside the provider, click **Create a new channel** and choose **LINE Login**.
   Region: Thailand. App type: **Web app**. Fill in the name and description, agree to the terms, and click **Create**.
4. In the **Basic settings** tab:
   - Copy **Channel ID** and add it as `LINE_CHANNEL_ID`.
   - Copy **Your user ID** (it starts with `U`) and add it as `ALLOWED_LINE_USER_ID`.
5. In the **LIFF** tab, click **Add**:
   - Size: **Full**
   - Endpoint URL: `https://<your-project>.vercel.app`
   - Scopes: `openid` and `profile`
   - Click **Add**, then copy the **LIFF ID** and add it as `NEXT_PUBLIC_LIFF_ID`.
6. Leave the channel in **Developing**. It works for your own LINE account.

### B4. Set up the real database (phase 7: go live)

Create the tables and load USDA once into the **main** branch (the real database).
In the Neon Console, select the `main` branch, click **Connect**, and copy its connection string. Then run:

```bash
DATABASE_URL='<main connection string>' npm run db:migrate
```

```bash
DATABASE_URL='<main connection string>' npm run db:import-usda
```

Then redeploy in Vercel.

### B5. Final check

1. In your own LINE chat, open `https://liff.line.me/<LIFF ID>`. The app should open and work.
2. In a normal browser, open `https://<your-project>.vercel.app/api/profile`. It must answer **401**, because there's no LINE login.

---

## If something fails

| What you see                        | What to do                                                                              |
| ----------------------------------- | --------------------------------------------------------------------------------------- |
| `DATABASE_URL is not set`           | `.env.local` is missing or the line is empty. Redo A6.                                  |
| `"db":"error"` on /api/health       | The connection string is wrong. Copy it again from the Neon Console.                    |
| `No food.csv in data/usda`          | The zip isn't extracted into `data/usda/`. Redo A8.                                     |
| Vercel says the deploy is blocked   | The commit author must be `aragamix01 <aragamix01@gmail.com>` with no `Co-Authored-By`. |
| 403 from the API inside LINE        | `ALLOWED_LINE_USER_ID` doesn't match your user ID. Redo B3 step 4.                      |
| Profile won't save on your computer | Check that `DEV_BYPASS_AUTH=true` is in `.env.local`, then restart `npm run dev`.       |
