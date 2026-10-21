'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import { BottomNav } from '@/src/components/BottomNav';
import { Button, fmt, Skeleton } from '@/src/components/ui';
import { api, ApiError } from '@/src/lib/api';
import {
  dailyTargets,
  GOAL_RATES,
  type ActivityLevel,
  type Goal,
  type Sex,
} from '@/src/lib/nutrition';
import { useProfile, type ProfileResponse } from '@/src/lib/queries';

const ACTIVITIES: [ActivityLevel, string, string][] = [
  [1.2, 'นั่งเป็นส่วนใหญ่', 'ทำงานโต๊ะ แทบไม่ออกกำลัง'],
  [1.375, 'ขยับเบาๆ', 'ออกกำลัง 1–3 วัน/สัปดาห์'],
  [1.55, 'ปานกลาง', 'ออกกำลัง 3–5 วัน/สัปดาห์'],
  [1.725, 'หนัก', 'ออกกำลัง 6–7 วัน/สัปดาห์'],
  [1.9, 'หนักมาก', 'งานใช้แรง หรือซ้อมวันละ 2 รอบ'],
];

const GOALS: [Goal, string, string, string][] = [
  ['lose', 'ลด', '−15%', 'var(--fat-soft)'],
  ['maintain', 'คงที่', '±0%', 'var(--protein-soft)'],
  ['gain', 'เพิ่ม', '+10%', 'var(--carb-soft)'],
];

type Form = {
  sex: Sex;
  year: string;
  height: string;
  weight: string;
  activity: ActivityLevel;
  goal: Goal;
};

const DEFAULT_FORM: Form = {
  sex: 'male',
  year: '1995',
  height: '170',
  weight: '65',
  activity: 1.55,
  goal: 'maintain',
};

function toForm(d: ProfileResponse | undefined): Form {
  const p = d?.profile;
  if (!p)
    return { ...DEFAULT_FORM, weight: d?.weight ? String(d.weight.weightKg) : DEFAULT_FORM.weight };
  return {
    sex: p.sex,
    year: String(p.birthYear),
    height: String(p.heightCm),
    weight: d?.weight ? String(d.weight.weightKg) : DEFAULT_FORM.weight,
    activity: p.activityLevel as ActivityLevel,
    goal: p.goal,
  };
}

export default function ProfilePage() {
  const q = useProfile();
  return (
    <>
      <main className="page">
        <h1 className="title" style={{ margin: 0 }}>
          โปรไฟล์
        </h1>
        {q.isPending ? (
          <>
            <Skeleton shape="lg" height={188} />
            <Skeleton shape="lg" height={180} />
            <Skeleton shape="lg" height={320} />
          </>
        ) : (
          // Remount the form once data arrives so it starts from the saved values.
          <ProfileForm key={q.dataUpdatedAt} initial={toForm(q.data)} loadError={q.error} />
        )}
        <Link
          href="/about"
          style={{
            alignSelf: 'center',
            minHeight: 44,
            display: 'inline-flex',
            alignItems: 'center',
            fontSize: 13,
            color: 'var(--basil)',
          }}
        >
          เกี่ยวกับแอปและแหล่งข้อมูล
        </Link>
      </main>
      <BottomNav />
    </>
  );
}

