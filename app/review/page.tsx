'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import {
  BackHeader,
  IngredientPicker,
  ingredientName,
  MealTypeSeg,
  THAI_FCD_CREDIT,
} from '@/src/components/meal';
import { Button, fmt, IngredientRow, PlusIcon, Skeleton } from '@/src/components/ui';
import { api } from '@/src/lib/api';
import { clearDrafts, loadDraft } from '@/src/lib/draft';
import { sumComponents } from '@/src/lib/nutrition';
import {
  mealTypeNow,
  useDish,
  type Dish,
  type IngredientHit,
  type MealType,
} from '@/src/lib/queries';

type Row = {
  key: number;
  /** null = the AI named an ingredient we couldn't find; must be matched (or set to 0 g) before saving. */
  ingredient: IngredientHit | null;
  grams: number;
  /** The AI's name for this ingredient (shown instead of the database name). */
  label?: string;
  alternatives?: IngredientHit[];
  query?: string;
  /** The AI's Thai FCD-style English name, for the Thai FCD fallback search. */
  thaiQuery?: string;
};
type Picker = { replace: number | null; mode?: 'thaifcd'; wholeDish?: boolean };
type AiInfo = { notes: string; confidence: number; index: number; total: number };
type Draft = {
  name: string;
  type: MealType;
  dish: Dish | null;
  rows: Row[];
  portion: number;
  ai: AiInfo | null;
};

const PORTIONS = [0.5, 1, 1.5, 2];
let nextKey = 1;

const recipeKey = (name: string, rows: Row[]) =>
  JSON.stringify([name.trim(), rows.map((r) => [r.ingredient?.id ?? null, r.grams])]);

function Review() {
  const params = useSearchParams();
  const draftIndex = params.get('draft') != null ? Number(params.get('draft')) : null;
  // This boundary renders client-side only (useSearchParams), so sessionStorage is available here.
  const [draft] = useState(() => (draftIndex != null ? loadDraft(draftIndex) : null));
  const dishParam = params.get('dish') ? Number(params.get('dish')) : null;
  const dishId = draft ? draft.dish.dishId : dishParam;
  const type = (params.get('type') as MealType) || draft?.mealType || mealTypeNow();
  const dish = useDish(dishId);

  if (draftIndex != null && !draft) {
    return (
      <main className="page">
        <BackHeader title="ตรวจแก้" href="/add" />
        <p className="nu-muted">ไม่พบผลวิเคราะห์รูปนี้แล้ว ลองถ่ายใหม่อีกครั้ง</p>
      </main>
    );
  }
  if (dishId != null && dish.isPending) {
    return (
      <main className="page">
        <BackHeader title="ตรวจแก้" href="/add" />
        <Skeleton shape="lg" height={160} />
        <Skeleton shape="lg" height={240} />
      </main>
    );
  }
  if (dish.isError) {
    return (
      <main className="page">
        <BackHeader title="ตรวจแก้" href="/add" />
        <p className="nu-text-chili">โหลดเมนูไม่สำเร็จ: {dish.error.message}</p>
      </main>
    );
  }

  const d = dish.data?.dish ?? null;
  // Negative keys for loaded rows; rows added later take nextKey (positive).
  const initial: Draft = draft
    ? {
        name: draft.dish.nameTh,
        type,
        dish: d,
        rows: draft.dish.ingredients.map((i, n) => ({
          key: -(n + 1),
          ingredient: i.match,
          grams: i.grams,
          label: draft.dish.source === 'ai' ? i.nameTh : undefined,
          alternatives: i.alternatives,
          query: i.usdaQuery || i.nameTh,
          thaiQuery: i.thaiQuery,
        })),
        portion: draft.dish.portionMultiplier,
        ai: {
          notes: draft.notes,
          confidence: draft.dish.confidence,
          index: draftIndex!,
          total: draft.total,
        },
      }
    : {
        name: d?.nameTh ?? '',
        type,
        dish: d,
        rows: (d?.components ?? []).map((c, n) => ({
          key: -(n + 1),
          ingredient: c.ingredient,
          grams: c.grams,
        })),
        portion: 1,
        ai: null,
      };
  return <ReviewForm key={`${draftIndex ?? ''}-${d?.id ?? 'new'}`} initial={initial} />;
}

