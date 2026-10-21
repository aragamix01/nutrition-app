# แผนพัฒนา: แอปคำนวณสารอาหารผ่าน LINE (ใช้ส่วนตัว)

> ไฟล์นี้เป็นแผนสำหรับให้ Claude Code ทำตามทีละเฟส
> เป้าหมาย: ใช้เองคนเดียว ไม่เผยแพร่ ฟรีหรือเกือบฟรี และพึ่งบริการภายนอก/การติดต่อคนอื่นให้น้อยที่สุด
> Deploy บน **Vercel (Hobby)** — แผน Hobby ใช้ได้เฉพาะโปรเจกต์ส่วนตัวที่ไม่ใช่เชิงพาณิชย์ ซึ่งตรงกับเคสนี้
> Git remote: **https://github.com/aragamix01/nutrition-app** (branch หลัก `main`, Vercel deploy อัตโนมัติจาก repo นี้)

---

## 1. ขอบเขต

**ทำ**
- ตั้งค่าโปรไฟล์ (เพศ อายุ ส่วนสูง น้ำหนัก ระดับกิจกรรม เป้าหมาย) → คำนวณ BMR, TDEE, เป้าพลังงานและ macro ต่อวัน
- บันทึกมื้ออาหาร: ถ่ายรูป → AI แตกจานเป็นวัตถุดิบ + กรัม → จับคู่กับฐานข้อมูลวัตถุดิบ → ผู้ใช้แก้ไข/ยืนยัน → บันทึก
- "คลังอาหารของฉัน": เมนูที่เคยบันทึกเก็บสูตร (วัตถุดิบ + กรัม) ไว้ใช้ซ้ำ — คาดว่ากินเมนูซ้ำบ่อย คลังนี้จะเป็นทางหลักในระยะยาว
- บันทึกแบบพิมพ์เอง และเลือกจากคลัง
- แดชบอร์ด: วันนี้ (วงแหวนพลังงาน + แท่ง macro), ย้อนหลัง 7/30 วัน, กราฟน้ำหนัก
- เปิดใช้งานผ่าน LINE (LIFF) และเปิดในเบราว์เซอร์ปกติตอน dev ได้

**ไม่ทำ (ตอนนี้)**
- หลายผู้ใช้, ระบบสมัครสมาชิก, การชำระเงิน
- ส่ง LINE MINI App เข้ารีวิว/verify
- ดูดข้อมูล Thai FCD ทั้งชุด (ดึงทีละรายการเมื่อผู้ใช้สั่งเท่านั้น)
- เก็บรูปอาหารถาวร

---

## 2. Stack (บัญชีภายนอก: LINE Developers, Vercel (+ Neon ผ่าน Vercel Marketplace), Google AI Studio)

| ส่วน | เลือกใช้ | เหตุผล |
|---|---|---|
| Frontend | Next.js (App Router) + React + TypeScript — หน้าเป็น client component (`'use client'`) เพราะ auth มาจาก LIFF ID token ฝั่ง browser | Vercel รองรับเต็มที่, routing ตามไฟล์, dev server เดียวรวม API |
| UI | Tailwind CSS (+ shadcn/ui ถ้าต้องการ) | สวยเร็ว |
| กราฟ | Recharts | ใช้กับ React ง่าย |
| State/ข้อมูล | TanStack Query + Zod | cache + validate |
| LINE | `@line/liff` (+ `@line/liff-mock` ตอน dev) | |
| โฮสต์ | Vercel Hobby | ฟรีสำหรับใช้ส่วนตัว |
| API | Next.js Route Handler (Node.js runtime) + Hono (`hono/vercel`) — **รวมเป็น route เดียว** `app/api/[[...route]]/route.ts` | Hobby จำกัดจำนวน function ต่อ deployment, รวมไว้ตัวเดียวไม่ต้องกังวล |
| ฐานข้อมูล | Neon Postgres (สร้างผ่าน Vercel Marketplace, แผน Free) + Drizzle ORM + driver `@neondatabase/serverless` (HTTP) | ฟรี ไม่ลบข้อมูล; ใช้ HTTP driver เลี่ยงปัญหา connection ของ serverless |
| ค้นหาชื่อวัตถุดิบ | Postgres full-text (`tsvector`) + `pg_trgm` | มีใน Neon อยู่แล้ว ใช้ได้ทั้งชื่ออังกฤษและไทยแบบ fuzzy |
| AI รูปอาหาร | Gemini API (`@google/genai`) รุ่น Flash-Lite/Flash ที่ยังฟรี | ใช้คนเดียว โควตาฟรีพอ |
| ข้อมูลวัตถุดิบหลัก | USDA FoodData Central — **ดาวน์โหลด CSV มา import ครั้งเดียว** (SR Legacy, + Foundation Foods ถ้าต้องการ) | CC0 ไม่ต้องขออนุญาต ไม่ต้องใช้ API key ตอนรัน |
| ข้อมูลสำรอง (fallback) | Thai FCD (INMU) — scrape ทีละรายการเมื่อผู้ใช้กดค้น แล้ว cache | ใช้ฟรีสำหรับผู้ใช้ที่ไม่ใช่เชิงพาณิชย์ โดยต้องให้เครดิต INMU |

