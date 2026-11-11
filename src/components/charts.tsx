import { useMemo } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { formatDate, formatPrice, formatPriceShort, formatYm } from '@/lib/format'
import { activeTrades, describeMonthly, type MonthlyPoint } from '@/lib/stats'
import type { Trade } from '@/types'

const AXIS = { fontSize: 11, fill: 'var(--muted)' }
const tooltipStyle = {
  background: 'var(--surface)',
  border: '1px solid var(--line)',
  borderRadius: 10,
  fontSize: 12,
  color: 'var(--ink)',
}

/** 비교 차트 계열 색 (밝은·어두운 화면 모두에서 구분되도록 색상+선 모양을 함께 다르게 쓴다) */
export const SERIES = [
  { color: '#00a88f', dash: undefined },
  { color: '#3b7ddd', dash: '6 3' },
  { color: '#e0892b', dash: '2 3' },
  { color: '#a05cc7', dash: '8 3 2 3' },
] as const

function ChartFrame({ summary, height, children }: { summary: string; height: number; children: React.ReactNode }) {
  return (
    <figure className="m-0">
      <div style={{ height }} aria-hidden="true">
        {children}
      </div>
      <figcaption className="mt-2 text-[12px] leading-relaxed text-muted">{summary}</figcaption>
    </figure>
  )
}

/** 월별 거래량(막대) */
export function VolumeChart({ points, height = 200 }: { points: MonthlyPoint[]; height?: number }) {
  const total = points.reduce((s, p) => s + p.count, 0)
  const peak = points.reduce((a, b) => (b.count > a.count ? b : a), points[0])
  const summary =
    total === 0
      ? '선택한 조건에 해당하는 거래가 없습니다.'
      : `월별 거래량(계약월 기준, 해제 제외): 총 ${total.toLocaleString('ko-KR')}건, 최다 ${formatYm(peak.ym)} ${peak.count}건. 최근 달은 신고 기한(30일)이 지나지 않아 이후 늘어날 수 있습니다.`
  return (
    <ChartFrame summary={summary} height={height}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
          <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
          <XAxis dataKey="ym" tickFormatter={(v: string) => v.slice(2).replace('-', '.')} tick={AXIS} tickLine={false} axisLine={{ stroke: 'var(--line)' }} minTickGap={16} />
          <YAxis allowDecimals={false} tick={AXIS} tickLine={false} axisLine={false} />
          <Tooltip
            cursor={{ fill: 'var(--surface-2)' }}
            contentStyle={tooltipStyle}
            labelFormatter={(v) => `${formatYm(String(v))} 계약`}
            formatter={(v) => [`${v}건`, '거래량']}
          />
          <Bar dataKey="count" fill="var(--accent)" radius={[4, 4, 0, 0]} maxBarSize={28} />
        </BarChart>
      </ResponsiveContainer>
    </ChartFrame>
  )
}

/** 월별 중위 거래금액(선) + 거래량(막대) */
export function MedianVolumeChart({ points, height = 260 }: { points: MonthlyPoint[]; height?: number }) {
  return (
    <ChartFrame summary={describeMonthly(points)} height={height}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={points} margin={{ top: 8, right: -8, bottom: 0, left: 4 }}>
          <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
          <XAxis dataKey="ym" tickFormatter={(v: string) => v.slice(2).replace('-', '.')} tick={AXIS} tickLine={false} axisLine={{ stroke: 'var(--line)' }} minTickGap={16} />
          <YAxis yAxisId="price" tickFormatter={formatPriceShort} tick={AXIS} tickLine={false} axisLine={false} width={52} domain={['auto', 'auto']} />
          <YAxis yAxisId="count" orientation="right" allowDecimals={false} tick={AXIS} tickLine={false} axisLine={false} width={36} />
          <Tooltip
            cursor={{ fill: 'var(--surface-2)' }}
            contentStyle={tooltipStyle}
            labelFormatter={(v) => `${formatYm(String(v))} 계약`}
            formatter={(v, name) => (name === 'median' ? [formatPrice(Number(v)), '중위 거래금액'] : [`${v}건`, '거래량'])}
          />
          <Legend
            verticalAlign="top"
            height={24}
            iconSize={10}
            wrapperStyle={{ fontSize: 12, color: 'var(--muted)' }}
            formatter={(v) => (v === 'median' ? '중위 거래금액' : '거래량')}
          />
          <Bar yAxisId="count" dataKey="count" fill="var(--line)" radius={[3, 3, 0, 0]} maxBarSize={24} />
          <Line yAxisId="price" dataKey="median" stroke="var(--accent)" strokeWidth={2.5} dot={{ r: 2.5, fill: 'var(--accent)' }} connectNulls />
        </ComposedChart>
      </ResponsiveContainer>
    </ChartFrame>
  )
}

interface TrendDatum {
  x: number
  price?: number
  median?: number
  label: string
  floor?: number | null
}