function matchLabel(r: Row): string | null {
  const i = r.ingredient;
  if (!i) return null;
  if (r.label) return i.nameTh && i.nameTh !== r.label ? i.nameTh : i.nameEn;
  return i.nameTh ? i.nameEn : 'เปลี่ยนวัตถุดิบ';
}

function ReviewForm({ initial }: { initial: Draft }) {
  const router = useRouter();
  const qc = useQueryClient();
  const [name, setName] = useState(initial.name);
  const [type, setType] = useState(initial.type);
  const [portion, setPortion] = useState(initial.portion);
  const [rows, setRows] = useState<Row[]>(initial.rows);
  const [picker, setPicker] = useState<Picker | null>(null);
  const [toLibrary, setToLibrary] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const kept = rows.filter((r) => r.grams > 0);
  const matched = kept.filter(
    (r): r is Row & { ingredient: IngredientHit } => r.ingredient != null,
  );
  const unmatched = kept.length - matched.length;
  const t = sumComponents(
    matched.map((r) => ({ per100: r.ingredient, grams: r.grams })),
    portion,
  );
  const changed = recipeKey(name, kept) !== recipeKey(initial.name, initial.rows);
  const libraryOption = initial.dish
    ? changed
      ? 'อัปเดตสูตรในคลังด้วย'
      : null
    : 'บันทึกเข้าคลังด้วย';
  const canSave = name.trim() && matched.length && !unmatched && !saving;
  const portions = [...new Set([...PORTIONS, initial.portion])].sort((a, b) => a - b);
  const pickerRow = picker?.replace != null ? rows.find((r) => r.key === picker.replace) : null;

  const setGrams = (key: number, grams: number) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, grams } : r)));

  const pick = (i: IngredientHit) => {
    if (picker?.wholeDish) {
      // One ready-to-eat item for the whole plate, keeping the estimated plate weight.
      const plate = kept.reduce((a, r) => a + r.grams, 0);
      setRows([{ key: nextKey++, ingredient: i, grams: plate || 300 }]);
      if (!name.trim() && i.nameTh) setName(i.nameTh);
    } else if (picker?.replace != null) {
      setRows((rs) => rs.map((r) => (r.key === picker.replace ? { ...r, ingredient: i } : r)));
    } else {
      setRows((rs) => [...rs, { key: nextKey++, ingredient: i, grams: 100 }]);
    }
    setPicker(null);
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    const components = matched.map((r) => ({ ingredientId: r.ingredient.id, grams: r.grams }));
    try {
      let dishId = initial.dish?.id;
      if (libraryOption && toLibrary) {
        const body = {
          nameTh: name.trim(),
          nameAliases: initial.dish?.nameAliases ?? [],
          components,
        };
        const { dish } = dishId
          ? await api<{ dish: Dish }>(`/dishes/${dishId}`, { method: 'PUT', json: body })
          : await api<{ dish: Dish }>('/dishes', { method: 'POST', json: body });
        dishId = dish.id;
      }
      await api('/meals', {
        method: 'POST',
        json: {
          mealType: type,
          nameTh: name.trim(),
          portionMultiplier: portion,
          dishId,
          components,
        },
      });
      await Promise.all(
        ['meals', 'dishes', 'dish', 'range'].map((k) => qc.invalidateQueries({ queryKey: [k] })),
      );
      // More dishes in the same photo: review the next one.
      const ai = initial.ai;
      if (ai && ai.index + 1 < ai.total) {
        router.replace(`/review?draft=${ai.index + 1}&type=${type}`);
        return;
      }
      clearDrafts();
      router.push('/');
    } catch (e) {
      setError((e as Error).message);
      setSaving(false);
    }
  };

  return (
    <>
      <main className="page" style={{ paddingBottom: 220 }}>
        <BackHeader title="ตรวจแก้" href="/add" />
        <MealTypeSeg value={type} onChange={setType} />

        {initial.ai && (
          <section
            role="note"
            style={{
              padding: '12px 16px',
              borderRadius: 20,
              border: '1.5px dashed var(--carb)',
              background: 'var(--carb-soft)',
              display: 'flex',
              flexDirection: 'column',
              gap: 4,
            }}
          >
            <span className="label">
              {initial.dish ? 'AI จำได้ว่าเป็นเมนูในคลัง' : 'AI ประมาณจากรูป'} —
              ตรวจชื่อและกรัมก่อนบันทึก
              {initial.ai.total > 1 && ` · จานที่ ${initial.ai.index + 1}/${initial.ai.total}`}
            </span>
            {initial.ai.confidence < 0.5 && (
              <span className="caption nu-text-chili">AI ไม่ค่อยมั่นใจกับจานนี้</span>
            )}
            {initial.ai.notes && <span className="caption nu-muted">{initial.ai.notes}</span>}
          </section>
        )}

        <section
          className="nu-card"
          style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}
        >
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span className="label nu-muted">ชื่อเมนู</span>
            <span className="field">
              <input
                value={name}
                placeholder="เช่น ข้าวกะเพราหมูสับ"
                onChange={(e) => setName(e.target.value)}
                style={{ fontFamily: 'var(--font-display)' }}
              />
            </span>
          </label>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
            <span className="num-display">{fmt(t.kcal)}</span>
            <span className="caption nu-muted">kcal</span>
          </div>
          <div className="caption nu-muted" style={{ display: 'flex', gap: 12 }}>
            <span>
              <i className="nu-dot nu-bg-protein" />P {fmt(t.proteinG)} g
            </span>
            <span>
              <i className="nu-dot nu-bg-carb" />C {fmt(t.carbG)} g
            </span>
            <span>
              <i className="nu-dot nu-bg-fat" />F {fmt(t.fatG)} g
            </span>
          </div>
          <div
            role="radiogroup"
            aria-label="จำนวนที่กิน"
            className="seg"
            style={{ gridTemplateColumns: `repeat(${portions.length}, 1fr)` }}
          >
            {portions.map((p) => (
              <button
                key={p}
                type="button"
                role="radio"
                aria-checked={portion === p}
                onClick={() => setPortion(p)}
              >
                ×{p}
              </button>
            ))}
          </div>
        </section>

        <section className="nu-card" aria-label="วัตถุดิบ">
          {rows.map((r) => (
            <IngredientRow
              key={r.key}
              name={r.label ?? (r.ingredient ? ingredientName(r.ingredient) : '')}
              matchName={matchLabel(r)}
              source={r.ingredient?.source}
              kcal={r.ingredient ? (r.ingredient.kcal * r.grams) / 100 : null}
              grams={r.grams}
              onGramsChange={(g) => setGrams(r.key, g)}
              onChangeMatch={() => setPicker({ replace: r.key })}
              onFindFallback={() => setPicker({ replace: r.key, mode: 'thaifcd' })}
              fallbackLabel="ไม่พบข้อมูล — ค้นใน Thai FCD"
            />
          ))}
          {!rows.length && (
            <p className="caption nu-muted" style={{ margin: 0, padding: 16, textAlign: 'center' }}>
              ยังไม่มีวัตถุดิบ — เพิ่มอย่างน้อย 1 อย่าง
            </p>
          )}
          <button
            type="button"
            className="list-btn"
            style={{
              borderRadius: 0,
              color: 'var(--basil)',
              fontWeight: 500,
              borderTop: rows.length ? '1px solid var(--line)' : 0,
            }}
            onClick={() => setPicker({ replace: null })}
          >
            <PlusIcon size={18} width={2.5} /> เพิ่มวัตถุดิบ
          </button>
          <button
            type="button"
            className="list-btn"
            style={{
              borderRadius: 0,
              color: 'var(--ink-muted)',
              borderTop: '1px solid var(--line)',
            }}
            onClick={() => setPicker({ replace: null, mode: 'thaifcd', wholeDish: true })}
          >
            <span>
              <span className="label" style={{ display: 'block', color: 'var(--ink)' }}>
                ใช้ทั้งจานจาก Thai FCD
              </span>
              <span className="caption">
                แทนวัตถุดิบทั้งหมดด้วยอาหารปรุงสำเร็จ 1 รายการ (กลุ่ม T)
              </span>
            </span>
          </button>
        </section>
        {rows.some((r) => r.ingredient?.source === 'thaifcd') && (
          <p className="caption nu-muted" style={{ margin: 0 }}>
            {THAI_FCD_CREDIT}
          </p>
        )}
        <p className="caption nu-muted" style={{ margin: 0 }}>
          กรัมเป็นค่าต่อ 1 ที่ · ตั้ง 0 g เพื่อตัดวัตถุดิบออก · อย่าลืมน้ำมัน/น้ำตาลที่ใช้ปรุง
        </p>
      </main>

      <div className="dock" style={{ padding: '0 12px calc(12px + env(safe-area-inset-bottom))' }}>
        <div
          className="nu-card"
          style={{
            padding: 12,
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            boxShadow: 'var(--shadow-float)',
          }}
        >
          {unmatched > 0 && (
            <p
              className="caption nu-text-chili"
              role="status"
              style={{ margin: 0, paddingInline: 4 }}
            >
              ยังมี {unmatched} วัตถุดิบที่ไม่พบข้อมูล — แตะเพื่อเลือก หรือตั้งเป็น 0 g
            </p>
          )}
          {libraryOption && (
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                minHeight: 32,
                paddingInline: 4,
              }}
            >
              <input
                type="checkbox"
                checked={toLibrary}
                onChange={(e) => setToLibrary(e.target.checked)}
                style={{ width: 20, height: 20, accentColor: 'var(--basil)' }}
              />
              <span className="label">{libraryOption}</span>
            </label>
          )}
          {error && (
            <p className="caption nu-text-chili" role="alert" style={{ margin: 0 }}>
              บันทึกไม่สำเร็จ: {error}
            </p>
          )}
          <Button variant="primary" block disabled={!canSave} onClick={save}>
            {saving ? 'กำลังบันทึก…' : `บันทึก ${fmt(t.kcal)} kcal`}
          </Button>
        </div>
      </div>

      {picker && (
        <IngredientPicker
          title={
            picker.wholeDish
              ? 'ใช้ทั้งจานจาก Thai FCD'
              : picker.replace != null
                ? 'เปลี่ยนวัตถุดิบ'
                : 'เพิ่มวัตถุดิบ'
          }
          startMode={picker.mode ?? 'db'}
          thaiGroup={picker.wholeDish ? 'T' : undefined}
          thaiQuery={pickerRow?.thaiQuery}
          onPick={pick}
          onClose={() => setPicker(null)}
          initialQuery={pickerRow?.query ?? ''}
          suggestions={pickerRow?.alternatives ?? []}
          manualName={pickerRow?.label}
          onRemove={
            picker.replace != null && !picker.wholeDish
              ? () => {
                  setRows((rs) => rs.filter((r) => r.key !== picker.replace));
                  setPicker(null);
                }
              : undefined
          }
        />
      )}
    </>
  );
}

/** Remount per URL: moving to the next AI dish only changes ?draft=, and state must start fresh. */
function ReviewByUrl() {
  const params = useSearchParams();
  return <Review key={params.toString()} />;
}

export default function ReviewPage() {
  return (
    <Suspense>
      <ReviewByUrl />
    </Suspense>
  );
}
