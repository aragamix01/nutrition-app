'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useRef, useState } from 'react';
import { BackHeader, DishRow, MealTypeSeg, SearchField } from '@/src/components/meal';
import { Button, Skeleton } from '@/src/components/ui';
import { api } from '@/src/lib/api';
import { saveDrafts } from '@/src/lib/draft';
import { shrinkImage } from '@/src/lib/image';
import { mealTypeNow, useDishes, useLogMeal, type MealType } from '@/src/lib/queries';
import type { AnalyzeResult } from '@/server/analyze';

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

type PhotoState =
  { step: 'idle' } | { step: 'working'; label: string } | { step: 'error'; message: string };

function AddMeal() {
  const router = useRouter();
  const params = useSearchParams();
  const [type, setType] = useState<MealType>((params.get('type') as MealType) || mealTypeNow());
  const [q, setQ] = useState('');
  const dishes = useDishes(q.trim());
  const log = useLogMeal();
  const [photo, setPhoto] = useState<PhotoState>({ step: 'idle' });
  const camera = useRef<HTMLInputElement>(null);
  const gallery = useRef<HTMLInputElement>(null);

  const analyze = async (file: File | undefined) => {
    if (!file) return;
    try {
      setPhoto({ step: 'working', label: 'กำลังย่อรูป…' });
      const image = await shrinkImage(file);
      setPhoto({ step: 'working', label: 'AI กำลังดูรูป… (อาจใช้เวลา 10–20 วินาที)' });
      const result = await api<AnalyzeResult>('/analyze', { method: 'POST', json: image });
      if (!result.dishes.length) {
        setPhoto({
          step: 'error',
          message: `ไม่พบอาหารในรูป${result.notes ? ` — ${result.notes}` : ''}`,
        });
        return;
      }
      saveDrafts(result, type);
      router.push(`/review?draft=0&type=${type}`);
    } catch (e) {
      setPhoto({ step: 'error', message: (e as Error).message });
    }
  };

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow picking the same photo again
    void analyze(file);
  };

  const working = photo.step === 'working';

  return (
    <main className="page" style={{ paddingBottom: 48 }}>
      <BackHeader title="เพิ่มมื้อ" />
      <MealTypeSeg value={type} onChange={setType} />

      <input
        ref={camera}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={onFile}
      />
      <input ref={gallery} type="file" accept="image/*" hidden onChange={onFile} />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <div
          style={{
            ...tile,
            gridColumn: '1 / -1',
            background: 'var(--basil-soft)',
            justifyContent: 'flex-start',
          }}
          aria-busy={working}
        >
          <span className="heading">ถ่ายรูปอาหาร</span>
          <span className="caption nu-muted">
            AI แยกวัตถุดิบและประมาณกรัมให้ แล้วคุณตรวจแก้ก่อนบันทึก · ไม่เก็บรูป
          </span>
          <div style={{ display: 'flex', gap: 8, width: '100%', marginTop: 4 }}>
            <Button
              variant="primary"
              style={{ flex: 1 }}
              disabled={working}
              onClick={() => camera.current?.click()}
            >
              ถ่ายรูป
            </Button>
            <Button
              variant="quiet"
              style={{ flex: 1, background: 'var(--surface-raised)' }}
              disabled={working}
              onClick={() => gallery.current?.click()}
            >
              เลือกรูป
            </Button>
          </div>
          {working && (
            <span
              className="label"
              role="status"
              style={{ display: 'flex', alignItems: 'center', gap: 8 }}
            >
              <span
                className="nu-skel nu-skel-circle"
                style={{ width: 12, height: 12 }}
                aria-hidden
              />
              {photo.label}
            </span>
          )}
          {photo.step === 'error' && (
            <span className="caption nu-text-chili" role="alert">
              {photo.message} ·{' '}
              <Link href={`/review?type=${type}`} style={{ color: 'inherit', fontWeight: 600 }}>
                กรอกเองแทน
              </Link>
            </span>
          )}
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