**ข้อจำกัดของแผนฟรีที่ต้องรู้**
- Neon Free: storage 0.5 GB ต่อโปรเจกต์ (ข้อมูล USDA ที่เก็บแค่ 6 สารอาหารใช้ไม่กี่ MB), compute หลับหลังไม่มีการใช้งาน ~5 นาที → request แรกหลังหลับช้าขึ้นเล็กน้อย
- Vercel Hobby: ถ้าใช้เกินโควตาฟรีโปรเจกต์จะถูก pause (ไม่โดนเก็บเงิน), จำกัดเวลารันของ function — ตั้ง `maxDuration` ของ function ให้พอสำหรับเรียก Gemini และตรวจกับเอกสาร Vercel ปัจจุบัน
- Gemini free tier อาจนำข้อมูลไปใช้ปรับปรุงโมเดล — รับได้สำหรับรูปอาหารส่วนตัว แต่ห้ามส่งข้อมูลระบุตัวตนไปกับ prompt

---

## 3. โครงสร้างโปรเจกต์

```
/
├─ app/                    # Next.js App Router
│  ├─ layout.tsx           # ฟอนต์, theme, providers (TanStack Query, LIFF)
│  ├─ page.tsx             # Dashboard (วันนี้)
│  ├─ add/page.tsx         # ถ่ายรูป / พิมพ์เอง / เลือกจากคลัง
│  ├─ review/page.tsx      # ตรวจแก้วัตถุดิบ+กรัม ก่อนบันทึก
│  ├─ history/page.tsx
│  ├─ library/page.tsx
│  ├─ profile/page.tsx
│  ├─ about/page.tsx       # เครดิตแหล่งข้อมูล (USDA, Thai FCD)
│  ├─ styles/              # tokens.css + components.css (จาก Design System)
│  └─ api/[[...route]]/route.ts  # route เดียว: export Hono app ผ่าน hono/vercel
├─ src/
│  ├─ lib/liff.ts          # init LIFF, getIDToken, mock ตอน dev
│  ├─ lib/api.ts           # fetch wrapper แนบ Authorization: Bearer <idToken>
│  ├─ lib/nutrition.ts     # สูตร BMR/TDEE/macro + รวมสารอาหารจากวัตถุดิบ (pure + unit test)
│  ├─ lib/image.ts         # ย่อรูปฝั่ง client
│  └─ components/          # EnergyRing, MacroBars, MealCard, IngredientRow, BottomNav, ...
├─ server/                 # โค้ดฝั่ง server (import จาก app/api)
│  ├─ app.ts               # Hono routes ทั้งหมด
│  ├─ auth.ts              # ตรวจ LIFF ID token + allowlist
│  ├─ db.ts                # Drizzle + @neondatabase/serverless
│  ├─ gemini.ts            # เรียก Gemini + schema
│  ├─ ingredients.ts       # ค้นวัตถุดิบ (full-text + trigram)
│  └─ thaifcd/             # scraper แยกโมดูล
│     ├─ client.ts         # ยิง request + rate limit (สถานะเก็บใน DB)
│     ├─ parse.ts          # แปลง HTML → object
│     └─ __fixtures__/     # HTML ตัวอย่างสำหรับ test parser
├─ scripts/
│  ├─ import-usda.ts       # อ่าน CSV ของ USDA → insert เข้า Neon แบบ batch
│  └─ seed-demo.ts         # ข้อมูลปลอม 14 วันสำหรับทดสอบแดชบอร์ด
├─ db/schema.ts            # Drizzle schema
├─ drizzle/                # migrations (drizzle-kit)
├─ .gitignore              # node_modules, .next, .vercel, .env*, data/usda/
└─ PLAN.md
```