function ProfileForm({ initial, loadError }: { initial: Form; loadError: Error | null }) {
  const qc = useQueryClient();
  const [f, setF] = useState<Form>(initial);
  const set = (patch: Partial<Form>) => setF((prev) => ({ ...prev, ...patch }));

  const year = Number(f.year);
  const height = Number(f.height);
  const weight = Number(f.weight);
  const valid =
    year >= 1900 && year <= 2100 && height >= 50 && height <= 260 && weight >= 20 && weight <= 400;
  const t = valid
    ? dailyTargets(
        {
          sex: f.sex,
          birthYear: year,
          heightCm: height,
          activityLevel: f.activity,
          goalRate: GOAL_RATES[f.goal],
        },
        weight,
      )
    : null;

  const save = useMutation({
    mutationFn: async () => {
      await api('/profile', {
        method: 'PUT',
        json: {
          sex: f.sex,
          birthYear: year,
          heightCm: height,
          activityLevel: f.activity,
          goal: f.goal,
          goalRate: GOAL_RATES[f.goal],
        },
      });
      await api('/weight', { method: 'POST', json: { weightKg: weight } });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['profile'] }),
  });

  const noDb = loadError instanceof ApiError && loadError.status === 503;
  const dirty = JSON.stringify(f) !== JSON.stringify(initial);

  const fields = [
    { key: 'year' as const, label: 'ปีเกิด (ค.ศ.)', unit: '' },
    { key: 'height' as const, label: 'ส่วนสูง', unit: 'cm' },
    { key: 'weight' as const, label: 'น้ำหนัก', unit: 'kg' },
  ];

  return (
    <>
      {(noDb || loadError) && (
        <p
          className="caption"
          role="status"
          style={{
            margin: 0,
            padding: '10px 16px',
            borderRadius: 20,
            background: 'var(--carb-soft)',
          }}
        >
          {noDb
            ? 'ยังไม่ได้เชื่อมฐานข้อมูล — คำนวณได้ แต่ยังบันทึกไม่ได้'
            : `โหลดโปรไฟล์ไม่สำเร็จ: ${loadError?.message}`}
        </p>
      )}

      <section
        aria-label="เป้าหมายต่อวัน"
        style={{
          padding: 20,
          borderRadius: 28,
          background: 'var(--basil-soft)',
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <div>
            <p className="caption nu-muted" style={{ margin: 0 }}>
              เป้าพลังงานต่อวัน
            </p>
            <p style={{ margin: 0 }}>
              <span className="num-display">{t ? fmt(t.kcal) : '–'}</span>{' '}
              <span className="caption nu-muted">kcal</span>
            </p>
          </div>
          <div className="caption nu-muted" style={{ textAlign: 'right' }}>
            <div>
              BMR{' '}
              <span className="num" style={{ color: 'var(--ink)' }}>
                {t ? fmt(t.bmr) : '–'}
              </span>
            </div>
            <div>
              TDEE{' '}
              <span className="num" style={{ color: 'var(--ink)' }}>
                {t ? fmt(t.tdee) : '–'}
              </span>
            </div>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
          {(
            [
              ['protein', 'โปรตีน', t?.proteinG],
              ['carb', 'คาร์บ', t?.carbG],
              ['fat', 'ไขมัน', t?.fatG],
            ] as const
          ).map(([k, label, v]) => (
            <div
              key={k}
              style={{
                padding: '10px 12px',
                borderRadius: 20,
                background: 'var(--surface-raised)',
              }}
            >
              <div className="caption nu-muted">
                <i className={`nu-dot nu-bg-${k}`} />
                {label}
              </div>
              <span className="num">{v != null ? `${fmt(v)} g` : '–'}</span>
            </div>
          ))}
        </div>
        {t?.clampedToBmr && (
          <p className="caption nu-text-chili" style={{ margin: 0 }}>
            ตั้งเป้าต่ำกว่า BMR ไม่ได้ ใช้ค่า BMR แทนเพื่อความปลอดภัย
          </p>
        )}
      </section>

      <section
        className="nu-card"
        style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}
      >
        <h2 className="heading" style={{ margin: 0 }}>
          ร่างกาย
        </h2>
        <div
          role="radiogroup"
          aria-label="เพศ"
          className="seg"
          style={{ gridTemplateColumns: '1fr 1fr' }}
        >
          {(
            [
              ['male', 'ชาย'],
              ['female', 'หญิง'],
            ] as const
          ).map(([v, label]) => (
            <button
              key={v}
              type="button"
              role="radio"
              aria-checked={f.sex === v}
              onClick={() => set({ sex: v })}
            >
              {label}
            </button>
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
          {fields.map((fd) => (
            <label key={fd.key} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span className="label nu-muted">{fd.label}</span>
              <span className="field">
                <input
                  type="number"
                  inputMode="decimal"
                  value={f[fd.key]}
                  onChange={(e) => set({ [fd.key]: e.target.value })}
                />
                <span className="caption nu-muted">{fd.unit}</span>
              </span>
            </label>
          ))}
        </div>
        {!valid && (
          <p className="caption nu-text-chili" style={{ margin: 0 }}>
            ตรวจปีเกิด ส่วนสูง และน้ำหนักอีกครั้ง
          </p>
        )}
      </section>

      <section
        className="nu-card"
        style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}
      >
        <h2 className="heading" style={{ margin: 0 }}>
          ระดับกิจกรรม
        </h2>
        <div
          role="radiogroup"
          aria-label="ระดับกิจกรรม"
          style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
        >
          {ACTIVITIES.map(([v, label, desc]) => (
            <button
              key={v}
              type="button"
              role="radio"
              aria-checked={f.activity === v}
              className="choice"
              onClick={() => set({ activity: v })}
            >
              <span style={{ fontFamily: 'var(--font-display)', fontWeight: 500 }}>{label}</span>
              <span className="caption nu-muted">
                {desc} · ×{v}
              </span>
            </button>
          ))}
        </div>
      </section>

      <section
        className="nu-card"
        style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}
      >
        <h2 className="heading" style={{ margin: 0 }}>
          เป้าหมาย
        </h2>
        <div
          role="radiogroup"
          aria-label="เป้าหมาย"
          style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}
        >
          {GOALS.map(([v, label, desc, bg]) => (
            <button
              key={v}
              type="button"
              role="radio"
              aria-checked={f.goal === v}
              className="choice"
              style={{ '--choice-on': bg } as React.CSSProperties}
              onClick={() => set({ goal: v })}
            >
              <span style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 500 }}>
                {label}
              </span>
              <span className="caption nu-muted">{desc}</span>
            </button>
          ))}
        </div>
      </section>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <Button
          variant="primary"
          block
          disabled={!valid || save.isPending || noDb || (!dirty && !save.isError)}
          onClick={() => save.mutate()}
        >
          {save.isPending ? 'กำลังบันทึก…' : 'บันทึกโปรไฟล์'}
        </Button>
        {save.isError && (
          <p
            className="caption nu-text-chili"
            role="alert"
            style={{ margin: 0, textAlign: 'center' }}
          >
            บันทึกไม่สำเร็จ: {save.error.message}
          </p>
        )}
        {save.isSuccess && !dirty && (
          <p className="caption nu-muted" role="status" style={{ margin: 0, textAlign: 'center' }}>
            บันทึกแล้ว
          </p>
        )}
      </div>
    </>
  );
}
