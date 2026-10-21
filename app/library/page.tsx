'use client';

import Link from 'next/link';
import { useState } from 'react';
import { BottomNav } from '@/src/components/BottomNav';
import { DishRow, SearchField } from '@/src/components/meal';
import { Skeleton } from '@/src/components/ui';
import { mealTypeNow, useDishes, useLogMeal } from '@/src/lib/queries';

export default function LibraryPage() {
  const [q, setQ] = useState('');
  const dishes = useDishes(q.trim());
  const log = useLogMeal();
  const [logged, setLogged] = useState<string | null>(null);
  const list = dishes.data?.dishes ?? [];

  return (
    <>
      <main className="page">
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <p className="caption nu-muted" style={{ margin: 0, minHeight: 18 }}>
              {dishes.data && !q ? `${list.length} เมนูที่เคยบันทึก` : ''}
            </p>
            <h1 className="title" style={{ margin: 0 }}>
              คลังของฉัน
            </h1>
          </div>
          <Link
            href="/review"
            className="nu-btn nu-btn-primary nu-btn-sm"
            style={{ textDecoration: 'none' }}
          >
            + เมนูใหม่
          </Link>
        </header>

        <SearchField value={q} onChange={setQ} label="ค้นหาเมนูในคลัง" placeholder="ค้นหาเมนู" />

        {logged && (
          <p
            className="caption"
            role="status"
            style={{
              margin: 0,
              padding: '10px 16px',
              borderRadius: 20,
              background: 'var(--basil-soft)',
            }}
          >
            บันทึก “{logged}” เป็นมื้อนี้แล้ว
          </p>
        )}
        {log.isError && (
          <p className="caption nu-text-chili" role="alert" style={{ margin: 0 }}>
            บันทึกไม่สำเร็จ: {log.error.message}
          </p>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {dishes.isPending && (
            <>
              <Skeleton shape="lg" height={64} />
              <Skeleton shape="lg" height={64} />
            </>
          )}
          {dishes.isError && (
            <p className="caption nu-text-chili" style={{ margin: 0 }}>
              โหลดคลังไม่สำเร็จ: {dishes.error.message}
            </p>
          )}
          {list.map((d) => (
            <DishRow
              key={d.id}
              name={d.nameTh}
              kcal={d.totals.kcal}
              useCount={d.useCount}
              href={`/review?dish=${d.id}`}
              logging={log.isPending}
              onQuickLog={() =>
                log.mutate(
                  { mealType: mealTypeNow(), nameTh: d.nameTh, dishId: d.id },
                  { onSuccess: () => setLogged(d.nameTh) },
                )
              }
            />
          ))}
          {dishes.data && !list.length && (
            <p className="caption nu-muted" style={{ margin: 0, textAlign: 'center' }}>
              {q.trim()
                ? `ไม่พบ “${q.trim()}”`
                : 'ยังไม่มีเมนู — กด “+ เมนูใหม่” หรือบันทึกมื้อแล้วติ๊ก “บันทึกเข้าคลังด้วย”'}
            </p>
          )}
        </div>
      </main>
      <BottomNav />
    </>
  );
}
