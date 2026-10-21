'use client';

import Link from 'next/link';
import { useState, useSyncExternalStore } from 'react';
import { BottomNav } from '@/src/components/BottomNav';
import {
  Button,
  EnergyRing,
  fmt,
  MacroBars,
  MEAL_TYPES,
  MealCard,
  PlusIcon,
  Skeleton,
} from '@/src/components/ui';
import { bangkokDate, dailyTargets, GOAL_RATES } from '@/src/lib/nutrition';
import {
  mealTypeNow,
  useDeleteMeal,
  useDishes,
  useLogMeal,
  useMeals,
  useProfile,
  type Meal,
  type MealType,
} from '@/src/lib/queries';

const dayLabel = () =>
  new Intl.DateTimeFormat('th-TH', {
    timeZone: 'Asia/Bangkok',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).format(new Date());

/** Client-only values: the page is prerendered at build time, and Node's Thai locale data differs from browsers'. */
const useClientValue = <T,>(get: () => T, server: T) =>
  useSyncExternalStore(
    () => () => {},
    get,
    () => server,
  );

const timeOf = (iso: string) =>
  new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Bangkok',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));

const SOFT = ['var(--basil-soft)', 'var(--carb-soft)', 'var(--protein-soft)', 'var(--fat-soft)'];

export default function TodayPage() {
  const label = useClientValue(dayLabel, '');
  const date = useClientValue(bangkokDate, '');
  const profile = useProfile();
  const meals = useMeals(date);
  const dishes = useDishes();
  const log = useLogMeal();
  const del = useDeleteMeal();
  const [selected, setSelected] = useState<number | null>(null);

  const p = profile.data?.profile;
  const w = profile.data?.weight;
  const t = p && w ? dailyTargets({ ...p, goalRate: GOAL_RATES[p.goal] }, w.weightKg) : null;
  const eaten = meals.data?.totals;
  const quick = (dishes.data?.dishes ?? []).slice(0, 6);
  const groups = (Object.keys(MEAL_TYPES) as MealType[]).map((type) => {
    const list = (meals.data?.meals ?? []).filter((m) => m.mealType === type);
    return { type, list, kcal: list.reduce((a, m) => a + m.kcal, 0) };
  });

  return (
    <>
      <main className="page">
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <p className="caption nu-muted" style={{ margin: 0, minHeight: 18 }}>
              {label}
            </p>
            <h1 className="title" style={{ margin: 0 }}>
              วันนี้
            </h1>
          </div>
          {w && (
            <Link
              href="/profile"
              aria-label={`น้ำหนักล่าสุด ${w.weightKg} กิโลกรัม ไปที่โปรไฟล์`}
              style={{
                display: 'inline-flex',
                alignItems: 'baseline',
                gap: 4,
                minHeight: 44,
                boxSizing: 'border-box',
                padding: '10px 16px',
                borderRadius: 999,
                background: 'var(--protein-soft)',
                color: 'var(--ink)',
                textDecoration: 'none',
              }}
            >
              <span className="num">{w.weightKg.toFixed(1)}</span>
              <span className="caption nu-muted">kg</span>
            </Link>
          )}
        </header>

        <section
          className="nu-card"
          style={{
            padding: '24px 16px 20px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 12,
          }}
        >
          {profile.isPending || meals.isPending ? (
            <Skeleton shape="circle" width={184} height={184} />
          ) : t ? (
            <EnergyRing eaten={eaten?.kcal ?? 0} target={t.kcal} size={184} stroke={16} />
          ) : (
            <>
              <p className="heading" style={{ margin: 0 }}>
                ตั้งค่าโปรไฟล์ก่อนนะ
              </p>
              <p className="caption nu-muted" style={{ margin: 0, textAlign: 'center' }}>
                ใส่เพศ อายุ ส่วนสูง น้ำหนัก เพื่อคำนวณเป้าพลังงานต่อวัน
                {eaten ? ` · วันนี้กินแล้ว ${fmt(eaten.kcal)} kcal` : ''}
              </p>
              <Link
                href="/profile"
                className="nu-btn nu-btn-primary nu-btn-md"
                style={{ textDecoration: 'none' }}
              >
                ไปที่โปรไฟล์
              </Link>
            </>
          )}
        </section>

        {t && eaten && (
          <section className="nu-card" style={{ padding: 20 }} aria-label="สารอาหารวันนี้">
            <MacroBars
              protein={{ eaten: eaten.proteinG, target: t.proteinG }}
              carb={{ eaten: eaten.carbG, target: t.carbG }}
              fat={{ eaten: eaten.fatG, target: t.fatG }}
            />
          </section>
        )}

        {quick.length > 0 && (
          <section style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}
            >
              <h2 className="heading" style={{ margin: 0 }}>
                กินบ่อย
              </h2>
              <Link
                href="/library"
                className="label"
                style={{ color: 'var(--basil)', textDecoration: 'none' }}
              >
                ดูคลังทั้งหมด
              </Link>
            </div>
            <div
              style={{
                display: 'flex',
                gap: 8,
                overflowX: 'auto',
                scrollbarWidth: 'none',
                margin: '0 -16px',
                padding: '0 16px 4px',
              }}
            >
              {quick.map((d, i) => (
                <button
                  key={d.id}
                  type="button"
                  aria-label={`บันทึก ${d.nameTh} ทันที`}
                  disabled={log.isPending}
                  onClick={() =>
                    log.mutate({ mealType: mealTypeNow(), nameTh: d.nameTh, dishId: d.id })
                  }
                  style={{
                    flex: 'none',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'flex-start',
                    gap: 8,
                    width: 144,
                    minHeight: 112,
                    padding: 14,
                    boxSizing: 'border-box',
                    borderRadius: 28,
                    border: 0,
                    background: SOFT[i % 4],
                    color: 'var(--ink)',
                    font: 'inherit',
                    textAlign: 'left',
                    cursor: 'pointer',
                  }}
                >
                  <span
                    style={{
                      fontFamily: 'var(--font-display)',
                      fontSize: 15,
                      lineHeight: '22px',
                      fontWeight: 500,
                    }}
                  >
                    {d.nameTh}
                  </span>
                  <span
                    style={{
                      marginTop: 'auto',
                      display: 'flex',
                      width: '100%',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <span className="caption nu-muted">{fmt(d.totals.kcal)} kcal</span>
                    <span
                      aria-hidden
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: 999,
                        background: 'var(--surface-raised)',
                        color: 'var(--basil)',
                        display: 'grid',
                        placeItems: 'center',
                      }}
                    >
                      <PlusIcon size={16} width={2.5} />
                    </span>
                  </span>
                </button>
              ))}
            </div>
            {log.isError && (
              <p className="caption nu-text-chili" role="alert" style={{ margin: 0 }}>
                บันทึกไม่สำเร็จ: {log.error.message}
              </p>
            )}
          </section>
        )}

        {meals.isError && (
          <p className="caption nu-text-chili" role="alert" style={{ margin: 0 }}>
            โหลดมื้ออาหารไม่สำเร็จ: {meals.error.message}
          </p>
        )}

        {groups.map((g) => (
          <section key={g.type} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}
            >
              <h2 className="heading" style={{ margin: 0 }}>
                {MEAL_TYPES[g.type]}
              </h2>
              {g.list.length > 0 && <span className="caption nu-muted">{fmt(g.kcal)} kcal</span>}
            </div>
            {g.list.map((m) => (
              <MealItem
                key={m.id}
                meal={m}
                open={selected === m.id}
                onToggle={() => setSelected(selected === m.id ? null : m.id)}
                deleting={del.isPending && del.variables === m.id}
                onDelete={() => del.mutate(m.id, { onSuccess: () => setSelected(null) })}
              />
            ))}
            {meals.isSuccess && !g.list.length && (
              <Link
                href={`/add?type=${g.type}`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  minHeight: 64,
                  border: '1.5px dashed var(--line-strong)',
                  borderRadius: 28,
                  color: 'var(--ink-muted)',
                  textDecoration: 'none',
                  fontSize: 14,
                }}
              >
                <PlusIcon size={18} width={2} />
                {`${MEAL_TYPES[g.type]}นี้กินอะไรดี แตะเพื่อเพิ่ม`}
              </Link>
            )}
          </section>
        ))}

        <p className="caption nu-muted" style={{ margin: 0, textAlign: 'center' }}>
          ข้อมูลโภชนาการจาก USDA FoodData Central และ Thai FCD (INMU)
        </p>
      </main>
      <BottomNav fab />
    </>
  );
}

function MealItem({
  meal: m,
  open,
  onToggle,
  onDelete,
  deleting,
}: {
  meal: Meal;
  open: boolean;
  onToggle: () => void;
  onDelete: () => void;
  deleting: boolean;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <MealCard
        name={m.nameTh}
        time={timeOf(m.eatenAt)}
        kcal={m.kcal}
        protein={m.proteinG}
        carb={m.carbG}
        fat={m.fatG}
        portion={m.portionMultiplier}
        source={m.dishId ? 'library' : undefined}
        onClick={onToggle}
      />
      {open && (
        <div style={{ display: 'flex', gap: 8 }}>
          <Button variant="quiet" size="sm" onClick={onToggle} style={{ flex: 1 }}>
            ยกเลิก
          </Button>
          <Button
            variant="danger"
            size="sm"
            disabled={deleting}
            onClick={onDelete}
            style={{ flex: 1 }}
          >
            {deleting ? 'กำลังลบ…' : 'ลบมื้อนี้'}
          </Button>
        </div>
      )}
    </div>
  );
}
