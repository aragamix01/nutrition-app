'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { BackHeader, DishRow, MealTypeSeg, SearchField } from '@/src/components/meal';
import { Skeleton } from '@/src/components/ui';
import { mealTypeNow, useDishes, useLogMeal, type MealType } from '@/src/lib/queries';

const tile: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'flex-start',
  justifyContent: 'space-between',
  gap: 8,
  minHeight: 112,
  padding: 16,
  boxSizing: 'border-box',
  borderRadius: 28,
  border: 0,
  color: 'var(--ink)',
  font: 'inherit',
  textAlign: 'left',
  textDecoration: 'none',
};

function AddMeal() {
  const router = useRouter();
  const params = useSearchParams();
  const [type, setType] = useState<MealType>((params.get('type') as MealType) || mealTypeNow());
  const [q, setQ] = useState('');
  const dishes = useDishes(q.trim());
  const log = useLogMeal();

  return (
    <main className="page" style={{ paddingBottom: 48 }}>
      <BackHeader title="เพิ่มมื้อ" />
      <MealTypeSeg value={type} onChange={setType} />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <div
          style={{ ...tile, gridColumn: '1 / -1', background: 'var(--basil-soft)', opacity: 0.6 }}
          aria-disabled
        >
          <span className="heading">ถ่ายรูปอาหาร</span>
          <span className="caption nu-muted">AI แยกวัตถุดิบให้ — เร็วๆ นี้</span>
        </div>
        <Link href={`/review?type=${type}`} style={{ ...tile, background: 'var(--carb-soft)' }}>
          <span className="heading">พิมพ์เอง</span>
          <span className="caption nu-muted">ประกอบจานจากวัตถุดิบ</span>
        </Link>
        <Link href="/library" style={{ ...tile, background: 'var(--protein-soft)' }}>
          <span className="heading">คลังของฉัน</span>
          <span className="caption nu-muted">เมนูที่เคยบันทึก</span>
        </Link>
      </div>

      <section style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <h2 className="heading" style={{ margin: 0 }}>
          เลือกจากคลัง
        </h2>
        <SearchField value={q} onChange={setQ} label="ค้นหาเมนูในคลัง" placeholder="ค้นหาเมนู" />
        {dishes.isPending && <Skeleton shape="lg" height={64} />}
        {dishes.isError && (
          <p className="caption nu-text-chili" style={{ margin: 0 }}>
            โหลดคลังไม่สำเร็จ: {dishes.error.message}
          </p>
        )}
        {dishes.data?.dishes.map((d) => (
          <DishRow
            key={d.id}
            name={d.nameTh}
            kcal={d.totals.kcal}
            useCount={d.useCount}
            href={`/review?type=${type}&dish=${d.id}`}
            logging={log.isPending}
            onQuickLog={() =>
              log.mutate(
                { mealType: type, nameTh: d.nameTh, dishId: d.id },
                { onSuccess: () => router.push('/') },
              )
            }
          />
        ))}
        {dishes.data && !dishes.data.dishes.length && (
          <p className="caption nu-muted" style={{ margin: 0, textAlign: 'center' }}>
            {q.trim()
              ? `ไม่พบ “${q.trim()}” ในคลัง`
              : 'ยังไม่มีเมนูในคลัง — เริ่มจาก “พิมพ์เอง” แล้วบันทึกเข้าคลัง'}
          </p>
        )}
        {log.isError && (
          <p className="caption nu-text-chili" role="alert" style={{ margin: 0 }}>
            บันทึกไม่สำเร็จ: {log.error.message}
          </p>
        )}
      </section>
    </main>
  );
}

export default function AddMealPage() {
  return (
    <Suspense>
      <AddMeal />
    </Suspense>
  );
}