---

## 3.1 Git และ repo

- Remote: `origin` → `https://github.com/aragamix01/nutrition-app.git`
- Branch หลัก: `main` — push ขึ้น `main` = deploy Production บน Vercel, branch อื่น/PR = Preview deployment
- **Commit author ต้องเป็นเจ้าของบัญชีเท่านั้น** (Vercel Hobby บล็อก deploy ถ้า commit author ไม่ใช่เจ้าของบัญชี):
  - ตั้งใน repo: `git config user.name "aragamix01"` และ `git config user.email "aragamix01@gmail.com"` (ต้องเป็น email ที่ยืนยันแล้วใน GitHub และตรงกับบัญชีที่ login Vercel)
  - **ไม่ใส่ trailer `Co-Authored-By` ใดๆ ใน commit message** — ตั้งค่าใน `.claude/settings.json` ของ repo: `{ "includeCoAuthoredBy": false }` (หรือ `attribution` ตามเวอร์ชันของ Claude Code ที่ใช้) แล้วตรวจด้วย `git log -1 --format=%B` หลัง commit แรก
- Commit เล็กๆ ต่อขั้น, ข้อความ commit ภาษาอังกฤษแบบ Conventional Commits (`feat:`, `fix:`, `chore:`)
- จบแต่ละเฟส: รัน test + build ให้ผ่าน → commit → push `main` → ตรวจว่า Vercel deploy สำเร็จ
- ห้าม commit secrets: `.env*` อยู่ใน `.gitignore` ตั้งแต่ commit แรก; ค่าจริงตั้งใน Vercel dashboard แล้วดึงลงเครื่องด้วย `vercel env pull .env.local`
- Repo ควรเป็น **private** (เก็บข้อมูลส่วนตัวในอนาคต เช่น fixture หรือ seed)

---

## 4. ความปลอดภัยแบบใช้คนเดียว

- ทุก request ส่ง LIFF ID token มาใน header
- Backend ตรวจด้วย `POST https://api.line.me/oauth2/v2.1/verify` (`id_token`, `client_id` = Channel ID)
- เทียบ `sub` กับ env `ALLOWED_LINE_USER_ID` — ไม่ตรงตอบ 403 (จบเรื่อง auth ไม่ต้องมีระบบสมาชิก)
- Environment variables บน Vercel: `DATABASE_URL` (ใส่ให้อัตโนมัติเมื่อเชื่อม Neon), `GEMINI_API_KEY`, `GEMINI_MODEL`, `LINE_CHANNEL_ID`, `ALLOWED_LINE_USER_ID`, `SCRAPER_CONTACT`
- โหมด dev (`DEV_BYPASS_AUTH=true` เฉพาะ local, ห้ามตั้งใน Production) ข้ามการตรวจ token
- จำกัดอัปโหลดรูป ≤ 1 MB (ต่ำกว่าขีดจำกัด request body ของ Vercel มาก) และ rate limit endpoint AI แบบง่ายผ่านตารางใน DB (เช่น 30 ครั้ง/ชม.) — serverless ไม่มี memory ร่วมกันระหว่าง request

---

## 5. Data model (Postgres)

```ts
profile        // แถวเดียว
  id, sex ('male'|'female'), birth_year, height_cm, activity_level (1.2|1.375|1.55|1.725|1.9),
  goal ('lose'|'maintain'|'gain'), goal_rate (-0.2..+0.2), protein_g_per_kg (default 1.8),
  fat_pct (default 0.25), updated_at

weight_log
  id, date (date), weight_kg

ingredient     // วัตถุดิบ — ค่าทั้งหมดต่อ 100 g ส่วนที่กินได้
  id, source ('usda'|'thaifcd'|'manual'), source_id, name_en, name_th?,
  kcal, protein_g, carb_g, fat_g, fiber_g?, sodium_mg?,
  is_dish (bool — true ถ้าเป็นอาหารปรุงสำเร็จทั้งจาน เช่นกลุ่ม T ของ Thai FCD),
  source_url?, fetched_at?, use_count
  unique(source, source_id)
  + generated column `search tsvector` จาก name_en, GIN index
  + `pg_trgm` GIN index บน name_en และ name_th

dish           // คลังอาหารของฉัน (สูตรที่เคยกิน)
  id, name_th, name_aliases (jsonb), default_serving_desc, use_count, updated_at

dish_component
  id, dish_id, ingredient_id, grams

meal_entry
  id, eaten_at (timestamptz), meal_type ('breakfast'|'lunch'|'dinner'|'snack'),
  dish_id?, name_th, portion_multiplier, note?,
  // snapshot ตัวเลขตอนบันทึก (ไม่ให้ประวัติเปลี่ยนถ้าแก้สูตรภายหลัง)
  kcal, protein_g, carb_g, fat_g, fiber_g?, sodium_mg?

meal_component  // snapshot วัตถุดิบของมื้อนั้น
  id, meal_entry_id, ingredient_id, grams

http_cache      // cache ผลค้น Thai FCD
  key (text PK), body (jsonb), expires_at

rate_limit      // สถานะ rate limit ข้าม invocation
  key (text PK), window_start, count, last_request_at
```

