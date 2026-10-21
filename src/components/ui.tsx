// React ports of the Nutrition App design system components (Nutri.*).
// Class names match app/styles/components.css.
import type { ButtonHTMLAttributes, ReactNode } from 'react';

export const fmt = (n: number | null | undefined) => Math.round(n ?? 0).toLocaleString('en-US');
const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';
export const MEAL_TYPES: Record<MealType, string> = {
  breakfast: 'เช้า',
  lunch: 'กลางวัน',
  dinner: 'เย็น',
  snack: 'ของว่าง',
};

export type Source = 'library' | 'label' | 'thaifcd' | 'usda' | 'manual' | 'ai';
const SOURCES: Record<Source, { label: string; tone: 'basil' | 'neutral' | 'estimate' }> = {
  library: { label: 'คลังของฉัน', tone: 'basil' },
  label: { label: 'ฉลาก', tone: 'neutral' },
  thaifcd: { label: 'Thai FCD', tone: 'neutral' },
  usda: { label: 'USDA', tone: 'neutral' },
  manual: { label: 'กรอกเอง', tone: 'neutral' },
  ai: { label: 'AI ประมาณ', tone: 'estimate' },
};

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'quiet' | 'ghost' | 'danger';
  size?: 'md' | 'sm';
  block?: boolean;
};

export function Button({ variant = 'quiet', size = 'md', block, className, ...rest }: ButtonProps) {
  return (
    <button
      type="button"
      {...rest}
      className={cx(
        'nu-btn',
        `nu-btn-${variant}`,
        `nu-btn-${size}`,
        block && 'nu-btn-block',
        className,
      )}
    />
  );
}

export function PlusIcon({ size = 24, width = 2.25 }: { size?: number; width?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden>
      <path
        d="M12 5v14M5 12h14"
        stroke="currentColor"
        strokeWidth={width}
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}

export function EnergyRing({
  eaten,
  target,
  size = 176,
  stroke = 14,
}: {
  eaten: number;
  target: number;
  size?: number;
  stroke?: number;
}) {
  const t = target || 1;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const over = eaten > t;
  const frac = Math.min(eaten / t, 1);
  const mid = size / 2;
  return (
    <div
      className={cx('nu-ring', over && 'nu-ring-over')}
      style={{ width: size, height: size }}
      role="img"
      aria-label={`กินแล้ว ${fmt(eaten)} จาก ${fmt(t)} kcal`}
    >
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size}>
        <circle className="nu-ring-track" cx={mid} cy={mid} r={r} strokeWidth={stroke} />
        <circle
          className="nu-ring-fill"
          cx={mid}
          cy={mid}
          r={r}
          strokeWidth={stroke}
          strokeDasharray={c}
          strokeDashoffset={c * (1 - frac)}
          transform={`rotate(-90 ${mid} ${mid})`}
        />
      </svg>
      <div className="nu-ring-center">
        <span className="nu-ring-cap">{over ? 'เกิน' : 'เหลือ'}</span>
        <span className="num-display nu-ring-num">{fmt(Math.abs(t - eaten))}</span>
        <span className="nu-ring-cap">
          {fmt(eaten)} / {fmt(t)} kcal
        </span>
      </div>
    </div>
  );
}

type Macro = { eaten: number; target: number };
const MACROS = [
  ['protein', 'โปรตีน'],
  ['carb', 'คาร์บ'],
  ['fat', 'ไขมัน'],
] as const;

