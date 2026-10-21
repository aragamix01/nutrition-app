'use client';

import { useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { BottomNav } from '@/src/components/BottomNav';
import { Button, fmt, MacroBars, Skeleton } from '@/src/components/ui';
import { useClientValue } from '@/src/lib/client';
import { bangkokDate } from '@/src/lib/nutrition';
import { useLogWeight, useRange, useWeights, type RangeSummary } from '@/src/lib/queries';
import { addDays, dateRange, movingAverage } from '@/src/lib/stats';

const RANGES = [7, 30] as const;

const shortDay = (date: string, span: number) => {
  const d = new Date(`${date}T00:00:00+07:00`);
  return span <= 7
    ? new Intl.DateTimeFormat('th-TH', { timeZone: 'Asia/Bangkok', weekday: 'short' }).format(d)
    : String(Number(date.slice(8)));
};
const longDay = (date: string) =>
  new Intl.DateTimeFormat('th-TH', {
    timeZone: 'Asia/Bangkok',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).format(new Date(`${date}T00:00:00+07:00`));

const axisTick = { fill: 'var(--ink-muted)', fontSize: 12 };

function TipBox({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        padding: '8px 12px',
        borderRadius: 16,
        background: 'var(--surface-raised)',
        boxShadow: 'var(--shadow-float)',
        color: 'var(--ink)',
        fontSize: 13,
        lineHeight: '20px',
      }}
    >
      {children}
    </div>
  );
}

export default function HistoryPage() {
  const today = useClientValue(bangkokDate, '');
  const [span, setSpan] = useState<(typeof RANGES)[number]>(7);
  const from = today && addDays(today, -(span - 1));
  const range = useRange(from, today);

  return (
    <>
      <main className="page">
        <h1 className="title" style={{ margin: 0 }}>
          ประวัติ
        </h1>
        <div
          role="radiogroup"
          aria-label="ช่วงเวลา"
          className="seg"
          style={{ gridTemplateColumns: '1fr 1fr' }}
        >
          {RANGES.map((r) => (
            <button
              key={r}
              type="button"
              role="radio"
              aria-checked={span === r}
              onClick={() => setSpan(r)}
            >
              {r} วัน
            </button>
          ))}
        </div>

        {range.isError && (
          <p className="caption nu-text-chili" role="alert" style={{ margin: 0 }}>
            โหลดข้อมูลไม่สำเร็จ: {range.error.message}
          </p>
        )}
        {!range.data ? (
          <>
            <Skeleton shape="lg" height={300} />
            <Skeleton shape="lg" height={160} />
          </>
        ) : (
          <>
            <EnergyCard data={range.data} span={span} />
            <MacroCard data={range.data} />
          </>
        )}

        {today && <WeightCard today={today} span={span} />}
      </main>
      <BottomNav />
    </>
  );
}