/** 개별 거래(점) + 월 중위(선). 한 단지·한 면적 그룹처럼 조건이 같은 거래에 쓴다. */
export function PriceTrendChart({ trades, points, height = 260 }: { trades: Trade[]; points: MonthlyPoint[]; height?: number }) {
  const data = useMemo<TrendDatum[]>(() => {
    const dots: TrendDatum[] = activeTrades(trades).map((t) => ({
      x: new Date(`${t.dealDate}T00:00:00Z`).getTime(),
      price: t.price,
      label: `${formatDate(t.dealDate)} 계약`,
      floor: t.floor,
    }))
    const med: TrendDatum[] = points
      .filter((p) => p.median != null)
      .map((p) => ({ x: new Date(`${p.ym}-15T00:00:00Z`).getTime(), median: p.median!, label: `${formatYm(p.ym)} 월 중위` }))
    return [...dots, ...med].sort((a, b) => a.x - b.x)
  }, [trades, points])

  const act = activeTrades(trades)
  const sorted = [...act].sort((a, b) => (a.dealDate < b.dealDate ? -1 : 1))
  const summary =
    act.length === 0
      ? '선택한 조건에 해당하는 거래가 없습니다.'
      : `거래 ${act.length}건(해제 제외). 첫 거래 ${formatDate(sorted[0].dealDate)} ${formatPrice(sorted[0].price)}, ` +
        `최근 거래 ${formatDate(sorted[sorted.length - 1].dealDate)} ${formatPrice(sorted[sorted.length - 1].price)}. ` +
        `점은 개별 거래, 선은 월 중위 금액입니다. 층·동·상태가 다른 거래가 섞여 있습니다.`

  return (
    <ChartFrame summary={summary} height={height}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 4 }}>
          <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
          <XAxis
            dataKey="x"
            type="number"
            scale="time"
            domain={['dataMin', 'dataMax']}
            tickFormatter={(v: number) => new Date(v).toISOString().slice(2, 7).replace('-', '.')}
            tick={AXIS}
            tickLine={false}
            axisLine={{ stroke: 'var(--line)' }}
            minTickGap={28}
          />
          <YAxis tickFormatter={formatPriceShort} tick={AXIS} tickLine={false} axisLine={false} width={52} domain={['auto', 'auto']} />
          <Tooltip
            contentStyle={tooltipStyle}
            labelFormatter={(_, payload) => (payload?.[0]?.payload as TrendDatum | undefined)?.label ?? ''}
            formatter={(v, name, item) => {
              const d = item.payload as TrendDatum
              return name === 'median'
                ? [formatPrice(Number(v)), '월 중위']
                : [`${formatPrice(Number(v))}${d.floor != null ? ` · ${d.floor}층` : ''}`, '거래금액']
            }}
          />
          <Legend
            verticalAlign="top"
            height={24}
            iconSize={10}
            wrapperStyle={{ fontSize: 12 }}
            formatter={(v) => (v === 'median' ? '월 중위 금액' : '개별 거래')}
          />
          <Line dataKey="price" stroke="none" isAnimationActive={false} dot={{ r: 3, fill: 'var(--muted)', fillOpacity: 0.55, stroke: 'none' }} activeDot={{ r: 5 }} legendType="circle" color="var(--muted)" />
          <Line dataKey="median" stroke="var(--accent)" strokeWidth={2.5} dot={false} connectNulls isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </ChartFrame>
  )
}

/** 여러 단지의 월 중위 금액 비교(선) */
export function CompareChart({
  series,
  yms,
  height = 280,
}: {
  series: { id: string; name: string; points: MonthlyPoint[] }[]
  yms: string[]
  height?: number
}) {
  const data = useMemo(
    () =>
      yms.map((ym) => {
        const row: Record<string, string | number | null> = { ym }
        for (const s of series) row[s.id] = s.points.find((p) => p.ym === ym)?.median ?? null
        return row
      }),
    [series, yms],
  )
  const summary =
    series.length === 0
      ? '비교할 단지가 없습니다.'
      : series
          .map((s) => {
            const w = s.points.filter((p) => p.median != null)
            return w.length ? `${s.name}: 최근 월 중위 ${formatPrice(w[w.length - 1].median)}(${formatYm(w[w.length - 1].ym)})` : `${s.name}: 기간 내 거래 없음`
          })
          .join(' / ') + '. 거래가 없는 달은 선을 이어서 표시합니다.'
  return (
    <ChartFrame summary={summary} height={height}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 4 }}>
          <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
          <XAxis dataKey="ym" tickFormatter={(v: string) => v.slice(2).replace('-', '.')} tick={AXIS} tickLine={false} axisLine={{ stroke: 'var(--line)' }} minTickGap={16} />
          <YAxis tickFormatter={formatPriceShort} tick={AXIS} tickLine={false} axisLine={false} width={52} domain={['auto', 'auto']} />
          <Tooltip
            contentStyle={tooltipStyle}
            labelFormatter={(v) => `${formatYm(String(v))} 계약 · 월 중위`}
            formatter={(v, name) => [formatPrice(Number(v)), series.find((s) => s.id === name)?.name ?? String(name)]}
          />
          <Legend verticalAlign="top" height={40} iconSize={14} wrapperStyle={{ fontSize: 12 }} formatter={(v) => series.find((s) => s.id === v)?.name ?? v} />
          {series.map((s, i) => (
            <Line
              key={s.id}
              dataKey={s.id}
              stroke={SERIES[i % SERIES.length].color}
              strokeDasharray={SERIES[i % SERIES.length].dash}
              strokeWidth={2.5}
              dot={{ r: 2.5 }}
              connectNulls
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </ChartFrame>
  )
}
