'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { BackHeader, IngredientPicker, ingredientName, MealTypeSeg } from '@/src/components/meal';
import { Button, fmt, IngredientRow, PlusIcon, Skeleton } from '@/src/components/ui';
import { api } from '@/src/lib/api';
import { sumComponents } from '@/src/lib/nutrition';
import {
  mealTypeNow,
  useDish,
  type Dish,
  type IngredientHit,
  type MealType,
} from '@/src/lib/queries';

type Row = { key: number; ingredient: IngredientHit; grams: number };
type Draft = { name: string; type: MealType; dish: Dish | null; rows: Row[] };

const PORTIONS = [0.5, 1, 1.5, 2];
let nextKey = 1;

const recipeKey = (name: string, rows: Row[]) =>
  JSON.stringify([name.trim(), rows.map((r) => [r.ingredient.id, r.grams])]);

function Review() {
  const params = useSearchParams();
  const dishId = params.get('dish') ? Number(params.get('dish')) : null;
  const type = (params.get('type') as MealType) || mealTypeNow();
  const dish = useDish(dishId);

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
  const initial: Draft = {
    name: d?.nameTh ?? '',
    type,
    dish: d,
    // Negative keys for loaded rows; rows added later take nextKey (positive).
    rows: (d?.components ?? []).map((c, i) => ({
      key: -(i + 1),
      ingredient: c.ingredient,
      grams: c.grams,
    })),
  };
  return <ReviewForm key={d?.id ?? 'new'} initial={initial} />;
}

function ReviewForm({ initial }: { initial: Draft }) {
  const router = useRouter();
  const qc = useQueryClient();
  const [name, setName] = useState(initial.name);
  const [type, setType] = useState(initial.type);
  const [portion, setPortion] = useState(1);
  const [rows, setRows] = useState<Row[]>(initial.rows);
  const [picker, setPicker] = useState<{ replace: number | null } | null>(null);
  const [toLibrary, setToLibrary] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const kept = rows.filter((r) => r.grams > 0);
  const t = sumComponents(
    kept.map((r) => ({ per100: r.ingredient, grams: r.grams })),
    portion,
  );
  const changed = recipeKey(name, kept) !== recipeKey(initial.name, initial.rows);
  const libraryOption = initial.dish
    ? changed
      ? 'อัปเดตสูตรในคลังด้วย'
      : null
    : 'บันทึกเข้าคลังด้วย';
  const canSave = name.trim() && kept.length && !saving;

  const setGrams = (key: number, grams: number) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, grams } : r)));

  const pick = (i: IngredientHit) => {
    if (picker?.replace != null) {
      setRows((rs) => rs.map((r) => (r.key === picker.replace ? { ...r, ingredient: i } : r)));
    } else {
      setRows((rs) => [...rs, { key: nextKey++, ingredient: i, grams: 100 }]);
    }
    setPicker(null);
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    const components = kept.map((r) => ({ ingredientId: r.ingredient.id, grams: r.grams }));
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
        ['meals', 'dishes', 'dish'].map((k) => qc.invalidateQueries({ queryKey: [k] })),
      );
      router.push('/');
    } catch (e) {
      setError((e as Error).message);
      setSaving(false);
    }
  };

  return (
    <>
      <main className="page" style={{ paddingBottom: 200 }}>
        <BackHeader title="ตรวจแก้" href="/add" />
        <MealTypeSeg value={type} onChange={setType} />

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
            style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}
          >
            {PORTIONS.map((p) => (
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
              name={ingredientName(r.ingredient)}
              matchName={r.ingredient.nameTh ? r.ingredient.nameEn : 'เปลี่ยนวัตถุดิบ'}
              source={r.ingredient.source}
              kcal={(r.ingredient.kcal * r.grams) / 100}
              grams={r.grams}
              onGramsChange={(g) => setGrams(r.key, g)}
              onChangeMatch={() => setPicker({ replace: r.key })}
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
        </section>
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
          title={picker.replace != null ? 'เปลี่ยนวัตถุดิบ' : 'เพิ่มวัตถุดิบ'}
          onPick={pick}
          onClose={() => setPicker(null)}
          onRemove={
            picker.replace != null
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

export default function ReviewPage() {
  return (
    <Suspense>
      <Review />
    </Suspense>
  );
}