export function MacroBars(p: { protein: Macro; carb: Macro; fat: Macro }) {
  return (
    <div className="nu-macros">
      {MACROS.map(([key, label]) => {
        const v = p[key];
        const over = v.eaten > v.target;
        const pct = Math.min(v.eaten / (v.target || 1), 1) * 100;
        return (
          <div key={key} className="nu-macro">
            <div className="nu-macro-head">
              <span className="nu-macro-label">
                <i className={`nu-dot nu-bg-${key}`} aria-hidden />
                {label}
              </span>
              <span className="num">
                {over && <span className="nu-text-chili">เกิน </span>}
                {fmt(v.eaten)}
                <span className="nu-muted"> / {fmt(v.target)} g</span>
              </span>
            </div>
            <div className="nu-bar">
              <div className={`nu-bar-fill nu-bg-${key}`} style={{ width: `${pct}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function SourceTag({ source, children }: { source: Source; children?: ReactNode }) {
  const s = SOURCES[source] ?? SOURCES.manual;
  return <span className={`nu-tag nu-tag-${s.tone}`}>{children ?? s.label}</span>;
}

export function MealCard(p: {
  name: string;
  kcal: number;
  protein: number;
  carb: number;
  fat: number;
  mealType?: MealType;
  time?: string;
  portion?: number;
  source?: Source;
  onClick?: () => void;
}) {
  const body = (
    <>
      <div className="nu-meal-main">
        <div className="nu-meal-meta">
          {p.mealType && <span>{MEAL_TYPES[p.mealType]}</span>}
          {p.time && <span>{p.time}</span>}
          {p.portion != null && p.portion !== 1 && <span>×{p.portion}</span>}
        </div>
        <div className="heading nu-meal-name">{p.name}</div>
        <div className="nu-meal-macros">
          <span>
            <i className="nu-dot nu-bg-protein" />P {fmt(p.protein)}
          </span>
          <span>
            <i className="nu-dot nu-bg-carb" />C {fmt(p.carb)}
          </span>
          <span>
            <i className="nu-dot nu-bg-fat" />F {fmt(p.fat)} g
          </span>
        </div>
        {p.source && (
          <div className="nu-meal-src">
            <SourceTag source={p.source} />
          </div>
        )}
      </div>
      <div className="nu-meal-kcal">
        <span className="num-lg">{fmt(p.kcal)}</span>
        <span className="nu-muted caption">kcal</span>
      </div>
    </>
  );
  return p.onClick ? (
    <button type="button" onClick={p.onClick} className="nu-card nu-meal nu-meal-tap">
      {body}
    </button>
  ) : (
    <div className="nu-card nu-meal">{body}</div>
  );
}

export function IngredientRow(p: {
  name: string;
  grams: number;
  matchName?: string | null;
  source?: Source;
  kcal?: number | null;
  step?: number;
  onGramsChange?: (g: number) => void;
  onChangeMatch?: () => void;
  onFindFallback?: () => void;
}) {
  const step = p.step ?? 10;
  const g = p.grams;
  const set = (v: number) => p.onGramsChange?.(Math.max(0, Math.round(v)));
  const unmatched = !p.matchName;
  return (
    <div className={cx('nu-ing', unmatched && 'nu-ing-unmatched')}>
      <div className="nu-ing-main">
        <div className="nu-ing-name">{p.name}</div>
        {unmatched ? (
          <button type="button" className="nu-ing-match nu-text-chili" onClick={p.onFindFallback}>
            ไม่พบข้อมูล — ค้นใน Thai FCD
          </button>
        ) : (
          <button type="button" className="nu-ing-match" onClick={p.onChangeMatch}>
            {p.matchName}
            <span aria-hidden> ›</span>
          </button>
        )}
        <div className="nu-ing-foot">
          {p.source && <SourceTag source={p.source} />}
          {p.kcal != null && <span className="nu-muted caption">{fmt(p.kcal)} kcal</span>}
        </div>
      </div>
      <div className="nu-step" role="group" aria-label={`กรัมของ ${p.name}`}>
        <button
          type="button"
          className="nu-step-btn"
          aria-label={`ลด ${step} กรัม`}
          onClick={() => set(g - step)}
        >
          −
        </button>
        <label className="nu-step-field">
          <input
            className="num"
            inputMode="numeric"
            value={g}
            aria-label="กรัม"
            onChange={(e) => {
              const n = parseInt(e.target.value, 10);
              set(Number.isNaN(n) ? 0 : n);
            }}
          />
          <span className="nu-muted caption">g</span>
        </label>
        <button
          type="button"
          className="nu-step-btn"
          aria-label={`เพิ่ม ${step} กรัม`}
          onClick={() => set(g + step)}
        >
          +
        </button>
      </div>
    </div>
  );
}

export function Skeleton({
  shape = 'md',
  width = '100%',
  height = 16,
}: {
  shape?: 'sm' | 'md' | 'lg' | 'pill' | 'circle';
  width?: number | string;
  height?: number | string;
}) {
  return <span className={`nu-skel nu-skel-${shape}`} aria-hidden style={{ width, height }} />;
}