- ทุกการคำนวณ "วันนี้" ใช้ timezone `Asia/Bangkok`
- เป้าหมายรายวันคำนวณสดจาก profile + น้ำหนักล่าสุด (ไม่ต้องเก็บ)

---

## 6. สูตรคำนวณ (`src/lib/nutrition.ts`)

- อายุ = ปีปัจจุบัน − birth_year
- BMR (Mifflin-St Jeor):
  - ชาย: `10*kg + 6.25*cm − 5*age + 5`
  - หญิง: `10*kg + 6.25*cm − 5*age − 161`
- TDEE = BMR × activity_level
- เป้าพลังงาน = TDEE × (1 + goal_rate) โดย lose ≈ −0.15, gain ≈ +0.10
- **ขั้นต่ำเพื่อความปลอดภัย:** เป้าพลังงานไม่ต่ำกว่า BMR (แจ้งเตือนถ้าตั้งต่ำกว่า)
- Protein (g) = kg × protein_g_per_kg
- Fat (g) = เป้าพลังงาน × fat_pct ÷ 9
- Carb (g) = (เป้าพลังงาน − protein×4 − fat×9) ÷ 4
- สารอาหารของจาน = Σ (ค่าต่อ 100 g ของวัตถุดิบ × grams ÷ 100) × portion_multiplier
- เขียน unit test ด้วย Vitest ครอบทุกฟังก์ชัน
- ไฟล์นี้ใช้ร่วมกันได้ทั้ง frontend และ server (pure TS ไม่มี dependency)

---

## 7. API (Hono ใน function เดียว)

| Method | Path | ทำอะไร |
|---|---|---|
| GET | `/api/health` | ตรวจว่า function + DB ทำงาน |
| GET/PUT | `/api/profile` | อ่าน/แก้โปรไฟล์ |
| GET | `/api/summary?date=` | รวมพลังงาน/macro ของวัน + เป้า |
| GET | `/api/summary/range?from=&to=` | สำหรับกราฟย้อนหลัง |
| GET/POST/DELETE | `/api/meals` | บันทึกมื้อ (รับรายการวัตถุดิบ+กรัม คำนวณ snapshot ฝั่ง server) |
| GET/POST/PUT | `/api/dishes` | คลังอาหาร (ค้นด้วย `?q=`) |
| GET | `/api/ingredients/search?q=` | ค้นใน DB คืน top 10 |
| POST | `/api/ingredients` | เพิ่มวัตถุดิบเอง (`source: 'manual'`) |
| GET | `/api/thaifcd/search?q=&group=` | fallback: scrape ผลค้น Thai FCD |
| POST | `/api/thaifcd/import` | ดึงรายละเอียดรายการที่เลือก → บันทึกลง `ingredient` |
| GET/POST | `/api/weight` | น้ำหนัก |
| POST | `/api/analyze` | รับรูป → Gemini → คืนร่าง (วัตถุดิบ+กรัม+ผลจับคู่) ยังไม่บันทึก |

---

## 8. ไหลการวิเคราะห์รูปอาหาร

**ฝั่ง client**
- `<input type="file" accept="image/*" capture="environment">`
- ย่อด้วย canvas เหลือด้านยาว ~1024px, JPEG quality ~0.8
- ส่งไป backend ไม่เก็บรูป

