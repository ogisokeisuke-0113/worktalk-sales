import { useMemo } from 'react'
import {
  BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  ComposedChart, Line,
} from 'recharts'
import { FUNNEL_COLORS } from '../constants'

const COLORS = ['#3b82f6', '#ef4444', '#f59e0b', '#10b981', '#8b5cf6', '#ec4899', '#06b6d4', '#f97316']

function formatYen(amount) {
  if (!amount) return '¥0'
  if (amount >= 100000000) return `¥${(amount / 100000000).toFixed(1)}億`
  if (amount >= 10000) return `¥${(amount / 10000).toFixed(amount % 10000 === 0 ? 0 : 1)}万`
  return `¥${amount.toLocaleString()}`
}

export default function Dashboard({ proposals }) {
  const stats = useMemo(() => {
    const total = proposals.length
    const excluded = ['アポ獲得不可', '未提案', 'アポ調整中']
    const denominator = proposals.filter(p => !excluded.includes(p.status)).length
    const wonStatuses = ['受注', '決済者合意']
    const won = proposals.filter(p => wonStatuses.includes(p.status)).length
    const inProgress = proposals.filter(p =>
      ['アポ確定', '担当者合意', '決済者アポ調整中'].includes(p.status)
    ).length
    const lost = proposals.filter(p => p.status === '失注').length
    const winRate = denominator > 0 ? ((won / denominator) * 100).toFixed(1) : 0

    const expectedTotal = proposals.reduce((s, p) => s + (p.expectedAmount || 0), 0)
    const actualTotal = proposals.filter(p => wonStatuses.includes(p.status))
      .reduce((s, p) => s + (p.actualAmount || 0), 0)
    const pipelineAmount = proposals
      .filter(p => ['アポ確定', '担当者合意', '決済者アポ調整中'].includes(p.status))
      .reduce((s, p) => s + (p.expectedAmount || 0), 0)

    return { total, won, winRate, inProgress, lost, denominator, expectedTotal, actualTotal, pipelineAmount }
  }, [proposals])

  const monthlyData = useMemo(() => {
    const map = {}
    const excluded = ['アポ獲得不可', '未提案', 'アポ調整中']
    const wonStatuses = ['受注', '決済者合意']

    proposals.forEach(p => {
      if (!p.initialDate) return
      const month = p.initialDate.slice(0, 7)
      if (!map[month]) map[month] = { month, proposals: 0, won: 0, denominator: 0, amount: 0 }
      map[month].proposals++
      if (!excluded.includes(p.status)) map[month].denominator++
      if (wonStatuses.includes(p.status)) {
        map[month].won++
        map[month].amount += (p.actualAmount || 0)
      }
    })

    return Object.values(map)
      .sort((a, b) => a.month.localeCompare(b.month))
      .map(d => ({
        ...d,
        winRate: d.denominator > 0 ? Number(((d.won / d.denominator) * 100).toFixed(1)) : 0,
      }))
  }, [proposals])

  const funnelData = useMemo(() => {
    const stages = [
      '未提案', 'アポ調整中', 'アポ確定',
      '担当者合意', '決済者アポ調整中', '決済者合意', '受注',
    ]
    return stages.map(status => {
      const items = proposals.filter(p => p.status === status)
      return {
        name: status,
        count: items.length,
        amount: items.reduce((s, p) => s + (p.expectedAmount || 0), 0),
      }
    }).filter(d => d.count > 0)
  }, [proposals])

  const relationshipData = useMemo(() => {
    const map = {}
    const excluded = ['アポ獲得不可', '未提案', 'アポ調整中']
    const wonStatuses = ['受注', '決済者合意']

    proposals.forEach(p => {
      if (!p.relationship) return
      if (!map[p.relationship]) map[p.relationship] = { name: p.relationship, denominator: 0, won: 0 }
      if (!excluded.includes(p.status)) {
        map[p.relationship].denominator++
        if (wonStatuses.includes(p.status)) map[p.relationship].won++
      }
    })

    return Object.values(map)
      .map(d => ({ ...d, rate: d.denominator > 0 ? Number(((d.won / d.denominator) * 100).toFixed(1)) : 0 }))
      .sort((a, b) => b.rate - a.rate)
  }, [proposals])

  const industryData = useMemo(() => {
    const map = {}
    const excluded = ['アポ獲得不可', '未提案', 'アポ調整中']
    const wonStatuses = ['受注', '決済者合意']

    proposals.forEach(p => {
      if (!p.industry) return
      if (!map[p.industry]) map[p.industry] = { name: p.industry, denominator: 0, won: 0 }
      if (!excluded.includes(p.status)) {
        map[p.industry].denominator++
        if (wonStatuses.includes(p.status)) map[p.industry].won++
      }
    })

    return Object.values(map)
      .map(d => ({ ...d, rate: d.denominator > 0 ? Number(((d.won / d.denominator) * 100).toFixed(1)) : 0 }))
      .sort((a, b) => b.rate - a.rate)
  }, [proposals])

  const scaleData = useMemo(() => {
    const map = {}
    const excluded = ['アポ獲得不可', '未提案', 'アポ調整中']
    const wonStatuses = ['受注', '決済者合意']

    proposals.forEach(p => {
      if (!p.employeeScale) return
      if (!map[p.employeeScale]) map[p.employeeScale] = { name: p.employeeScale, denominator: 0, won: 0 }
      if (!excluded.includes(p.status)) {
        map[p.employeeScale].denominator++
        if (wonStatuses.includes(p.status)) map[p.employeeScale].won++
      }
    })

    return Object.values(map)
      .map(d => ({ ...d, rate: d.denominator > 0 ? Number(((d.won / d.denominator) * 100).toFixed(1)) : 0 }))
  }, [proposals])

  const lossReasonData = useMemo(() => {
    const map = {}
    proposals.forEach(p => {
      if (p.status === '失注' && p.lossReason) {
        map[p.lossReason] = (map[p.lossReason] || 0) + 1
      }
    })
    return Object.entries(map).map(([name, value]) => ({ name, value }))
  }, [proposals])

  const revisitStats = useMemo(() => {
    const excluded = ['アポ獲得不可', '未提案', 'アポ調整中']
    const wonStatuses = ['受注', '決済者合意']
    const eligible = proposals.filter(p => !excluded.includes(p.status))
    const denominator = eligible.length
    const withRevisit = eligible.filter(p => p.decisionMakerDate)
    const withoutRevisit = eligible.filter(p => !p.decisionMakerDate)

    const revisitRate = denominator > 0 ? ((withRevisit.length / denominator) * 100).toFixed(1) : 0
    const revisitWinRate = withRevisit.length > 0
      ? ((withRevisit.filter(p => wonStatuses.includes(p.status)).length / withRevisit.length) * 100).toFixed(1)
      : 0
    const noRevisitWinRate = withoutRevisit.length > 0
      ? ((withoutRevisit.filter(p => wonStatuses.includes(p.status)).length / withoutRevisit.length) * 100).toFixed(1)
      : 0

    return {
      revisitRate: Number(revisitRate),
      data: [
        { name: '再訪あり', rate: Number(revisitWinRate), count: withRevisit.length },
        { name: '再訪なし', rate: Number(noRevisitWinRate), count: withoutRevisit.length },
      ]
    }
  }, [proposals])

  const repSummary = useMemo(() => {
    const map = {}
    const excluded = ['アポ獲得不可', '未提案', 'アポ調整中']
    const wonStatuses = ['受注', '決済者合意']

    proposals.forEach(p => {
      const name = p.salesRep || '(未設定)'
      if (!map[name]) map[name] = { name, total: 0, won: 0, denominator: 0, expected: 0, actual: 0 }
      map[name].total++
      if (!excluded.includes(p.status)) map[name].denominator++
      if (wonStatuses.includes(p.status)) {
        map[name].won++
        map[name].actual += (p.actualAmount || 0)
      }
      map[name].expected += (p.expectedAmount || 0)
    })

    return Object.values(map)
      .map(r => ({ ...r, winRate: r.denominator > 0 ? Number(((r.won / r.denominator) * 100).toFixed(1)) : 0 }))
      .sort((a, b) => b.total - a.total)
  }, [proposals])

  if (proposals.length === 0) {
    return (
      <div className="text-center py-20 text-slate-400">
        <p className="text-lg mb-2">データがありません</p>
        <p className="text-sm">提案リストタブからデータを追加してください</p>
      </div>
    )
  }

  return (
    <div>
      <h2 className="text-xl font-bold text-slate-800 mb-4">ダッシュボード</h2>

      {/* Compact KPI Strip */}
      <div className="bg-white rounded-lg shadow mb-6 overflow-hidden">
        <div className="flex flex-wrap border-b border-slate-100">
          <CompactKPI label="総提案" value={stats.total} suffix="件" />
          <CompactKPI label="受注" value={stats.won} suffix="件" sub={`受注率 ${stats.winRate}%`} color="green" />
          <CompactKPI label="進行中" value={stats.inProgress} suffix="件" color="amber" />
          <CompactKPI label="失注" value={stats.lost} suffix="件" color="red" />
        </div>
        <div className="flex flex-wrap">
          <CompactKPI label="見込み合計" value={formatYen(stats.expectedTotal)} color="blue" />
          <CompactKPI label="受注金額" value={formatYen(stats.actualTotal)} color="green" />
          <CompactKPI label="パイプライン" value={formatYen(stats.pipelineAmount)} color="purple" />
        </div>
      </div>

      {/* 2-Column: Funnel + Monthly Trend */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {funnelData.length > 0 && (
          <ChartCard title="パイプライン">
            <PipelineBar data={funnelData} />
          </ChartCard>
        )}

        {monthlyData.length > 0 && (
          <ChartCard title="月別推移">
            <ResponsiveContainer width="100%" height={280}>
              <ComposedChart data={monthlyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis yAxisId="left" tick={{ fontSize: 11 }} />
                <YAxis yAxisId="right" orientation="right" domain={[0, 100]} tick={{ fontSize: 11 }} unit="%" />
                <Tooltip
                  contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar yAxisId="left" dataKey="proposals" name="提案数" fill="#3b82f6" radius={[3, 3, 0, 0]} />
                <Bar yAxisId="left" dataKey="won" name="受注数" fill="#10b981" radius={[3, 3, 0, 0]} />
                <Line yAxisId="right" type="monotone" dataKey="winRate" name="受注率(%)" stroke="#f59e0b" strokeWidth={2} dot={{ r: 3 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </ChartCard>
        )}
      </div>

      {/* Per-Rep Summary */}
      {repSummary.length > 1 && (
        <ChartCard title="営業担当別サマリー">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-medium text-slate-500">担当</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-slate-500">提案</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-slate-500">受注</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-slate-500">受注率</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-slate-500">見込み</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-slate-500">受注額</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {repSummary.map(r => (
                  <tr key={r.name} className="hover:bg-slate-50">
                    <td className="px-3 py-2 font-medium text-slate-800">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white text-[10px] font-bold shrink-0">
                          {r.name.slice(0, 1)}
                        </div>
                        {r.name}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right">{r.total}</td>
                    <td className="px-3 py-2 text-right text-green-600 font-medium">{r.won}</td>
                    <td className="px-3 py-2 text-right">
                      <span className={`inline-block px-1.5 py-0.5 rounded text-xs font-bold ${
                        r.winRate >= 20 ? 'bg-green-100 text-green-700' :
                        r.winRate >= 10 ? 'bg-yellow-100 text-yellow-700' :
                        'bg-red-100 text-red-700'
                      }`}>
                        {r.winRate}%
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right text-slate-600 text-xs">{formatYen(r.expected)}</td>
                    <td className="px-3 py-2 text-right text-green-700 font-medium text-xs">{formatYen(r.actual)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </ChartCard>
      )}

      {/* Analysis Charts - 2 Column Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {relationshipData.length > 0 && (
          <ChartCard title="関係性別受注率">
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={relationshipData} layout="vertical" margin={{ left: 60 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis type="number" domain={[0, 100]} unit="%" tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={80} />
                <Tooltip formatter={(v) => `${v}%`} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                <Bar dataKey="rate" name="受注率" fill="#8b5cf6" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        )}

        {industryData.length > 0 && (
          <ChartCard title="業種別受注率">
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={industryData} layout="vertical" margin={{ left: 80 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis type="number" domain={[0, 100]} unit="%" tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={100} />
                <Tooltip formatter={(v) => `${v}%`} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                <Bar dataKey="rate" name="受注率" fill="#3b82f6" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        )}

        {scaleData.length > 0 && (
          <ChartCard title="従業員規模別受注率">
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={scaleData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                <YAxis domain={[0, 100]} unit="%" tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v) => `${v}%`} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                <Bar dataKey="rate" name="受注率" fill="#06b6d4" radius={[4, 4, 0, 0]}>
                  {scaleData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        )}

        {lossReasonData.length > 0 && (
          <ChartCard title="失注理由">
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie data={lossReasonData} cx="50%" cy="50%" outerRadius={80} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                  {lossReasonData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
              </PieChart>
            </ResponsiveContainer>
          </ChartCard>
        )}
      </div>

      {/* Revisit Stats */}
      <ChartCard title={`再訪取得率: ${revisitStats.revisitRate}% / 再訪有無別受注率の比較`}>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={revisitStats.data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="name" tick={{ fontSize: 12 }} />
            <YAxis domain={[0, 100]} unit="%" tick={{ fontSize: 12 }} />
            <Tooltip formatter={(v, name) => name === 'rate' ? `${v}%` : v} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
            <Bar dataKey="rate" name="受注率" fill="#10b981" radius={[4, 4, 0, 0]}>
              {revisitStats.data.map((_, i) => <Cell key={i} fill={i === 0 ? '#10b981' : '#94a3b8'} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>
    </div>
  )
}

/* ─── Compact KPI Metric ─── */
function CompactKPI({ label, value, suffix, sub, color }) {
  const textColor = {
    green: 'text-green-600',
    amber: 'text-amber-600',
    red: 'text-red-500',
    blue: 'text-blue-600',
    purple: 'text-purple-600',
  }
  const dotColor = {
    green: 'bg-green-400',
    amber: 'bg-amber-400',
    red: 'bg-red-400',
    blue: 'bg-blue-400',
    purple: 'bg-purple-400',
  }
  return (
    <div className="flex-1 min-w-[120px] px-4 py-2.5 border-r border-slate-100 last:border-r-0">
      <div className="flex items-center gap-1.5 mb-0.5">
        <span className={`w-1.5 h-1.5 rounded-full ${dotColor[color] || 'bg-slate-300'}`} />
        <span className="text-[10px] text-slate-400 font-semibold tracking-wider uppercase">{label}</span>
      </div>
      <div className="flex items-baseline gap-1">
        <span className={`text-lg font-bold leading-tight ${textColor[color] || 'text-slate-800'}`}>{value}</span>
        {suffix && <span className="text-xs text-slate-400">{suffix}</span>}
      </div>
      {sub && <p className="text-[11px] text-slate-400 mt-0.5">{sub}</p>}
    </div>
  )
}

/* ─── 100% Stacked Horizontal Pipeline Bar ─── */
function PipelineBar({ data }) {
  if (!data || data.length === 0) {
    return <p className="text-sm text-slate-400 text-center py-8">データなし</p>
  }

  const totalCount = data.reduce((s, d) => s + d.count, 0)

  return (
    <div>
      {/* Stacked bar */}
      <div className="flex w-full rounded-lg overflow-hidden" style={{ height: 44 }}>
        {data.map((d, i) => {
          const pct = totalCount > 0 ? (d.count / totalCount) * 100 : 0
          if (pct === 0) return null
          return (
            <div
              key={d.name}
              className="relative group flex items-center justify-center overflow-hidden transition-all duration-300 first:rounded-l-lg last:rounded-r-lg"
              style={{
                width: `${pct}%`,
                backgroundColor: FUNNEL_COLORS[i % FUNNEL_COLORS.length],
                minWidth: pct > 0 ? 4 : 0,
              }}
            >
              {/* Inline label (show if enough width) */}
              {pct >= 8 && (
                <span className="text-white text-[10px] font-bold whitespace-nowrap leading-none drop-shadow-sm">
                  {pct.toFixed(0)}%
                </span>
              )}
              {/* Hover tooltip */}
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2.5 py-1.5 bg-slate-800 text-white text-[11px] rounded-md whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50 shadow-lg">
                <span className="font-bold">{d.name}</span>
                <span className="ml-1.5 opacity-80">{d.count}件 ({pct.toFixed(1)}%)</span>
                {d.amount > 0 && <span className="ml-1.5 opacity-80">{formatYen(d.amount)}</span>}
                <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-800" />
              </div>
            </div>
          )
        })}
      </div>

      {/* Legend */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-3 gap-y-2 mt-3">
        {data.map((d, i) => {
          const pct = totalCount > 0 ? ((d.count / totalCount) * 100).toFixed(1) : 0
          return (
            <div key={d.name} className="flex items-center gap-2 min-w-0">
              <span
                className="w-3 h-3 rounded-sm shrink-0"
                style={{ backgroundColor: FUNNEL_COLORS[i % FUNNEL_COLORS.length] }}
              />
              <div className="min-w-0">
                <p className="text-[11px] text-slate-700 font-medium truncate leading-tight">{d.name}</p>
                <p className="text-[10px] text-slate-400 leading-tight">
                  {d.count}件 ({pct}%)
                  {d.amount > 0 && <span className="ml-1">{formatYen(d.amount)}</span>}
                </p>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ─── Chart Card Wrapper ─── */
function ChartCard({ title, children }) {
  return (
    <div className="bg-white rounded-lg shadow p-4 mb-6">
      <h3 className="text-sm font-bold text-slate-700 mb-3">{title}</h3>
      {children}
    </div>
  )
}
