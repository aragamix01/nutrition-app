'use client';

import Link from 'next/link';
import { useState } from 'react';
import { api } from '@/src/lib/api';
import { useIngredientSearch, type IngredientHit, type MealType } from '@/src/lib/queries';
import { Button, fmt, MEAL_TYPES, PlusIcon, Skeleton, SourceTag } from './ui';

export function BackHeader({ title, href = '/' }: { title: string; href?: string }) {
  return (
    <header style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <Link
        href={href}
        aria-label="ย้อนกลับ"
        className="icon-btn"
        style={{ textDecoration: 'none', fontSize: 22 }}
      >
        ‹
      </Link>
      <h1 className="title" style={{ margin: 0 }}>
        {title}
      </h1>
    </header>
  );
}

export function MealTypeSeg({
  value,
  onChange,
}: {
  value: MealType;
  onChange: (v: MealType) => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="มื้อ"
      className="seg"
      style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}
    >
      {(Object.keys(MEAL_TYPES) as MealType[]).map((t) => (
        <button
          key={t}
          type="button"
          role="radio"
          aria-checked={value === t}
          onClick={() => onChange(t)}
        >
          {MEAL_TYPES[t]}
        </button>
      ))}
    </div>
  );
}

export function SearchField({
  value,
  onChange,
  placeholder,
  label,
  autoFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  label: string;
  autoFocus?: boolean;
}) {
  return (
    <label className="field" style={{ borderRadius: 999, paddingInline: 16 }}>
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        aria-hidden
        style={{ color: 'var(--ink-muted)', flex: 'none' }}
      >
        <circle cx="11" cy="11" r="6" stroke="currentColor" strokeWidth="1.75" fill="none" />
        <path d="M20 20l-4.5-4.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
      </svg>
      <input
        type="search"
        className="text-input"
        aria-label={label}
        placeholder={placeholder}
        value={value}
        autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

export const ingredientName = (i: IngredientHit) => i.nameTh ?? i.nameEn;

/** Bottom sheet: search ingredients, or enter per-100 g values by hand when nothing fits. */
function HitButton({ hit: h, onPick }: { hit: IngredientHit; onPick: (i: IngredientHit) => void }) {
  return (
    <button type="button" className="list-btn" onClick={() => onPick(h)}>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', fontWeight: 600 }}>{ingredientName(h)}</span>
        {h.nameTh && (
          <span className="caption nu-muted" style={{ display: 'block' }}>
            {h.nameEn}
          </span>
        )}
        <span className="caption nu-muted">
          {fmt(h.kcal)} kcal · P {fmt(h.proteinG)} C {fmt(h.carbG)} F {fmt(h.fatG)} / 100 g
        </span>
      </span>
      <SourceTag source={h.source} />
    </button>
  );
}

export function IngredientPicker({
  title,
  onPick,
  onRemove,
  onClose,
  initialQuery = '',
  suggestions = [],
  manualName,
  thaiQuery = '',
  startMode = 'db',
  thaiGroup,
}: {
  title: string;
  onPick: (i: IngredientHit) => void;
  onRemove?: () => void;
  onClose: () => void;
  /** Pre-filled search, e.g. the AI's usda_query for this ingredient. */
  initialQuery?: string;
  /** The AI's other candidate matches, shown above the search results. */
  suggestions?: IngredientHit[];
  /** Name to pre-fill when entering values by hand (the AI's Thai name). */
  manualName?: string;
  /** Pre-filled Thai FCD search (the AI's thai_query). */
  thaiQuery?: string;
  startMode?: 'db' | 'thaifcd';
  /** Limit Thai FCD to one food group, e.g. T (ready-to-eat dishes). */
  thaiGroup?: string;
}) {
  const [q, setQ] = useState(initialQuery);
  const [mode, setMode] = useState<'db' | 'manual' | 'thaifcd'>(startMode);
  const search = useIngredientSearch(q);
  const hits = search.data?.ingredients ?? [];

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 className="heading" style={{ margin: 0 }}>
            {title}
          </h2>
          <Button variant="ghost" size="sm" onClick={onClose}>
            ปิด
          </Button>
        </div>

        {mode === 'thaifcd' ? (
          <ThaiFcdSearch
            initialQuery={thaiQuery || q}
            group={thaiGroup}
            onPick={onPick}
            onManual={() => setMode('manual')}
            onBack={startMode === 'db' ? () => setMode('db') : undefined}
          />
        ) : mode === 'manual' ? (
          <ManualIngredientForm
            initialName={manualName ?? q}
            onCreated={onPick}
            onCancel={() => setMode(startMode)}
          />
        ) : (
          <>
            <SearchField
              value={q}
              onChange={setQ}
              label="ค้นหาวัตถุดิบ"
              placeholder="เช่น rice white cooked, ไข่ดาว"
              autoFocus
            />
            {suggestions.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span className="label nu-muted">ตัวเลือกอื่นที่ใกล้เคียง</span>
                {suggestions.map((h) => (
                  <HitButton key={h.id} hit={h} onPick={onPick} />
                ))}
                <span className="label nu-muted" style={{ marginTop: 6 }}>
                  ผลค้นหา
                </span>
              </div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minHeight: 120 }}>
              {search.isFetching && !hits.length && <Skeleton shape="lg" height={56} />}
              {search.isError && (
                <p className="caption nu-text-chili" style={{ margin: 0 }}>
                  ค้นหาไม่สำเร็จ: {search.error.message}
                </p>
              )}
              {hits.map((h) => (
                <HitButton key={h.id} hit={h} onPick={onPick} />
              ))}
              {q.trim() && !search.isFetching && search.isSuccess && !hits.length && (
                <p className="caption nu-muted" style={{ margin: 0, textAlign: 'center' }}>
                  ไม่พบ “{q.trim()}”
                </p>
              )}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <Button variant="quiet" style={{ flex: 1 }} onClick={() => setMode('thaifcd')}>
                ค้นใน Thai FCD
              </Button>
              <Button variant="quiet" style={{ flex: 1 }} onClick={() => setMode('manual')}>
                กรอกค่าเอง
              </Button>
            </div>
            {onRemove && (
              <Button variant="ghost" block onClick={onRemove} style={{ color: 'var(--chili)' }}>
                ลบวัตถุดิบนี้ออก
              </Button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function ManualIngredientForm({
  initialName,
  onCreated,
  onCancel,
}: {
  initialName: string;
  onCreated: (i: IngredientHit) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initialName);
  const [v, setV] = useState({ kcal: '', proteinG: '', carbG: '', fatG: '' });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const nums = Object.fromEntries(Object.entries(v).map(([k, x]) => [k, Number(x)])) as Record<
    keyof typeof v,
    number
  >;
  const valid =
    name.trim() && Object.values(v).every((x) => x !== '' && Number.isFinite(Number(x)));

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const { ingredient } = await api<{ ingredient: IngredientHit }>('/ingredients', {
        method: 'POST',
        json: { nameTh: name.trim(), ...nums },
      });
      onCreated(ingredient);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const fields = [
    ['kcal', 'พลังงาน', 'kcal'],
    ['proteinG', 'โปรตีน', 'g'],
    ['carbG', 'คาร์บ', 'g'],
    ['fatG', 'ไขมัน', 'g'],
  ] as const;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <p className="caption nu-muted" style={{ margin: 0 }}>
        ใส่ค่าต่อ 100 g (ดูจากฉลากโภชนาการได้)
      </p>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span className="label nu-muted">ชื่อวัตถุดิบ</span>
        <span className="field">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={{ fontFamily: 'var(--font-sans)', fontSize: 15 }}
          />
        </span>
      </label>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        {fields.map(([k, label, unit]) => (
          <label key={k} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span className="label nu-muted">{label}</span>
            <span className="field">
              <input
                type="number"
                inputMode="decimal"
                value={v[k]}
                onChange={(e) => setV({ ...v, [k]: e.target.value })}
              />
              <span className="caption nu-muted">{unit}</span>
            </span>
          </label>
        ))}
      </div>
      {error && (
        <p className="caption nu-text-chili" role="alert" style={{ margin: 0 }}>
          {error}
        </p>
      )}
      <div style={{ display: 'flex', gap: 8 }}>
        <Button variant="quiet" onClick={onCancel} style={{ flex: 1 }}>
          กลับไปค้นหา
        </Button>
        <Button variant="primary" disabled={!valid || saving} onClick={save} style={{ flex: 1 }}>
          {saving ? 'กำลังบันทึก…' : 'เพิ่มวัตถุดิบ'}
        </Button>
      </div>
    </div>
  );
}

/** Dish row for the library lists: tap to review/edit, "+" to log one serving right away. */
export function DishRow({
  name,
  kcal,
  useCount,
  href,
  onQuickLog,
  logging,
}: {
  name: string;
  kcal: number;
  useCount: number;
  href: string;
  onQuickLog: () => void;
  logging?: boolean;
}) {
  return (
    <div
      className="nu-card"
      style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 8px 8px 16px' }}
    >
      <Link
        href={href}
        style={{
          flex: 1,
          minWidth: 0,
          color: 'var(--ink)',
          textDecoration: 'none',
          padding: '6px 0',
        }}
      >
        <span className="heading" style={{ display: 'block', fontSize: 16, lineHeight: '23px' }}>
          {name}
        </span>
        <span className="caption nu-muted">
          {fmt(kcal)} kcal{useCount ? ` · กิน ${useCount} ครั้ง` : ''}
        </span>
      </Link>
      <button
        type="button"
        className="icon-btn"
        aria-label={`บันทึก ${name} ทันที`}
        disabled={logging}
        onClick={onQuickLog}
      >
        <PlusIcon size={18} width={2.5} />
      </button>
    </div>
  );
}

type ThaiFcdResult = { id: string; name: string; imported: IngredientHit | null };

export const THAI_FCD_CREDIT =
  'ข้อมูลจาก Thai Food Composition Database, Institute of Nutrition, Mahidol University (2025)';

/**
 * Searches the Thai FCD website. External, rate-limited and English-only, so it runs only when the
 * user presses search (never while typing); picking an item imports it once, then reuses it.
 */
function ThaiFcdSearch({
  initialQuery,
  group,
  onPick,
  onManual,
  onBack,
}: {
  initialQuery: string;
  group?: string;
  onPick: (i: IngredientHit) => void;
  onManual: () => void;
  onBack?: () => void;
}) {
  const [q, setQ] = useState(initialQuery);
  const [results, setResults] = useState<ThaiFcdResult[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const search = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!q.trim()) return;
    setBusy('search');
    setError(null);
    try {
      const params = new URLSearchParams({ q: q.trim(), ...(group && { group }) });
      setResults((await api<{ results: ThaiFcdResult[] }>(`/thaifcd/search?${params}`)).results);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const choose = async (r: ThaiFcdResult) => {
    if (r.imported) return onPick(r.imported);
    setBusy(r.id);
    setError(null);
    try {
      const { ingredient } = await api<{ ingredient: IngredientHit }>('/thaifcd/import', {
        method: 'POST',
        json: { id: r.id, name: r.name },
      });
      onPick(ingredient);
    } catch (err) {
      setError((err as Error).message);
      setBusy(null);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <form onSubmit={search} style={{ display: 'flex', gap: 8 }}>
        <div style={{ flex: 1 }}>
          <SearchField
            value={q}
            onChange={setQ}
            label="ค้นใน Thai FCD"
            placeholder="ชื่อภาษาอังกฤษ เช่น fried rice"
            autoFocus
          />
        </div>
        <Button type="submit" variant="primary" disabled={!q.trim() || busy != null}>
          {busy === 'search' ? 'กำลังค้น…' : 'ค้น'}
        </Button>
      </form>
      <p className="caption nu-muted" style={{ margin: 0 }}>
        {group === 'T' ? 'เฉพาะอาหารปรุงสำเร็จ (กลุ่ม T) · ' : ''}ค้นด้วยชื่อภาษาอังกฤษ · ค่าต่อ 100
        g
      </p>
      {error && (
        <p className="caption nu-text-chili" role="alert" style={{ margin: 0 }}>
          {error}
        </p>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minHeight: 80 }}>
        {busy === 'search' && <Skeleton shape="lg" height={56} />}
        {results?.map((r) => (
          <button
            key={r.id}
            type="button"
            className="list-btn"
            disabled={busy != null}
            onClick={() => choose(r)}
          >
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: 'block', fontWeight: 600 }}>
                {r.imported ? ingredientName(r.imported) : r.name}
              </span>
              <span className="caption nu-muted">
                {r.imported
                  ? `${r.name} · ${fmt(r.imported.kcal)} kcal / 100 g`
                  : busy === r.id
                    ? 'กำลังดึงข้อมูล…'
                    : 'แตะเพื่อดึงข้อมูล'}
              </span>
            </span>
            <SourceTag source="thaifcd">{r.imported ? 'นำเข้าแล้ว' : 'Thai FCD'}</SourceTag>
          </button>
        ))}
        {results && !results.length && (
          <p className="caption nu-muted" style={{ margin: 0, textAlign: 'center' }}>
            ไม่พบใน Thai FCD — ลองคำอื่น หรือกรอกค่าเอง
          </p>
        )}
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        {onBack && (
          <Button variant="quiet" style={{ flex: 1 }} onClick={onBack}>
            กลับไปค้นในแอป
          </Button>
        )}
        <Button variant="quiet" style={{ flex: 1 }} onClick={onManual}>
          กรอกค่าเอง
        </Button>
      </div>
      <p className="caption nu-muted" style={{ margin: 0, fontSize: 11 }}>
        {THAI_FCD_CREDIT}
      </p>
    </div>
  );
}