**ฝั่ง server (`/api/analyze`)**
1. ส่งรายชื่อ ~50 เมนูที่ใช้บ่อยจาก `dish` ไปใน prompt
2. เรียก Gemini ด้วย `responseMimeType: "application/json"` + `responseSchema`, ชื่อรุ่นจาก env `GEMINI_MODEL`
3. ถ้า AI จับคู่กับ `dish` เดิมได้ → คืนสูตรจากคลัง (เชื่อคลังมากกว่า AI) พร้อมปรับ portion ตามที่ AI ประเมิน
4. ถ้าเป็นเมนูใหม่ → สำหรับแต่ละวัตถุดิบ ค้น `ingredient` จาก `usda_query` เลือกอันดับ 1 เป็นค่าเริ่มต้น แนบตัวเลือกอื่นอีก 4 อัน
5. วัตถุดิบที่หาไม่เจอ ให้ `match: null` เพื่อให้ UI เสนอ fallback

**Schema ที่ต้องการจาก Gemini**
```json
{
  "dishes": [
    {
      "name_th": "ข้าวกะเพราหมูสับไข่ดาว",
      "matched_dish_id": null,
      "portion_multiplier": 1.0,
      "est_total_g": 380,
      "ingredients": [
        { "name_th": "ข้าวสวย", "usda_query": "rice white cooked", "thai_query": "rice, cooked", "grams": 180 },
        { "name_th": "หมูสับ", "usda_query": "pork ground cooked", "thai_query": "pork, minced", "grams": 80 },
        { "name_th": "น้ำมันพืช (ผัด+ทอดไข่)", "usda_query": "oil vegetable", "thai_query": "oil, vegetable", "grams": 15 }
      ],
      "confidence": 0.0
    }
  ],
  "notes": "สิ่งที่มองไม่เห็น เช่น น้ำมัน น้ำตาล กะทิ"
}
```

**Prompt หลัก (ภาษาไทย)**: ระบุทุกจานในรูป, แตกเป็นวัตถุดิบหลักที่มีผลต่อพลังงาน (ข้าว/เส้น, เนื้อสัตว์, ไข่, ผัก, น้ำมัน, น้ำตาล, กะทิ, ซอส) ไม่เกิน ~8 รายการต่อจาน, ประเมินกรัมจากขนาดภาชนะ, **ต้องใส่น้ำมัน/น้ำตาล/กะทิที่ใช้ปรุงตามแบบร้านอาหารไทยทั่วไปเสมอแม้มองไม่เห็น**, `usda_query` เป็นภาษาอังกฤษแบบคำค้น USDA (ระบุสถานะสุก/ดิบ), ถ้าตรงกับคลังให้ใส่ `matched_dish_id`, ห้ามตอบนอก JSON

**UI ตรวจแก้ (`ReviewMeal`)**
- การ์ดต่อจาน แสดงรวม kcal/P/C/F แบบสด
- แต่ละแถววัตถุดิบ: ชื่อ, กรัม (แก้ได้ + ปุ่ม ±10 g), ผลจับคู่ (แตะเพื่อเปลี่ยนเป็นตัวเลือกอื่น)
- ถ้าจับคู่ไม่ได้หรือไม่ถูกใจ: ปุ่ม **"ค้นใน Thai FCD"** → เรียก `/api/thaifcd/search` ด้วย `thai_query` (แก้คำค้นได้) → เลือก → `/api/thaifcd/import` → ใช้ทันที
- ปุ่ม **"ใช้ทั้งจานจาก Thai FCD"** สำหรับเมนูที่มีในกลุ่ม T (อาหารปรุงสำเร็จ) → แทนวัตถุดิบทั้งหมดด้วยรายการเดียว `is_dish = true` + กรัมทั้งจาน
- ทางสุดท้าย: กรอกค่าต่อ 100 g เอง (`source: 'manual'`)
- ปุ่ม "บันทึก" → สร้าง `meal_entry` + `meal_component` และถาม "บันทึกเป็นเมนูในคลังไหม" (ถ้าเป็นเมนูใหม่หรือสูตรเปลี่ยน)

---

## 9. Thai FCD scraper (fallback)

**กติกา**
- เรียก **เฉพาะเมื่อผู้ใช้กดค้น** — ห้ามมี cron, loop หรือ prefetch
- เช็ค `https://inmu.mahidol.ac.th/robots.txt` ก่อนเริ่ม ถ้าห้าม path ที่ใช้ ให้หยุดฟีเจอร์นี้และแจ้งผม
- Rate limit ≤ 1 request/วินาที ผ่านตาราง `rate_limit` (key `thaifcd`), timeout 10 วินาที
- ตั้ง `User-Agent` ที่ระบุว่าเป็นแอปส่วนตัวพร้อมช่องทางติดต่อ (จาก env `SCRAPER_CONTACT`)
- รายการที่ import แล้วเก็บใน `ingredient` (`source: 'thaifcd'`, `source_id` = Food Code, `source_url`) — ครั้งต่อไปค้นจาก DB ก่อนเสมอ
- Cache ผลค้นหา (คำค้น → รายการ) ในตาราง `http_cache` อายุ 30 วัน