function EnergyCard({ data, span }: { data: RangeSummary; span: number }) {
  const target = data.targets?.kcal ?? null;
  const rows = data.days.map((d) => ({ ...d, label: shortDay(d.date, span) }));
  const max = Math.max(target ?? 0, ...rows.map((d) => d.kcal));

  return (
    <section
      className="nu-card"
      style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}
    >
      <div>
        <h2 className="heading" style={{ margin: 0 }}>
          พลังงานต่อวัน
        </h2>
        <p style={{ margin: 0 }}>
          <span className="num-lg">{fmt(data.averages.kcal)}</span>{' '}
          <span className="caption nu-muted">
            kcal เฉลี่ย · บันทึก {data.loggedDays}/{data.days.length} วัน
          </span>
        </p>
      </div>

      {data.loggedDays === 0 ? (
        <p
          className="caption nu-muted"
          style={{ margin: 0, padding: '32px 0', textAlign: 'center' }}
        >
          ยังไม่มีมื้ออาหารในช่วงนี้
        </p>
      ) : (
        <div style={{ height: 200 }} role="img" aria-label={`กราฟพลังงาน ${span} วันล่าสุด`}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={rows}
              margin={{ top: 16, right: 4, bottom: 0, left: 4 }}
              barCategoryGap={span <= 7 ? '28%' : 2}
            >
              <CartesianGrid vertical={false} stroke="var(--line)" />
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={false}
                tick={axisTick}
                interval={span <= 7 ? 0 : 4}
              />
              <YAxis hide domain={[0, Math.ceil((max * 1.1) / 100) * 100]} />
              <Tooltip
                cursor={{ fill: 'var(--surface-sunken)' }}
                content={({ active, payload }) => {
                  const d = active && payload?.[0]?.payload;
                  if (!d) return null;
                  return (
                    <TipBox>
                      <div style={{ fontWeight: 600 }}>{longDay(d.date)}</div>
                      <div className="num">{fmt(d.kcal)} kcal</div>
                      <div className="nu-muted">
                        P {fmt(d.proteinG)} · C {fmt(d.carbG)} · F {fmt(d.fatG)} g
                      </div>
                    </TipBox>
                  );
                }}
              />
              <Bar dataKey="kcal" radius={[4, 4, 0, 0]} maxBarSize={28} isAnimationActive={false}>
                {rows.map((d) => (
                  <Cell
                    key={d.date}
                    fill={target && d.kcal > target ? 'var(--chili)' : 'var(--basil)'}
                  />
                ))}
              </Bar>
              {target && (
                // Labelled in the legend below: an in-chart label collides with tall bars.
                <ReferenceLine y={target} stroke="var(--ink-muted)" strokeDasharray="4 4" />
              )}
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
      {target && data.loggedDays > 0 && (
        <p
          className="caption nu-muted"
          style={{ margin: 0, display: 'flex', flexWrap: 'wrap', gap: '4px 16px' }}
        >
          <span>
            <i
              aria-hidden
              style={{
                display: 'inline-block',
                width: 16,
                marginRight: 4,
                verticalAlign: 3,
                borderTop: '2px dashed var(--ink-muted)',
              }}
            />
            เป้า {fmt(target)} kcal
          </span>
          <span>
            <i className="nu-dot" style={{ background: 'var(--basil)' }} />
            ไม่เกินเป้า
          </span>
          <span>
            <i className="nu-dot" style={{ background: 'var(--chili)' }} />
            เกินเป้า
          </span>
        </p>
      )}

      <details>
        <summary className="label" style={{ cursor: 'pointer', color: 'var(--basil)' }}>
          ดูเป็นตาราง
        </summary>
        <table
          className="caption"
          style={{ width: '100%', marginTop: 8, borderCollapse: 'collapse' }}
        >
          <thead>
            <tr className="nu-muted" style={{ textAlign: 'right' }}>
              <th style={{ textAlign: 'left', fontWeight: 500 }}>วัน</th>
              <th style={{ fontWeight: 500 }}>kcal</th>
              <th style={{ fontWeight: 500 }}>P</th>
              <th style={{ fontWeight: 500 }}>C</th>
              <th style={{ fontWeight: 500 }}>F</th>
            </tr>
          </thead>
          <tbody>
            {[...data.days].reverse().map((d) => (
              <tr key={d.date} style={{ textAlign: 'right', borderTop: '1px solid var(--line)' }}>
                <td style={{ textAlign: 'left', padding: '4px 0' }}>{longDay(d.date)}</td>
                <td>{d.mealCount ? fmt(d.kcal) : '–'}</td>
                <td>{d.mealCount ? fmt(d.proteinG) : '–'}</td>
                <td>{d.mealCount ? fmt(d.carbG) : '–'}</td>
                <td>{d.mealCount ? fmt(d.fatG) : '–'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </section>
  );
}

function MacroCard({ data }: { data: RangeSummary }) {
  const t = data.targets;
  if (!t || data.loggedDays === 0) return null;
  return (
    <section
      className="nu-card"
      style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}
    >
      <h2 className="heading" style={{ margin: 0 }}>
        สารอาหารเฉลี่ยต่อวัน
      </h2>
      <MacroBars
        protein={{ eaten: data.averages.proteinG, target: t.proteinG }}
        carb={{ eaten: data.averages.carbG, target: t.carbG }}
        fat={{ eaten: data.averages.fatG, target: t.fatG }}
      />
    </section>
  );
}

function WeightCard({ today, span }: { today: string; span: number }) {
  // Show at least 30 days (weight is logged less often), plus 6 earlier days to seed the 7-day average.
  const days = Math.max(span, 30);
  const from = addDays(today, -(days - 1));
  const weights = useWeights(addDays(from, -6));
  const log = useLogWeight();
  const [input, setInput] = useState('');

  const points = movingAverage(
    (weights.data?.weights ?? []).map((w) => ({ date: w.date, value: w.weightKg })),
  );
  const byDate = new Map(points.map((p) => [p.date, p]));
  const rows = dateRange(from, today).map((date) => ({
    date,
    label: String(Number(date.slice(8))),
    value: byDate.get(date)?.value ?? null,
    avg: byDate.get(date)?.avg ?? null,
  }));
  const shown = points.filter((p) => p.date >= from);
  const latest = shown.at(-1);
  const values = shown.flatMap((p) => [p.value, p.avg]);
  const lo = Math.floor(Math.min(...values) - 1);
  const hi = Math.ceil(Math.max(...values) + 1);
  const kg = Number(input);
  const validInput = input !== '' && kg >= 20 && kg <= 400;

  return (
    <section
      className="nu-card"
      style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}
    >
      <div>
        <h2 className="heading" style={{ margin: 0 }}>
          น้ำหนัก
        </h2>
        {latest ? (
          <p style={{ margin: 0 }}>
            <span className="num-lg">{latest.value.toFixed(1)}</span>{' '}
            <span className="caption nu-muted">
              kg ล่าสุด · เฉลี่ย 7 วัน {latest.avg.toFixed(1)} kg
            </span>
          </p>
        ) : (
          !weights.isPending && (
            <p className="caption nu-muted" style={{ margin: 0 }}>
              ยังไม่มีน้ำหนักใน {days} วันล่าสุด
            </p>
          )
        )}
      </div>

      {weights.isPending && <Skeleton shape="lg" height={160} />}
      {shown.length > 0 && (
        <>
          <div style={{ height: 160 }} role="img" aria-label={`กราฟน้ำหนัก ${days} วันล่าสุด`}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={rows} margin={{ top: 8, right: 4, bottom: 0, left: 4 }}>
                <CartesianGrid vertical={false} stroke="var(--line)" />
                <XAxis
                  dataKey="label"
                  tickLine={false}
                  axisLine={false}
                  tick={axisTick}
                  interval={6}
                />
                <YAxis
                  domain={[lo, hi]}
                  tickLine={false}
                  axisLine={false}
                  tick={axisTick}
                  width={32}
                  allowDecimals={false}
                />
                <Tooltip
                  cursor={{ stroke: 'var(--line-strong)', strokeWidth: 1 }}
                  content={({ active, payload }) => {
                    const d = active && payload?.[0]?.payload;
                    if (!d || d.value == null) return null;
                    return (
                      <TipBox>
                        <div style={{ fontWeight: 600 }}>{longDay(d.date)}</div>
                        <div className="num">{d.value.toFixed(1)} kg</div>
                        <div className="nu-muted">เฉลี่ย 7 วัน {d.avg.toFixed(1)} kg</div>
                      </TipBox>
                    );
                  }}
                />
                <Line
                  dataKey="value"
                  stroke="none"
                  dot={{ r: 4, fill: 'var(--protein)', fillOpacity: 0.45, stroke: 'none' }}
                  activeDot={{
                    r: 6,
                    fill: 'var(--protein)',
                    stroke: 'var(--surface-raised)',
                    strokeWidth: 2,
                  }}
                  isAnimationActive={false}
                />
                <Line
                  dataKey="avg"
                  stroke="var(--protein)"
                  strokeWidth={2}
                  dot={false}
                  activeDot={false}
                  connectNulls
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <p className="caption nu-muted" style={{ margin: 0, display: 'flex', gap: 16 }}>
            <span>
              <i className="nu-dot" style={{ background: 'var(--protein)', opacity: 0.45 }} />
              รายวัน
            </span>
            <span>
              <i
                aria-hidden
                style={{
                  display: 'inline-block',
                  width: 14,
                  height: 2,
                  marginRight: 4,
                  verticalAlign: 3,
                  background: 'var(--protein)',
                }}
              />
              เฉลี่ย 7 วัน
            </span>
          </p>
        </>
      )}

      <div style={{ display: 'flex', gap: 8 }}>
        <label className="field" style={{ flex: 1 }}>
          <input
            type="number"
            inputMode="decimal"
            aria-label="น้ำหนักวันนี้ (กิโลกรัม)"
            placeholder={latest ? latest.value.toFixed(1) : 'น้ำหนัก'}
            value={input}
            onChange={(e) => setInput(e.target.value)}
          />
          <span className="caption nu-muted">kg</span>
        </label>
        <Button
          variant="primary"
          disabled={!validInput || log.isPending}
          onClick={() => log.mutate(kg, { onSuccess: () => setInput('') })}
        >
          {log.isPending ? 'กำลังบันทึก…' : 'บันทึกวันนี้'}
        </Button>
      </div>
      {log.isError && (
        <p className="caption nu-text-chili" role="alert" style={{ margin: 0 }}>
          บันทึกไม่สำเร็จ: {log.error.message}
        </p>
      )}
    </section>
  );
}
