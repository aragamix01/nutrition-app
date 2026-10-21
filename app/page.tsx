'use client';

import Link from 'next/link';
import { useSyncExternalStore } from 'react';
import { BottomNav } from '@/src/components/BottomNav';
import { EnergyRing, Skeleton } from '@/src/components/ui';
import { dailyTargets, GOAL_RATES } from '@/src/lib/nutrition';
import { useProfile } from '@/src/lib/queries';

const dayLabel = () =>
  new Intl.DateTimeFormat('th-TH', {
    timeZone: 'Asia/Bangkok',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).format(new Date());

/** Client-only: the page is prerendered at build time, and Node's Thai locale data differs from browsers'. */
const useToday = () =>
  useSyncExternalStore(
    () => () => {},
    dayLabel,
    () => '',
  );

// Phase 1 placeholder: shows today's target from the profile. Meals arrive in phase 3–4.
export default function TodayPage() {
  const q = useProfile();
  const p = q.data?.profile;
  const w = q.data?.weight;
  const t = p && w ? dailyTargets({ ...p, goalRate: GOAL_RATES[p.goal] }, w.weightKg) : null;
  const today = useToday();

  return (
    <>
      <main className="page">
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <p className="caption nu-muted" style={{ margin: 0, minHeight: 18 }}>
              {today}
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
          {q.isPending ? (
            <Skeleton shape="circle" width={184} height={184} />
          ) : t ? (
            <EnergyRing eaten={0} target={t.kcal} size={184} stroke={16} />
          ) : (
            <>
              <p className="heading" style={{ margin: 0 }}>
                ตั้งค่าโปรไฟล์ก่อนนะ
              </p>
              <p className="caption nu-muted" style={{ margin: 0, textAlign: 'center' }}>
                ใส่เพศ อายุ ส่วนสูง น้ำหนัก เพื่อคำนวณเป้าพลังงานต่อวัน
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

        <p className="caption nu-muted" style={{ margin: 0, textAlign: 'center' }}>
          ข้อมูลโภชนาการจาก USDA FoodData Central และ Thai FCD (INMU)
        </p>
      </main>
      <BottomNav fab />
    </>
  );
}