**ขั้นตอนพัฒนา**
1. **แกะกลไกการค้นก่อนเขียนโค้ด**: หน้า `https://inmu.mahidol.ac.th/thaifcd/foodsearch/food_name` เป็นฟอร์ม (dropdown กลุ่มอาหาร A–Z + ช่อง Food Name + ปุ่ม Search) ผลน่าจะโหลดด้วย JS — ให้ดู HTML/JS ของหน้า (หรือใช้ browser tool ถ้ามี) เพื่อหา endpoint จริง, method, พารามิเตอร์, รูปแบบ response (HTML/JSON), และว่าต้องมี cookie/CSRF token หรือไม่ บันทึกผลไว้ใน `server/thaifcd/README.md` — ถ้าแกะไม่ได้ให้หยุดและขอให้ผมส่ง request จาก DevTools มาให้
2. เก็บ HTML/JSON ตัวอย่างจริง 2–3 ชุดไว้ใน `__fixtures__/` แล้วเขียน `parse.ts` + unit test จาก fixture
3. Parser ต้องดึง: Food Code, ชื่อไทย, ชื่ออังกฤษ, กลุ่ม, และค่าต่อ 100 g ส่วนที่กินได้ของ energy (kcal), protein, fat, carbohydrate, dietary fibre, sodium — แปลงหน่วยให้ตรง schema, ค่า "NA"/"ND"/"Trace" ให้เป็น `null`/`0` ตามความหมาย
4. ถ้าโครง HTML เปลี่ยนจน parse ไม่ได้ → คืน error ที่อ่านรู้เรื่อง และ UI เสนอให้กรอกเอง (ไม่ crash)

**เครดิต (หน้า About + ใต้ค่าที่มาจาก Thai FCD)**
> Kunchit Judprasong, Prapasri Puwastien, Nipa Rojroongwasinkul, Anadi Nitithamyong, Piyanut Sridonpai, Amnat Somjai. Institute of Nutrition, Mahidol University (2025). Thai Food Composition Database, Online version 3, August 2025, Thailand. https://inmu.mahidol.ac.th/thaifcd/home

และสำหรับ USDA: "Source: U.S. Department of Agriculture, Agricultural Research Service. FoodData Central. fdc.nal.usda.gov"

---

## 10. Import ข้อมูล USDA (`scripts/import-usda.ts`)

- ดาวน์โหลด bulk CSV ของ **SR Legacy** จากหน้า Download ของ FoodData Central (ไม่ต้องใช้ API key) ใส่ไว้ใน `data/usda/` (ไม่ commit — ใส่ `.gitignore`)
- อ่าน `food.csv`, `nutrient.csv`, `food_nutrient.csv` แล้ว pivot เป็น 1 แถวต่ออาหาร
- ใช้ nutrient จาก `nutrient.csv` โดยจับคู่ชื่อ/หน่วย: Energy (KCAL), Protein, Total lipid (fat), Carbohydrate by difference, Fiber total dietary, Sodium — **อย่า hardcode nutrient id โดยไม่ตรวจกับไฟล์จริง**
- รันจากเครื่องตัวเองด้วย `DATABASE_URL` ของ Neon (ใช้ driver แบบ TCP/WebSocket ได้ในสคริปต์), insert แบบ batch + `ON CONFLICT (source, source_id) DO UPDATE` ให้รันซ้ำได้
- ใช้ Neon branch แยกสำหรับ dev (สร้างจาก Vercel/Neon dashboard) แล้วค่อยรันกับ main ตอน deploy
- (ไม่บังคับ) เติม `name_th` ให้วัตถุดิบที่ใช้บ่อย ~200 รายการด้วยมือหรือให้ Gemini แปลครั้งเดียวแล้วตรวจ

---

## 11. แดชบอร์ด

