# Thai FCD fallback: how the site works

Investigated 2026-10-21 against `https://inmu.mahidol.ac.th/thaifcd/` (Thai Food Composition Database,
Online version 3, INMU). Used only when the user presses search: no cron, no prefetch, no crawling.

## robots.txt

`https://inmu.mahidol.ac.th/robots.txt` returns **404**, so there are no crawl rules to honour. We still
limit ourselves to ≤ 1 request/second, send an identifying `User-Agent` with a contact address
(`SCRAPER_CONTACT`), cache searches for 30 days, and never re-fetch an item already imported.

## Search page

`GET /thaifcd/foodsearch/food_name` is a form (food group dropdown + food name + Search button) that loads
its results with jQuery. Two endpoints matter:

### 1. Name search (the page's autocomplete): JSON

```
GET /thaifcd/appassistant/get_json_food_name?food_group_id=<id or empty>&term=<text>
→ 200 application/json, UTF-8 **with a BOM**
[{"dbcode":"STD","id":"1554","name":"Fried rice with pork, vegetable and egg"}, ...]
```

- `id` is an **internal** id (needed for the detail request), not the Food Code.
- `term` is matched as **one substring of the English name** (case-insensitive):
  `rice cooked` matches "Khao-mun (Rice cooked in …)", but `rice, cooked` and `cooked rice` match nothing.
  Thai text always returns `[]`. So the client sends **one word** (the longest of the query) and ranks the
  results locally by how many query words they contain.
- No cookie or CSRF token is required. The whole matching list comes back (e.g. 151 rows for `rice`).
- Food groups (`food_group_id`): A 70 cereals · B 71 tubers · C 73 legumes/nuts · D 74 vegetables ·
  E 75 fruits · F 76 meat · G 77 fish/shellfish · H 78 eggs · J 79 milk · K 80 fats/oils · M 81 sugars ·
  N 72 spices/condiments · Q 82 beverages · S 83 fast foods · **T 84 mixed ready-to-eat dishes** ·
  U 85 misc · Z 69 branded.

### 2. Item detail: HTML fragment

```
GET /thaifcd/foodsearch/food_name_result?mode=food_group_result&selected_id=<id>&selected_dbcode=STD
    &selected_name=<name>&food_name=<name>&food_group_id=&page_no=1&status=A
→ 200 text/html (fragment, BOM-prefixed)
```

The page JS also appends `ci_csrf_token` from a `ThaiFcd2024Cookie` cookie, but the server answers without
it (and without the `ciSessionThaiFcd2024` session cookie), so we send neither.

The fragment contains:

- Header rows `Food Code:` / `Thai name:` / `English name:` / `Scientific name:`, each value in
  `<div class="… tx_value fw-bold">`. The Food Code's letter prefix is the group (`T56` → T, a dish).
- A table `<tbody id="tbody_food_nutrients">` with one `<tr>` per nutrient:
  `<td>name</td><td>unit</td><td>value per 100 g edible portion</td>…`

Rows we use (value column; `-` means no value):

| Row name                                                        | Unit | → field                                 |
| --------------------------------------------------------------- | ---- | --------------------------------------- |
| `Energy, by calculation` (else `Total energy - by calculation`) | kcal | kcal (required)                         |
| `Protein, total`                                                | g    | protein_g                               |
| `Fat, total`                                                    | g    | fat_g                                   |
| `Carbohydrate, total` (else `available` + `Dietary fibre`)      | g    | carb_g (matches USDA "by difference")   |
| `Dietary fibre`                                                 | g    | fiber_g                                 |
| `Sodium`                                                        | mg   | sodium_mg                               |
| `Density`                                                       | g/mL | used for "per 100 mL" items (see below) |

Value spellings: numbers may contain commas; `-`, `NA`, `N/A` → null (not analysed); `ND` → 0 (not
detected); `Tr` / `Trace` → 0.

**Per 100 mL items** (names like `Oil, corn, refined, per 100 mL` / Thai `ต่อ 100 มล.`): the table header
still says "Per 100 g", but the values are per 100 mL (corn oil: 833 kcal, fat 92.6 with density 0.924).
We divide by the `Density` row to get per 100 g (833 / 0.924 ≈ 901 kcal). Without a density, import fails
with a readable error.

## There are no item permalinks

Results load via the endpoints above. `source_id` stores the Food Code (e.g. `T56`), as the plan asks, and
`source_url` stores the detail request URL with the internal id. That URL is also how we know an item is
already imported, so it is never fetched twice.

## If the site changes

The parser throws `ThaiFcdParseError` (missing header fields or energy) and the API answers 502 with a
Thai message; the UI then offers manual entry. Fixtures in `__fixtures__/` are real responses trimmed to
the parts the parser reads; refresh them and the tests if the markup changes.

## Credit (shown on About and under Thai FCD values)

Kunchit Judprasong, Prapasri Puwastien, Nipa Rojroongwasinkul, Anadi Nitithamyong, Piyanut Sridonpai,
Amnat Somjai. Institute of Nutrition, Mahidol University (2025). Thai Food Composition Database, Online
version 3, August 2025, Thailand. https://inmu.mahidol.ac.th/thaifcd/home