- **วันนี้:** วงแหวนพลังงาน (กินแล้ว/เป้า), 3 แท่ง P/C/F, รายการมื้อแยกตามประเภท
- **ย้อนหลัง:** กราฟแท่งพลังงาน 7/30 วัน + เส้นเป้า, macro เฉลี่ย
- **น้ำหนัก:** กราฟเส้น + ค่าเฉลี่ยเคลื่อนที่ 7 วัน
- **เมนูประจำ:** แถบ "กินบ่อย" (เรียงตาม `use_count`) แตะครั้งเดียวบันทึกได้เลย
- รองรับมือถือเป็นหลัก (ความกว้าง ~375px), ปุ่ม + ลอยมุมขวาล่างสำหรับเพิ่มมื้อ
- เผื่อพื้นที่ด้านล่างไม่ให้ทับ navigation bar ของ LIFF browser (safe-area-inset)
- แสดง skeleton ระหว่างรอ request แรก (Neon อาจกำลังตื่นจาก suspend)

---

## 12. ลำดับการทำ (แต่ละเฟสต้องรันได้ก่อนไปต่อ)

**เฟส 0 — โครงโปรเจกต์**
- Clone `https://github.com/aragamix01/nutrition-app` (ถ้า repo ว่าง: `git init -b main` แล้ว `git remote add origin https://github.com/aragamix01/nutrition-app.git`), ตั้ง git author + ปิด co-author ตามหัวข้อ 3.1, สร้าง `.gitignore` ก่อนไฟล์อื่น
- Next.js (App Router) TS + Tailwind + ESLint/Prettier + Vitest
- `app/api/[[...route]]/route.ts` + Hono, Drizzle + drizzle-kit + migration แรก (ไม่ต้องมี `vercel.json` — Next จัดการ routing เอง)
- รัน local ด้วย `next dev` (หน้าเว็บ + API ใน process เดียว) โดยใช้ `.env.local` ที่ได้จาก `vercel env pull`
- ✅ หน้าเว็บเปิดได้, `GET /api/health` ตอบ ok และ query DB ได้, push `main` แล้ว Vercel deploy ผ่าน (หน้าว่าง + health ok บนโดเมน `*.vercel.app`)

**เฟส 1 — สูตร + โปรไฟล์**
- `src/lib/nutrition.ts` + test, หน้า Profile, `/api/profile`, `/api/weight`
- ✅ กรอกโปรไฟล์แล้วเห็น BMR/TDEE/เป้า macro ถูกตาม test

**เฟส 2 — ฐานข้อมูลวัตถุดิบ USDA**
- `scripts/import-usda.ts`, ตาราง `ingredient` + index ค้นหา, `/api/ingredients/search`
- ✅ ค้น "rice white cooked" ได้ผลพร้อมค่าต่อ 100 g ที่สมเหตุสมผล

**เฟส 3 — บันทึกมื้อแบบเลือกวัตถุดิบเอง + คลังเมนู**
- `/api/meals`, `/api/dishes`, หน้า AddMeal (พิมพ์/เลือกจากคลัง) และ ReviewMeal
- ✅ ประกอบจานจากวัตถุดิบ บันทึกแล้วยอดของวันเปลี่ยน และบันทึกเป็นเมนูในคลังได้

**เฟส 4 — แดชบอร์ด**
- `/api/summary*`, หน้า Dashboard และ History ด้วย Recharts
- ✅ `scripts/seed-demo.ts` ใส่ข้อมูลปลอม 14 วัน แสดงกราฟครบ

**เฟส 5 — AI รูปอาหาร**
- `src/lib/image.ts`, `server/gemini.ts`, `/api/analyze`, เชื่อมกับ ReviewMeal
- ตั้ง `maxDuration` ของ function ให้พอ, จัดการ 429/timeout: แสดงข้อความและให้กรอกเองแทน
- ✅ ถ่ายรูปเมนูใหม่ → ได้รายการวัตถุดิบที่จับคู่แล้ว → แก้ → บันทึก; ถ่ายเมนูที่มีในคลัง → AI จับคู่กับคลังได้

**เฟส 6 — Thai FCD fallback**
- ทำตามหัวข้อ 9 ทุกขั้น (แกะ endpoint → fixture → parser + test → client + rate limit → UI)
- ✅ วัตถุดิบที่ USDA ไม่มี ค้นใน Thai FCD แล้ว import ใช้ได้; ค้นซ้ำครั้งที่สองไม่ยิงเว็บภายนอก

**เฟส 7 — LINE + deploy**
- `src/lib/liff.ts` (ใช้ liff-mock เมื่อ `process.env.NODE_ENV === 'development'`, โหลด LIFF ฝั่ง client เท่านั้น), แนบ ID token, middleware ตรวจ token + allowlist
- ตั้ง env vars ใน Vercel (Production + Preview), รัน migration + import USDA กับ Neon branch main, push `main` เพื่อ deploy Production
- ✅ เปิดจากลิงก์ LIFF ในแชท LINE ของตัวเองแล้วใช้งานได้, บัญชีอื่นได้ 403

**เฟส 8 — ขัดเกลา (ทำทีหลังได้)**
- Export ข้อมูลเป็น CSV, โหมดมืด, PWA สำหรับเปิดนอก LINE
- อ่านฉลากโภชนาการจากรูป (โหมดเพิ่มใน `/api/analyze`)
- Rich menu ใน LINE OA ส่วนตัวเพื่อกดเปิดแอปเร็วๆ (ไม่บังคับ)

---

## 13. งานที่ต้องทำเองนอกโค้ด (ทำครั้งเดียว)

1. **GitHub** → ตั้ง repo `aragamix01/nutrition-app` เป็น private และยืนยันว่า `aragamix01@gmail.com` เป็น email ที่ verify แล้วในบัญชี
2. **Vercel** → Add New Project → Import Git Repository → เลือก `aragamix01/nutrition-app` (Framework preset: Next.js, Production branch: `main`) → แท็บ Storage/Marketplace → เพิ่ม **Neon** แผน Free → `DATABASE_URL` จะถูกใส่ให้อัตโนมัติ → บนเครื่อง `vercel link` แล้ว `vercel env pull .env.local`
3. **LINE Developers Console** → สร้าง Provider → สร้าง **LINE Login channel** → เพิ่ม LIFF app (size: Full, scope: `openid`, `profile`) ใส่ Endpoint URL เป็นโดเมน `*.vercel.app` ของโปรเจกต์
   - ใช้ LIFF บน LINE Login channel เพราะไม่ต้องผ่านขั้นตอนนโยบาย/รีวิวของ MINI App — ถ้าต่อไปจะเผยแพร่ค่อยย้ายเป็น LINE MINI App
   - ช่องทางอยู่ในสถานะ Developing ก็ใช้ได้กับบัญชี admin/tester ของตัวเอง
4. **Google AI Studio** → สร้าง API key
5. ดาวน์โหลด USDA SR Legacy CSV ใส่ `data/usda/`
6. หา LINE userId ของตัวเอง (log `sub` ครั้งแรกที่ login) แล้วใส่ใน `ALLOWED_LINE_USER_ID`

---

## 14. ข้อควรระวัง

- **Vercel Hobby กับ commit จาก AI:** Hobby อนุญาตให้ deploy เฉพาะเจ้าของบัญชี มีรายงานว่า deployment ถูกบล็อกเพราะ commit มี co-author อื่น (เช่น trailer `Co-Authored-By` ของ Claude Code) แม้ Vercel จะประกาศว่า Claude Code ไม่นับเป็นสมาชิกแล้วก็ตาม
  - ป้องกันไว้ก่อนตามหัวข้อ 3.1 (author = `aragamix01@gmail.com`, ไม่มี `Co-Authored-By`)
  - ถ้ายังโดนบล็อก: ตรวจ `git log --format='%an <%ae>%n%b'` หา author/co-author แปลกปลอม, แก้แล้ว push ใหม่ หรือ deploy ด้วย `vercel --prod` จาก CLI ชั่วคราว
- ตัวเลขจาก AI เป็นค่าประมาณ ความคลาดเคลื่อนหลักมาจากกรัมและน้ำมันที่มองไม่เห็น — UI ต้องแก้กรัมได้ง่ายเสมอ
- ลำดับความเชื่อถือ: คลังเมนูของฉัน > ฉลากโภชนาการ > Thai FCD/USDA > ค่าที่ AI เดา
- ค่าใน Thai FCD และ USDA เป็นต่อ 100 g ส่วนที่กินได้ ระวังสถานะดิบ/สุก (ข้าวสุกกับข้าวสารต่างกันมาก)
- ชื่อรุ่นและโควตาฟรีของ Gemini, ข้อจำกัดของ Vercel Hobby และ Neon Free เปลี่ยนได้ → ตรวจเอกสารปัจจุบันก่อนตั้งค่า
- ห้าม commit `.env*`, API key หรือไฟล์ข้อมูล USDA ดิบ
