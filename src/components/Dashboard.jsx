import { useMemo, useState } from 'react'
import MultiSelect from './MultiSelect'
import {
  BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  ComposedChart, Line,
} from 'recharts'
import { FUNNEL_COLORS } from '../constants'

const COLORS = ['#1a5285', '#2d6a9e', '#4a82ae', '#6e9bbf', '#93b5d0', '#0f8a7e', '#c97a1a', '#d94452']

// ネイビー濃淡パレット（薄→濃）— 率や進行度に応じて濃くなる
const NAVY_SCALE = ['#dbe6f0', '#b8cfe0', '#93b5d0', '#6e9bbf', '#4a82ae', '#2d6a9e', '#1a5285']

// 値（0〜max）に応じてネイビー濃淡を返す
function navyByValue(value, max) {
  if (max <= 0) return NAVY_SCALE[3]
  const ratio = Math.min(value / max, 1)
  const idx = Math.round(ratio * (NAVY_SCALE.length - 1))
  return NAVY_SCALE[idx]
}

// データ最大値から適切な軸上限を算出（10刻みで切り上げ、最低10）
function niceMax(data, key) {
  const max = Math.max(...data.map(d => d[key] || 0), 0)
  if (max === 0) return 10
  return Math.ceil(max / 10) * 10
}

// Wilson Score 下限値（95%信頼区間）
// 分母が少ないほどスコアが下がり、分母・率の両方を加味した並び替えが可能
function wilsonLower(won, total) {
  if (total === 0) return 0
  const z = 1.96 // 95% confidence
  const p = won / total
  const denominator = 1 + (z * z) / total
  const center = p + (z * z) / (2 * total)
  const spread = z * Math.sqrt((p * (1 - p) + (z * z) / (4 * total)) / total)
  return ((center - spread) / denominator) * 100
}

// クリック可能なバーのカスタムShape
function ClickableBar({ x, y, width, height, fill, radius, onClick }) {
  const r = radius || [0, 0, 0, 0]
  return (
    <rect
      x={x} y={y} width={width} height={height}
      fill={fill}
      rx={r[0] || 0}
      style={{ cursor: 'pointer' }}
      onClick={onClick}
    />
  )
}

// 受注率ツールチップ（分母・分子・Wilsonスコアを表示）
function RateTooltipContent({ active, payload }) {
  if (!active || !payload || !payload.length) return null
  const d = payload[0].payload
  return (
    <div className="bg-white border border-slate-200 rounded-lg shadow-lg px-3 py-2 text-sm">
      <p className="font-bold text-slate-700 mb-1">{d.name}</p>
      <p className="text-slate-600">受注率: <span className="font-semibold">{d.rate}%</span></p>
      <p className="text-slate-500 text-xs mt-0.5">受注 {d.won}件 / 提案 {d.denominator}件</p>
      {d.wilson != null && (
        <p className="text-slate-400 text-xs mt-0.5">信頼スコア: {d.wilson.toFixed(1)}%</p>
      )}
    </div>
  )
}

// 決裁者アポ取得率クロス分析ツールチップ
function RevisitCrossTooltip({ active, payload }) {
  if (!active || !payload || !payload.length) return null
  const d = payload[0].payload
  return (
    <div className="bg-white border border-slate-200 rounded-lg shadow-lg px-3 py-2 text-sm">
      <p className="font-bold text-slate-700 mb-1">{d.name}</p>
      <p className="text-slate-600">決裁者アポ取得率: <span className="font-semibold">{d.rate}%</span></p>
      <p className="text-slate-500 text-xs mt-0.5">取得 {d.won}件 / 対象 {d.denominator}件</p>
    </div>
  )
}

function formatYen(amount) {
  if (!amount) return '¥0'
  if (amount >= 100000000) return `¥${(amount / 100000000).toFixed(1)}億`
  if (amount >= 10000) return `¥${(amount / 10000).toFixed(amount % 10000 === 0 ? 0 : 1)}万`
  return `¥${amount.toLocaleString()}`
}

// テレアポ分析用ツールチップ
function TeleapoTooltipContent({ active, payload }) {
  if (!active || !payload || !payload.length) return null
  const d = payload[0].payload
  return (
    <div className="bg-white border border-slate-200 rounded-lg shadow-lg px-3 py-2 text-sm">
      <p className="font-bold text-slate-700 mb-1">{d.name}</p>
      {d.appoRate != null && <p className="text-slate-600">アポ獲得率: <span className="font-semibold">{d.appoRate}%</span></p>}
      {d.calls != null && <p className="text-slate-500 text-xs mt-0.5">架電 {d.calls}件</p>}
      {d.appo != null && <p className="text-slate-500 text-xs">アポ獲得 {d.appo}件</p>}
      {d.value != null && d.appoRate == null && <p className="text-slate-600">{d.value}件</p>}
    </div>
  )
}

export default function Dashboard({ proposals, teleapoItems = [], onNavigate, users = [] }) {
  const [dashboardMode, setDashboardMode] = useState('proposals') // 'proposals' | 'teleapo'
  const [selectedRep, setSelectedRep] = useState([])
  const [selectedIndustry, setSelectedIndustry] = useState([])
  const [selectedRelationship, setSelectedRelationship] = useState([])
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [decisionMakerFilter, setDecisionMakerFilter] = useState('')  // '' | 'yes' | 'no'

  // ダッシュボードの絞り込み状態を提案リストに引き継ぐ
  const navigateWithFilters = (extra = {}) => {
    onNavigate?.({
      ...extra,
      _dashboardFilters: {
        salesRep: selectedRep,
        industry: selectedIndustry,
        relationship: selectedRelationship,
        dateFrom,
        dateTo,
        decisionMaker: decisionMakerFilter,
      },
    })
  }

  // All unique filter options
  const reps = useMemo(() => {
    const set = new Set(users.map(u => u.name))
    proposals.forEach(p => { if (p.salesRep) set.add(p.salesRep) })
    return [...set].sort()
  }, [proposals, users])

  const industries = useMemo(() => {
    return [...new Set(proposals.map(p => p.industry).filter(Boolean))].sort()
  }, [proposals])

  const relationships = useMemo(() => {
    return [...new Set(proposals.map(p => p.relationship).filter(Boolean))].sort()
  }, [proposals])

  // Filtered proposals based on all selected filters
  const filtered = useMemo(() => {
    let result = proposals
    if (selectedRep.length) result = result.filter(p => selectedRep.includes(p.salesRep))
    if (selectedIndustry.length) result = result.filter(p => selectedIndustry.includes(p.industry))
    if (selectedRelationship.length) result = result.filter(p => selectedRelationship.includes(p.relationship))
    if (dateFrom) result = result.filter(p => p.initialDate && p.initialDate >= dateFrom)
    if (dateTo) result = result.filter(p => p.initialDate && p.initialDate <= dateTo)
    if (decisionMakerFilter === 'yes') result = result.filter(p => p.decisionMakerDate)
    if (decisionMakerFilter === 'no') result = result.filter(p => !p.decisionMakerDate)
    return result
  }, [proposals, selectedRep, selectedIndustry, selectedRelationship, dateFrom, dateTo, decisionMakerFilter])

  const hasActiveFilter = selectedRep.length > 0 || selectedIndustry.length > 0 || selectedRelationship.length > 0 || dateFrom || dateTo || decisionMakerFilter

  const stats = useMemo(() => {
    const wonStatuses = ['受注', '決裁者合意']
    const appoConfirmed = filtered.filter(p => p.status === 'アポ確定').length
    const proposals = filtered.filter(p => p.status !== 'アポ確定').length
    const won = filtered.filter(p => wonStatuses.includes(p.status)).length
    const inProgress = filtered.filter(p =>
      ['担当者合意', '決裁者アポ調整中'].includes(p.status)
    ).length
    const lost = filtered.filter(p => p.status === '失注').length
    const winRate = proposals > 0 ? ((won / proposals) * 100).toFixed(1) : 0

    const nonAppo = filtered.filter(p => p.status !== 'アポ確定')
    const expectedTotal = nonAppo.reduce((s, p) => s + (p.expectedAmount || 0), 0)
    const actualTotal = nonAppo.filter(p => wonStatuses.includes(p.status))
      .reduce((s, p) => s + (p.actualAmount || 0), 0)
    const pipelineAmount = nonAppo
      .filter(p => ['担当者合意', '決裁者アポ調整中'].includes(p.status))
      .reduce((s, p) => s + (p.expectedAmount || 0), 0)

    return { total: proposals, won, winRate, appoConfirmed, inProgress, lost, expectedTotal, actualTotal, pipelineAmount }
  }, [filtered])

  const monthlyData = useMemo(() => {
    const map = {}
    const wonStatuses = ['受注', '決裁者合意']

    filtered.filter(p => p.status !== 'アポ確定').forEach(p => {
      if (!p.initialDate) return
      const month = p.initialDate.slice(0, 7)
      if (!map[month]) map[month] = { month, proposals: 0, won: 0, denominator: 0, amount: 0 }
      map[month].proposals++
      map[month].denominator++
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
  }, [filtered])

  const funnelData = useMemo(() => {
    const stages = [
      'アポ確定', '担当者合意', '決裁者アポ調整中', '決裁者合意',
    ]
    return stages.map(status => {
      const items = filtered.filter(p => p.status === status)
      return {
        name: status,
        count: items.length,
        amount: items.reduce((s, p) => s + (p.expectedAmount || 0), 0),
      }
    }).filter(d => d.count > 0)
  }, [filtered])

  const relationshipData = useMemo(() => {
    const map = {}
    const wonStatuses = ['受注', '決裁者合意']

    filtered.filter(p => p.status !== 'アポ確定').forEach(p => {
      if (!p.relationship) return
      if (!map[p.relationship]) map[p.relationship] = { name: p.relationship, denominator: 0, won: 0 }
      map[p.relationship].denominator++
      if (wonStatuses.includes(p.status)) map[p.relationship].won++
    })

    return Object.values(map)
      .map(d => ({
        ...d,
        rate: d.denominator > 0 ? Number(((d.won / d.denominator) * 100).toFixed(1)) : 0,
        wilson: wilsonLower(d.won, d.denominator),
      }))
      .filter(d => d.rate > 0)
      .sort((a, b) => b.wilson - a.wilson)
  }, [filtered])

  const industryData = useMemo(() => {
    const map = {}
    const wonStatuses = ['受注', '決裁者合意']

    filtered.filter(p => p.status !== 'アポ確定').forEach(p => {
      if (!p.industry) return
      if (!map[p.industry]) map[p.industry] = { name: p.industry, denominator: 0, won: 0 }
      map[p.industry].denominator++
      if (wonStatuses.includes(p.status)) map[p.industry].won++
    })

    return Object.values(map)
      .map(d => ({
        ...d,
        rate: d.denominator > 0 ? Number(((d.won / d.denominator) * 100).toFixed(1)) : 0,
        wilson: wilsonLower(d.won, d.denominator),
      }))
      .filter(d => d.rate > 0)
      .sort((a, b) => b.wilson - a.wilson)
  }, [filtered])

  const scaleData = useMemo(() => {
    const map = {}
    const wonStatuses = ['受注', '決裁者合意']

    filtered.filter(p => p.status !== 'アポ確定').forEach(p => {
      if (!p.employeeScale) return
      if (!map[p.employeeScale]) map[p.employeeScale] = { name: p.employeeScale, denominator: 0, won: 0 }
      map[p.employeeScale].denominator++
      if (wonStatuses.includes(p.status)) map[p.employeeScale].won++
    })

    return Object.values(map)
      .map(d => ({ ...d, rate: d.denominator > 0 ? Number(((d.won / d.denominator) * 100).toFixed(1)) : 0 }))
      .filter(d => d.rate > 0)
      .sort((a, b) => {
        const numA = parseInt(a.name) || 0
        const numB = parseInt(b.name) || 0
        return numA - numB
      })
  }, [filtered])

  const lossReasonData = useMemo(() => {
    const map = {}
    filtered.forEach(p => {
      if (p.status === '失注' && p.lossReason) {
        map[p.lossReason] = (map[p.lossReason] || 0) + 1
      }
    })
    return Object.entries(map).map(([name, value]) => ({ name, value }))
  }, [filtered])

  const revisitStats = useMemo(() => {
    const wonStatuses = ['受注', '決裁者合意']
    const eligible = filtered.filter(p => p.status !== 'アポ確定')
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

    const revisitWon = withRevisit.filter(p => wonStatuses.includes(p.status)).length
    const noRevisitWon = withoutRevisit.filter(p => wonStatuses.includes(p.status)).length

    return {
      revisitRate: Number(revisitRate),
      data: [
        { name: '再訪あり', rate: Number(revisitWinRate), denominator: withRevisit.length, won: revisitWon },
        { name: '再訪なし', rate: Number(noRevisitWinRate), denominator: withoutRevisit.length, won: noRevisitWon },
      ]
    }
  }, [filtered])

  // 決裁者アポ取得率クロス分析
  const revisitCross = useMemo(() => {
    const eligible = filtered.filter(p => p.status !== 'アポ確定')

    function calcByKey(keyFn) {
      const map = {}
      eligible.forEach(p => {
        const key = keyFn(p) || '(未設定)'
        if (!map[key]) map[key] = { total: 0, withRevisit: 0 }
        map[key].total++
        if (p.decisionMakerDate) map[key].withRevisit++
      })
      return Object.entries(map)
        .filter(([, v]) => v.total > 0)
        .map(([name, v]) => ({
          name,
          rate: Number(((v.withRevisit / v.total) * 100).toFixed(1)),
          won: v.withRevisit,
          denominator: v.total,
        }))
        .sort((a, b) => b.rate - a.rate)
        .filter(d => d.denominator > 0)
    }

    const byMonth = (() => {
      const map = {}
      eligible.forEach(p => {
        if (!p.initialDate) return
        const month = p.initialDate.slice(0, 7)
        if (!map[month]) map[month] = { total: 0, withRevisit: 0 }
        map[month].total++
        if (p.decisionMakerDate) map[month].withRevisit++
      })
      return Object.entries(map)
        .filter(([, v]) => v.total > 0)
        .map(([name, v]) => ({
          name,
          rate: Number(((v.withRevisit / v.total) * 100).toFixed(1)),
          won: v.withRevisit,
          denominator: v.total,
        }))
        .sort((a, b) => a.name.localeCompare(b.name))
    })()

    return {
      byIndustry: calcByKey(p => p.industry),
      byRep: calcByKey(p => p.salesRep),
      byRelationship: calcByKey(p => p.relationship),
      byScale: calcByKey(p => p.employeeScale),
      byMonth,
    }
  }, [filtered])

  const [revisitTab, setRevisitTab] = useState('byRep')
  const [heatmapTab, setHeatmapTab] = useState('industry_relationship') // 'industry_relationship' | 'industry_scale' | 'relationship_scale'

  // クロス集計ヒートマップデータ
  const heatmapData = useMemo(() => {
    const wonStatuses = ['受注', '決裁者合意']
    const eligible = filtered.filter(p => p.status !== 'アポ確定')

    function buildMatrix(rowKey, colKey) {
      const map = {}
      const rowSet = new Set()
      const colSet = new Set()

      eligible.forEach(p => {
        const r = p[rowKey] || '(未設定)'
        const c = p[colKey] || '(未設定)'
        rowSet.add(r)
        colSet.add(c)
        const key = `${r}|||${c}`
        if (!map[key]) map[key] = { total: 0, won: 0 }
        map[key].total++
        if (wonStatuses.includes(p.status)) map[key].won++
      })

      const rows = [...rowSet].sort()
      const cols = [...colSet].sort()

      // 行の合計受注数で降順ソート
      const rowTotals = {}
      rows.forEach(r => {
        rowTotals[r] = cols.reduce((sum, c) => {
          const d = map[`${r}|||${c}`]
          return sum + (d ? d.won : 0)
        }, 0)
      })
      rows.sort((a, b) => rowTotals[b] - rowTotals[a])

      const matrix = rows.map(r => {
        const cells = cols.map(c => {
          const d = map[`${r}|||${c}`] || { total: 0, won: 0 }
          return {
            col: c,
            total: d.total,
            won: d.won,
            rate: d.total > 0 ? Number(((d.won / d.total) * 100).toFixed(1)) : null,
          }
        })
        return { row: r, cells }
      })

      return { rows, cols, matrix }
    }

    return {
      industry_relationship: buildMatrix('industry', 'relationship'),
      industry_scale: buildMatrix('industry', 'employeeScale'),
      relationship_scale: buildMatrix('relationship', 'employeeScale'),
    }
  }, [filtered])

  const repSummary = useMemo(() => {
    const map = {}
    const wonStatuses = ['受注', '決裁者合意']

    filtered.filter(p => p.status !== 'アポ確定').forEach(p => {
      const name = p.salesRep || '(未設定)'
      if (!map[name]) map[name] = { name, total: 0, won: 0, denominator: 0, expected: 0, actual: 0 }
      map[name].total++
      map[name].denominator++
      if (wonStatuses.includes(p.status)) {
        map[name].won++
        map[name].actual += (p.actualAmount || 0)
      }
      map[name].expected += (p.expectedAmount || 0)
    })

    return Object.values(map)
      .map(r => ({ ...r, winRate: r.denominator > 0 ? Number(((r.won / r.denominator) * 100).toFixed(1)) : 0 }))
      .sort((a, b) => b.total - a.total)
  }, [filtered])

  // ──── テレアポ分析データ ────
  const teleapoSalesReps = useMemo(() => {
    const set = new Set(users.map(u => u.name))
    teleapoItems.forEach(i => { if (i.salesRep) set.add(i.salesRep) })
    proposals.forEach(p => { if (p.salesRep) set.add(p.salesRep) })
    return [...set].sort()
  }, [teleapoItems, proposals, users])

  const [teleapoRepFilter, setTeleapoRepFilter] = useState([])

  const teleapoFiltered = useMemo(() => {
    if (!teleapoRepFilter.length) return teleapoItems
    return teleapoItems.filter(i => teleapoRepFilter.includes(i.salesRep))
  }, [teleapoItems, teleapoRepFilter])

  const teleapoStats = useMemo(() => {
    const items = teleapoFiltered
    const total = items.length
    const allCalls = items.flatMap(i => i.callHistory || [])
    const totalCalls = allCalls.length
    const appoGot = allCalls.filter(c => c.result === 'アポ獲得').length
    const appoRate = totalCalls > 0 ? ((appoGot / totalCalls) * 100).toFixed(1) : 0
    const kept = items.filter(i => i.isKept).length
    const called = items.filter(i => (i.callHistory || []).length > 0).length
    const uncalled = total - called
    const appoConfirmed = items.filter(i => i.status === 'アポ確定').length
    return { total, totalCalls, appoGot, appoRate: Number(appoRate), kept, called, uncalled, appoConfirmed }
  }, [teleapoFiltered])

  const teleapoResultDist = useMemo(() => {
    const allCalls = teleapoFiltered.flatMap(i => i.callHistory || [])
    const map = {}
    allCalls.forEach(c => {
      if (c.result) map[c.result] = (map[c.result] || 0) + 1
    })
    return Object.entries(map)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
  }, [teleapoFiltered])

  const teleapoByIndustry = useMemo(() => {
    const map = {}
    teleapoFiltered.forEach(item => {
      const key = item.industry || '(未設定)'
      if (!map[key]) map[key] = { name: key, calls: 0, appo: 0, companies: 0 }
      map[key].companies++
      const history = item.callHistory || []
      map[key].calls += history.length
      map[key].appo += history.filter(c => c.result === 'アポ獲得').length
    })
    return Object.values(map)
      .map(d => ({ ...d, appoRate: d.calls > 0 ? Number(((d.appo / d.calls) * 100).toFixed(1)) : 0 }))
      .filter(d => d.calls > 0)
      .sort((a, b) => b.appoRate - a.appoRate)
  }, [teleapoFiltered])

  const teleapoByScale = useMemo(() => {
    const map = {}
    teleapoFiltered.forEach(item => {
      const key = item.employeeScale || '(未設定)'
      if (!map[key]) map[key] = { name: key, calls: 0, appo: 0, companies: 0 }
      map[key].companies++
      const history = item.callHistory || []
      map[key].calls += history.length
      map[key].appo += history.filter(c => c.result === 'アポ獲得').length
    })
    return Object.values(map)
      .map(d => ({ ...d, appoRate: d.calls > 0 ? Number(((d.appo / d.calls) * 100).toFixed(1)) : 0 }))
      .filter(d => d.calls > 0)
      .sort((a, b) => {
        const numA = parseInt(a.name) || 9999
        const numB = parseInt(b.name) || 9999
        return numA - numB
      })
  }, [teleapoFiltered])

  const teleapoByRep = useMemo(() => {
    const map = {}
    teleapoFiltered.forEach(item => {
      const key = item.salesRep || '(未設定)'
      if (!map[key]) map[key] = { name: key, calls: 0, appo: 0, companies: 0 }
      map[key].companies++
      const history = item.callHistory || []
      map[key].calls += history.length
      map[key].appo += history.filter(c => c.result === 'アポ獲得').length
    })
    return Object.values(map)
      .map(d => ({ ...d, appoRate: d.calls > 0 ? Number(((d.appo / d.calls) * 100).toFixed(1)) : 0 }))
      .filter(d => d.calls > 0)
      .sort((a, b) => b.calls - a.calls)
  }, [teleapoFiltered])

  const teleapoDaily = useMemo(() => {
    const allCalls = teleapoFiltered.flatMap(i => (i.callHistory || []).map(c => ({ ...c, salesRep: i.salesRep })))
    const map = {}
    allCalls.forEach(c => {
      if (!c.date) return
      const day = c.date.slice(0, 10)
      if (!map[day]) map[day] = { date: day, calls: 0, appo: 0 }
      map[day].calls++
      if (c.result === 'アポ獲得') map[day].appo++
    })
    return Object.values(map).sort((a, b) => a.date.localeCompare(b.date)).slice(-30)
  }, [teleapoFiltered])

  if (proposals.length === 0 && teleapoItems.length === 0) {
    return (
      <div className="text-center py-20 text-slate-400">
        <p className="text-lg mb-2">データがありません</p>
        <p className="text-sm">提案リストまたはテレアポリストからデータを追加してください</p>
      </div>
    )
  }

  return (
    <div>
      {/* ダッシュボードモード切替 */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-bold text-slate-800">ダッシュボード</h2>
          <div className="flex bg-slate-100 rounded-lg p-0.5">
            <button onClick={() => setDashboardMode('proposals')}
              className={`px-4 py-1.5 text-xs font-medium rounded-md transition-colors ${
                dashboardMode === 'proposals'
                  ? 'bg-white text-[#2d6a9e] shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}>
              営業活動
            </button>
            <button onClick={() => setDashboardMode('teleapo')}
              className={`px-4 py-1.5 text-xs font-medium rounded-md transition-colors ${
                dashboardMode === 'teleapo'
                  ? 'bg-white text-[#2d6a9e] shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}>
              テレアポ
            </button>
          </div>
        </div>

        {/* 営業活動モードのフィルター */}
        {dashboardMode === 'proposals' && (
          <div className="flex flex-wrap items-center gap-2">
            {reps.length > 0 && (
              <MultiSelect label="担当" selected={selectedRep} onChange={setSelectedRep} options={reps} placeholder="全担当" />
            )}
            {industries.length > 0 && (
              <MultiSelect label="業種" selected={selectedIndustry} onChange={setSelectedIndustry} options={industries} placeholder="全業種" />
            )}
            {relationships.length > 0 && (
              <MultiSelect label="関係性" selected={selectedRelationship} onChange={setSelectedRelationship} options={relationships} placeholder="全関係性" />
            )}
            <label className="inline-flex items-center gap-1.5 cursor-pointer">
              <input type="checkbox" checked={decisionMakerFilter === 'yes'}
                onChange={e => setDecisionMakerFilter(e.target.checked ? 'yes' : '')}
                className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 h-3.5 w-3.5" />
              <span className={`text-sm ${decisionMakerFilter === 'yes' ? 'text-blue-700 font-medium' : 'text-slate-600'}`}>決裁者アポあり</span>
            </label>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-slate-400 font-medium">期間:</span>
              <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                className={`text-sm border rounded-md px-2 py-1 bg-white focus:outline-none focus:ring-2 focus:ring-blue-400 ${dateFrom ? 'border-blue-300 text-blue-700 bg-blue-50' : 'border-slate-200 text-slate-700'}`} />
              <span className="text-slate-400 text-xs">〜</span>
              <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                className={`text-sm border rounded-md px-2 py-1 bg-white focus:outline-none focus:ring-2 focus:ring-blue-400 ${dateTo ? 'border-blue-300 text-blue-700 bg-blue-50' : 'border-slate-200 text-slate-700'}`} />
            </div>
            {hasActiveFilter && (
              <button onClick={() => { setSelectedRep([]); setSelectedIndustry([]); setSelectedRelationship([]); setDecisionMakerFilter(''); setDateFrom(''); setDateTo('') }}
                className="text-xs text-red-400 hover:text-red-600 px-2 py-1.5 rounded hover:bg-red-50 whitespace-nowrap">全解除</button>
            )}
          </div>
        )}
        {/* テレアポモードのフィルター */}
        {dashboardMode === 'teleapo' && teleapoSalesReps.length > 0 && (
          <div className="flex items-center gap-2">
            <MultiSelect label="担当" selected={teleapoRepFilter} onChange={setTeleapoRepFilter} options={teleapoSalesReps} placeholder="全担当" />
            {teleapoRepFilter.length > 0 && (
              <button onClick={() => setTeleapoRepFilter([])}
                className="text-xs text-red-400 hover:text-red-600 px-2 py-1.5 rounded hover:bg-red-50 whitespace-nowrap">解除</button>
            )}
          </div>
        )}
      </div>
      {dashboardMode === 'proposals' && hasActiveFilter && (
        <div className="flex items-center gap-2 mb-3 text-xs text-slate-500">
          <span className="bg-blue-50 text-blue-600 px-2 py-1 rounded-md font-medium">
            絞り込み中: {filtered.length}件 / {proposals.length}件
          </span>
        </div>
      )}

      {/* ========== テレアポ ダッシュボード ========== */}
      {dashboardMode === 'teleapo' && (
        <div>
          {teleapoItems.length === 0 ? (
            <div className="text-center py-16 text-slate-400">
              <p className="text-base mb-1">テレアポデータがありません</p>
              <p className="text-sm">テレアポリストタブからデータを追加してください</p>
            </div>
          ) : (<>
            {/* KPIカード */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-5 mb-5">
              <KpiCard label="登録企業" value={teleapoStats.total} suffix="社" />
              <KpiCard label="総架電数" value={teleapoStats.totalCalls} suffix="件" color="blue" />
              <KpiCard label="アポ獲得" value={teleapoStats.appoGot} suffix="件" color="green"
                sub={`獲得率 ${teleapoStats.appoRate}%`} />
              <KpiCard label="アポ確定" value={teleapoStats.appoConfirmed} suffix="社" color="purple" />
            </div>
            <div className="grid grid-cols-3 gap-5 mb-6">
              <KpiCard label="架電済" value={teleapoStats.called} suffix="社" color="blue" small />
              <KpiCard label="未架電" value={teleapoStats.uncalled} suffix="社" color="amber" small />
              <KpiCard label="Keep中" value={teleapoStats.kept} suffix="社" color="purple" small />
            </div>

            {/* 日別架電推移 */}
            {teleapoDaily.length > 0 && (
              <ChartCard title="日別架電推移（直近30日）">
                <ResponsiveContainer width="100%" height={220}>
                  <ComposedChart data={teleapoDaily}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="date" tick={{ fontSize: 10 }}
                      tickFormatter={d => `${d.slice(5, 7)}/${d.slice(8, 10)}`} />
                    <YAxis yAxisId="left" tick={{ fontSize: 11 }} />
                    <Tooltip
                      labelFormatter={d => d}
                      contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }}
                    />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar yAxisId="left" dataKey="calls" name="架電数" fill="#4a82ae" radius={[3, 3, 0, 0]} />
                    <Bar yAxisId="left" dataKey="appo" name="アポ獲得" fill="#0f766e" radius={[3, 3, 0, 0]} />
                  </ComposedChart>
                </ResponsiveContainer>
              </ChartCard>
            )}

            {/* 架電結果分布 + 担当別架電数 */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4 items-start">
              {teleapoResultDist.length > 0 && (
                <ChartCard title="架電結果分布">
                  <ResponsiveContainer width="100%" height={240}>
                    <PieChart>
                      <Pie data={teleapoResultDist} cx="50%" cy="50%" outerRadius={90} dataKey="value"
                        label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                        {teleapoResultDist.map((d, i) => {
                          const maxV = Math.max(...teleapoResultDist.map(x => x.value), 1)
                          return <Cell key={i} fill={navyByValue(d.value, maxV)} />
                        })}
                      </Pie>
                      <Tooltip contentStyle={{ fontSize: 13, borderRadius: 8 }} />
                    </PieChart>
                  </ResponsiveContainer>
                </ChartCard>
              )}

              {teleapoByRep.length > 0 && (
                <ChartCard title="担当別架電実績">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50">
                        <tr>
                          <th className="px-3 py-2 text-left text-xs font-medium text-slate-500">担当</th>
                          <th className="px-3 py-2 text-right text-xs font-medium text-slate-500">企業数</th>
                          <th className="px-3 py-2 text-right text-xs font-medium text-slate-500">架電数</th>
                          <th className="px-3 py-2 text-right text-xs font-medium text-slate-500">アポ獲得</th>
                          <th className="px-3 py-2 text-right text-xs font-medium text-slate-500">獲得率</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {teleapoByRep.map(r => (
                          <tr key={r.name} className="hover:bg-slate-50">
                            <td className="px-3 py-2 font-medium text-slate-800">
                              <div className="flex items-center gap-2">
                                <div className="w-6 h-6 rounded-full bg-gradient-to-br from-[#4a82ae] to-[#2d6a9e] flex items-center justify-center text-white text-[10px] font-bold shrink-0">
                                  {r.name.slice(0, 1)}
                                </div>
                                {r.name}
                              </div>
                            </td>
                            <td className="px-3 py-2 text-right">{r.companies}</td>
                            <td className="px-3 py-2 text-right font-medium">{r.calls}</td>
                            <td className="px-3 py-2 text-right text-[#0f766e] font-medium">{r.appo}</td>
                            <td className="px-3 py-2 text-right">
                              <span className={`inline-block px-1.5 py-0.5 rounded text-xs font-bold ${
                                r.appoRate >= 10 ? 'bg-green-100 text-green-700' :
                                r.appoRate >= 5 ? 'bg-yellow-100 text-yellow-700' :
                                'bg-slate-100 text-slate-500'
                              }`}>{r.appoRate}%</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </ChartCard>
              )}
            </div>

            {/* 業種別・従業員規模別アポ獲得率 */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4 items-start">
              {teleapoByIndustry.length > 0 && (() => {
                const chartH = Math.max(180, teleapoByIndustry.length * 38)
                const maxRate = niceMax(teleapoByIndustry, 'appoRate')
                const ticks = Array.from({ length: maxRate / 10 + 1 }, (_, i) => i * 10)
                return (
                  <ChartCard title="業種別アポ獲得率">
                    <ResponsiveContainer width="100%" height={chartH}>
                      <BarChart data={teleapoByIndustry} layout="vertical" margin={{ left: 0, right: 40 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                        <XAxis type="number" domain={[0, maxRate]} ticks={ticks} unit="%" tick={{ fontSize: 12 }} />
                        <YAxis type="category" dataKey="name" tick={{ fontSize: 12 }} width={130}
                          tickFormatter={(name) => {
                            const d = teleapoByIndustry.find(r => r.name === name)
                            const label = name.length > 5 ? name.slice(0, 5) + '…' : name
                            return d ? `${label}(${d.calls})` : label
                          }} />
                        <Tooltip content={<TeleapoTooltipContent />} />
                        <Bar dataKey="appoRate" name="アポ獲得率" barSize={20}
                          label={{ position: 'right', fontSize: 11, fill: '#64748b', formatter: (v) => `${v}%` }}
                          shape={(props) => <ClickableBar {...props} fill={navyByValue(props.payload?.appoRate || 0, maxRate)} />} />
                      </BarChart>
                    </ResponsiveContainer>
                  </ChartCard>
                )
              })()}

              {teleapoByScale.length > 0 && (
                <ChartCard title="従業員規模別アポ獲得率">
                  <ResponsiveContainer width="100%" height={240}>
                    <BarChart data={teleapoByScale} margin={{ right: 10 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                      <YAxis domain={[0, niceMax(teleapoByScale, 'appoRate')]}
                        ticks={Array.from({ length: niceMax(teleapoByScale, 'appoRate') / 10 + 1 }, (_, i) => i * 10)}
                        unit="%" tick={{ fontSize: 12 }} />
                      <Tooltip content={<TeleapoTooltipContent />} />
                      <Bar dataKey="appoRate" name="アポ獲得率"
                        label={{ position: 'top', fontSize: 11, fill: '#64748b', formatter: (v) => `${v}%` }}
                        shape={(props) => {
                          const scaleMax = niceMax(teleapoByScale, 'appoRate')
                          return <ClickableBar {...props} fill={navyByValue(props.payload?.appoRate || 0, scaleMax)} />
                        }} />
                    </BarChart>
                  </ResponsiveContainer>
                </ChartCard>
              )}
            </div>
          </>)}
        </div>
      )}

      {/* ========== 営業活動 ダッシュボード ========== */}
      {dashboardMode === 'proposals' && proposals.length === 0 && (
        <div className="text-center py-16 text-slate-400">
          <p className="text-base mb-1">提案データがありません</p>
          <p className="text-sm">提案リストタブからデータを追加してください</p>
        </div>
      )}

      {dashboardMode === 'proposals' && proposals.length > 0 && (<>

      {/* KPI Cards - Top Row: Main Metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-5 mb-5">
        <KpiCard label="提案数" value={stats.total} suffix="件" onClick={() => navigateWithFilters({})} />
        <KpiCard label="アポ確定" value={stats.appoConfirmed} suffix="件" color="blue" onClick={() => navigateWithFilters({ status: 'アポ確定' })} />
        <KpiCard label="受注" value={stats.won} suffix="件" sub={`受注率 ${stats.winRate}%`} color="green" onClick={() => navigateWithFilters({ status: '受注' })} />
        <KpiCard label="進行中" value={stats.inProgress} suffix="件" color="amber" onClick={() => navigateWithFilters({ status: '進行中' })} />
        <KpiCard label="失注" value={stats.lost} suffix="件" color="red" onClick={() => navigateWithFilters({ status: '失注' })} />
      </div>
      {/* KPI Cards - Bottom Row: Revenue */}
      <div className="grid grid-cols-3 gap-5 mb-6">
        <KpiCard label="見込み合計" value={formatYen(stats.expectedTotal)} color="blue" small />
        <KpiCard label="受注金額" value={formatYen(stats.actualTotal)} color="green" small />
        <KpiCard label="パイプライン" value={formatYen(stats.pipelineAmount)} color="purple" small />
      </div>

      {/* Pipeline - Full Width */}
      {funnelData.length > 0 && (
        <ChartCard title="パイプライン">
          <PipelineBar data={funnelData} onClickSegment={(status) => navigateWithFilters({ status })} />
        </ChartCard>
      )}

      {/* Monthly Trend - Full Width */}
      {monthlyData.length > 0 && (
        <ChartCard title="月別推移">
          <ResponsiveContainer width="100%" height={220}>
            <ComposedChart data={monthlyData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} />
              <YAxis yAxisId="left" tick={{ fontSize: 11 }} />
              <YAxis yAxisId="right" orientation="right" domain={[0, niceMax(monthlyData, 'winRate')]} ticks={Array.from({ length: niceMax(monthlyData, 'winRate') / 10 + 1 }, (_, i) => i * 10)} tick={{ fontSize: 11 }} unit="%" />
              <Tooltip
                contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar yAxisId="left" dataKey="proposals" name="提案数" fill="#4a82ae" radius={[3, 3, 0, 0]} />
              <Bar yAxisId="left" dataKey="won" name="受注数" fill="#0f766e" radius={[3, 3, 0, 0]} />
              <Line yAxisId="right" type="monotone" dataKey="winRate" name="受注率(%)" stroke="#b45309" strokeWidth={2} dot={{ r: 3 }} />
            </ComposedChart>
          </ResponsiveContainer>
        </ChartCard>
      )}

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
                        <div className="w-6 h-6 rounded-full bg-gradient-to-br from-[#4a82ae] to-[#2d6a9e] flex items-center justify-center text-white text-[10px] font-bold shrink-0">
                          {r.name.slice(0, 1)}
                        </div>
                        {r.name}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right">{r.denominator}</td>
                    <td className="px-3 py-2 text-right text-[#0f766e] font-medium">{r.won}</td>
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
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4 items-start">
        {(() => {
          const rateChartMax = niceMax([...relationshipData, ...industryData], 'rate')
          const rateTicks = Array.from({ length: rateChartMax / 10 + 1 }, (_, i) => i * 10)
          const maxRows = Math.max(relationshipData.length, industryData.length)
          const chartH = Math.max(180, maxRows * 38)
          return (<>
            {relationshipData.length > 0 && (
              <ChartCard title="関係性別受注率" sub="Wilson Score順（件数×率を加味）">
                <ResponsiveContainer width="100%" height={chartH}>
                  <BarChart data={relationshipData} layout="vertical" margin={{ left: 0, right: 40 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis type="number" domain={[0, rateChartMax]} ticks={rateTicks} unit="%" tick={{ fontSize: 12 }} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 12 }} width={130}
                      tickFormatter={(name) => {
                        const d = relationshipData.find(r => r.name === name)
                        const label = name.length > 5 ? name.slice(0, 5) + '…' : name
                        return d ? `${label}(${d.denominator})` : label
                      }} />
                    <Tooltip content={<RateTooltipContent />} />
                    <Bar dataKey="rate" name="受注率" fill="#2d6a9e" barSize={20}
                      label={{ position: 'right', fontSize: 11, fill: '#64748b', formatter: (v) => `${v}%` }}
                      shape={(props) => <ClickableBar {...props} fill={navyByValue(props.payload?.rate || 0, rateChartMax)} onClick={() => navigateWithFilters({ relationship: props.payload?.name })} />} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>
            )}

            {industryData.length > 0 && (
              <ChartCard title="業種別受注率" sub="Wilson Score順（件数×率を加味）">
                <ResponsiveContainer width="100%" height={chartH}>
                  <BarChart data={industryData} layout="vertical" margin={{ left: 0, right: 40 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis type="number" domain={[0, rateChartMax]} ticks={rateTicks} unit="%" tick={{ fontSize: 12 }} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 12 }} width={130}
                      tickFormatter={(name) => {
                        const d = industryData.find(r => r.name === name)
                        const label = name.length > 5 ? name.slice(0, 5) + '…' : name
                        return d ? `${label}(${d.denominator})` : label
                      }} />
                    <Tooltip content={<RateTooltipContent />} />
                    <Bar dataKey="rate" name="受注率" fill="#4a82ae" barSize={20}
                      label={{ position: 'right', fontSize: 11, fill: '#64748b', formatter: (v) => `${v}%` }}
                      shape={(props) => <ClickableBar {...props} fill={navyByValue(props.payload?.rate || 0, rateChartMax)} onClick={() => navigateWithFilters({ industry: props.payload?.name })} />} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>
            )}
          </>)
        })()}

        {scaleData.length > 0 && (
          <ChartCard title="従業員規模別受注率">
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={scaleData} margin={{ right: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis domain={[0, niceMax(scaleData, 'rate')]} ticks={Array.from({ length: niceMax(scaleData, 'rate') / 10 + 1 }, (_, i) => i * 10)} unit="%" tick={{ fontSize: 12 }} />
                <Tooltip content={<RateTooltipContent />} />
                <Bar dataKey="rate" name="受注率" fill="#4a82ae"
                  shape={(props) => {
                    const scaleMax = niceMax(scaleData, 'rate')
                    return <ClickableBar {...props} fill={navyByValue(props.payload?.rate || 0, scaleMax)}
                      onClick={() => navigateWithFilters({ employeeScale: props.payload?.name })} />
                  }}>
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        )}

        {lossReasonData.length > 0 && (
          <ChartCard title="失注理由">
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie data={lossReasonData} cx="50%" cy="50%" outerRadius={90} dataKey="value"
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  onClick={(_, idx) => navigateWithFilters({ status: '失注', lossReason: lossReasonData[idx]?.name })}
                  className="cursor-pointer">
                  {lossReasonData.map((d, i) => {
                    const maxV = Math.max(...lossReasonData.map(x => x.value), 1)
                    return <Cell key={i} fill={navyByValue(d.value, maxV)} className="cursor-pointer" />
                  })}
                </Pie>
                <Tooltip contentStyle={{ fontSize: 13, borderRadius: 8 }} />
              </PieChart>
            </ResponsiveContainer>
          </ChartCard>
        )}
      </div>

      {/* クロス集計ヒートマップ */}
      {filtered.filter(p => p.status !== 'アポ確定').length > 0 && (
      <div className="bg-white rounded-lg shadow p-5 mb-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
          <h3 className="text-sm font-bold text-slate-700">クロス集計ヒートマップ<span className="text-xs font-normal text-slate-400 ml-2">受注率（提案数）</span></h3>
          <div className="flex bg-slate-100 rounded-lg p-0.5">
            {[
              { key: 'industry_relationship', label: '業種×関係性' },
              { key: 'industry_scale', label: '業種×規模' },
              { key: 'relationship_scale', label: '関係性×規模' },
            ].map(t => (
              <button key={t.key} onClick={() => setHeatmapTab(t.key)}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${heatmapTab === t.key ? 'bg-white text-[#1a5285] shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                {t.label}
              </button>
            ))}
          </div>
        </div>
        {(() => {
          const data = heatmapData[heatmapTab]
          if (!data || data.matrix.length === 0) return <p className="text-sm text-slate-400 text-center py-4">データなし</p>

          // 全セルのrate最大値を取得（色の基準）
          const allRates = data.matrix.flatMap(r => r.cells.map(c => c.rate)).filter(r => r !== null)
          const maxRate = Math.max(...allRates, 1)

          return (
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr>
                    <th className="sticky left-0 bg-white z-10 text-left px-2 py-2 text-slate-500 font-medium border-b border-slate-200 min-w-[100px]"></th>
                    {data.cols.map(col => (
                      <th key={col} className="px-2 py-2 text-center text-slate-600 font-medium border-b border-slate-200 whitespace-nowrap min-w-[70px]">
                        {col.length > 6 ? col.slice(0, 6) + '…' : col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.matrix.map((row) => (
                    <tr key={row.row}>
                      <td className="sticky left-0 bg-white z-10 px-2 py-2 text-slate-700 font-medium border-b border-slate-100 whitespace-nowrap">
                        {row.row.length > 8 ? row.row.slice(0, 8) + '…' : row.row}
                      </td>
                      {row.cells.map((cell) => {
                        if (cell.total === 0) {
                          return <td key={cell.col} className="px-2 py-2 text-center border-b border-slate-100 text-slate-300">-</td>
                        }
                        const intensity = cell.rate / maxRate
                        const bgColor = cell.rate > 0
                          ? `rgba(26, 82, 133, ${0.08 + intensity * 0.55})`
                          : 'rgba(226, 232, 240, 0.3)'
                        const textColor = intensity > 0.5 ? '#fff' : '#334155'
                        return (
                          <td key={cell.col} className="px-2 py-2 text-center border-b border-slate-100 cursor-default"
                            style={{ backgroundColor: bgColor, color: textColor }}
                            title={`${row.row} × ${cell.col}\n受注率: ${cell.rate}%（受注${cell.won}件 / 提案${cell.total}件）`}>
                            <div className="font-bold leading-tight">{cell.rate}%</div>
                            <div className="text-[10px] leading-tight" style={{ opacity: 0.75 }}>({cell.total})</div>
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        })()}
      </div>
      )}

      {/* 決裁者アポ取得率分析 - 2カラムレイアウト */}
      <div className="bg-white rounded-lg shadow p-5 mb-4">
        <h3 className="text-sm font-bold text-slate-700 mb-4">決裁者アポ取得率</h3>
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          {/* 左カラム：全体サマリー */}
          <div className="lg:col-span-2">
            <div className="text-center mb-4">
              <div className="inline-flex items-center justify-center w-28 h-28 rounded-full border-4 border-[#2d6a9e] mb-2">
                <div>
                  <p className="text-2xl font-bold text-[#1a5285]">{revisitStats.revisitRate}%</p>
                  <p className="text-[10px] text-slate-400">全体取得率</p>
                </div>
              </div>
              <p className="text-xs text-slate-500">
                {revisitStats.data[0]?.denominator || 0} / {(revisitStats.data[0]?.denominator || 0) + (revisitStats.data[1]?.denominator || 0)}件
              </p>
            </div>
            <div className="space-y-2">
              <div className="bg-teal-50 rounded-lg px-3 py-2.5 border border-teal-200">
                <div className="flex justify-between items-center mb-1">
                  <span className="text-xs font-medium text-[#0f766e]">決裁者アポあり</span>
                  <span className="text-sm font-bold text-[#0f766e]">受注率 {revisitStats.data[0]?.rate || 0}%</span>
                </div>
                <div className="flex justify-between text-[10px] text-slate-500">
                  <span>{revisitStats.data[0]?.denominator || 0}件</span>
                  <span>受注 {revisitStats.data[0]?.won || 0}件</span>
                </div>
              </div>
              <div className="bg-slate-50 rounded-lg px-3 py-2.5 border border-slate-200">
                <div className="flex justify-between items-center mb-1">
                  <span className="text-xs font-medium text-slate-600">決裁者アポなし</span>
                  <span className="text-sm font-bold text-slate-600">受注率 {revisitStats.data[1]?.rate || 0}%</span>
                </div>
                <div className="flex justify-between text-[10px] text-slate-500">
                  <span>{revisitStats.data[1]?.denominator || 0}件</span>
                  <span>受注 {revisitStats.data[1]?.won || 0}件</span>
                </div>
              </div>
            </div>
          </div>

          {/* 右カラム：クロス分析 */}
          <div className="lg:col-span-3">
            <div className="flex flex-wrap gap-1 mb-3">
              {[
                { id: 'byRep', label: '担当別' },
                { id: 'byIndustry', label: '業種別' },
                { id: 'byRelationship', label: '関係性別' },
                { id: 'byScale', label: '規模別' },
                { id: 'byMonth', label: '月別' },
              ].map(t => (
                <button key={t.id} onClick={() => setRevisitTab(t.id)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                    revisitTab === t.id
                      ? 'bg-sky-100 text-[#2d6a9e] border border-sky-300'
                      : 'bg-slate-50 text-slate-500 border border-slate-200 hover:bg-slate-100'
                  }`}>
                  {t.label}
                </button>
              ))}
            </div>
            {(() => {
              const crossData = revisitCross[revisitTab] || []
              if (crossData.length === 0) return <p className="text-sm text-slate-400 text-center py-8">データなし</p>

              if (revisitTab === 'byMonth') {
                return (
                  <ResponsiveContainer width="100%" height={220}>
                    <ComposedChart data={crossData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="name" tick={{ fontSize: 10 }}
                        tickFormatter={d => d.length >= 7 ? `${d.slice(2, 4)}/${d.slice(5, 7)}` : d} />
                      <YAxis yAxisId="left" unit="%" tick={{ fontSize: 11 }} domain={[0, 100]} />
                      <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} />
                      <Tooltip content={<RevisitCrossTooltip />} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Bar yAxisId="right" dataKey="denominator" name="提案数" fill="#dbe6f0" radius={[3, 3, 0, 0]} />
                      <Line yAxisId="left" type="monotone" dataKey="rate" name="取得率" stroke="#1a5285" strokeWidth={2} dot={{ r: 4 }} />
                    </ComposedChart>
                  </ResponsiveContainer>
                )
              }

              const chartH = Math.max(160, crossData.length * 32)
              const maxVal = niceMax(crossData, 'rate')
              const ticks = Array.from({ length: maxVal / 10 + 1 }, (_, i) => i * 10)
              return (
                <ResponsiveContainer width="100%" height={chartH}>
                  <BarChart data={crossData} layout="vertical" margin={{ left: 0, right: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis type="number" domain={[0, maxVal]} ticks={ticks} unit="%" tick={{ fontSize: 11 }} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={110}
                      tickFormatter={(name) => {
                        const label = name.length > 6 ? name.slice(0, 6) + '…' : name
                        const d = crossData.find(r => r.name === name)
                        return d ? `${label}(${d.denominator})` : label
                      }} />
                    <Tooltip content={<RevisitCrossTooltip />} />
                    <Bar dataKey="rate" name="決裁者アポ取得率" fill="#2d6a9e" barSize={18}
                      shape={(props) => <ClickableBar {...props} fill={navyByValue(props.payload?.rate || 0, maxVal)} />} />
                  </BarChart>
                </ResponsiveContainer>
              )
            })()}
          </div>
        </div>
      </div>
      </>)}
    </div>
  )
}

/* ─── KPI Card ─── */
const KPI_TEXT = { green: 'text-[#0f766e]', amber: 'text-[#b45309]', red: 'text-[#be123c]', blue: 'text-[#2d6a9e]', purple: 'text-[#4a82ae]' }
const KPI_BG = { green: 'border-teal-200', amber: 'border-amber-200', red: 'border-rose-200', blue: 'border-sky-200', purple: 'border-slate-200' }
const KPI_DOT = { green: 'bg-[#0f766e]', amber: 'bg-[#b45309]', red: 'bg-[#be123c]', blue: 'bg-[#2d6a9e]', purple: 'bg-[#4a82ae]' }

function KpiCard({ label, value, suffix, sub, color, small, onClick }) {
  return (
    <div
      className={`bg-white rounded-lg shadow-sm border ${KPI_BG[color] || 'border-slate-100'} ${small ? 'px-4 py-3' : 'px-5 py-4'} ${onClick ? 'cursor-pointer hover:shadow-md transition-shadow' : ''}`}
      onClick={onClick}>
      <div className="flex items-center gap-1.5 mb-1">
        <span className={`w-2 h-2 rounded-full ${KPI_DOT[color] || 'bg-slate-300'}`} />
        <span className="text-xs text-slate-500 font-medium">{label}</span>
      </div>
      <div className="flex items-baseline gap-1">
        <span className={`${small ? 'text-lg' : 'text-2xl'} font-bold leading-tight ${KPI_TEXT[color] || 'text-slate-800'}`}>{value}</span>
        {suffix && <span className="text-sm text-slate-400">{suffix}</span>}
      </div>
      {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
    </div>
  )
}

/* ─── 100% Stacked Horizontal Pipeline Bar ─── */
function PipelineBar({ data, onClickSegment }) {
  if (!data || data.length === 0) {
    return <p className="text-sm text-slate-400 text-center py-4">データなし</p>
  }

  const totalCount = data.reduce((s, d) => s + d.count, 0)

  return (
    <div>
      {/* Stacked bar with labels below each segment */}
      <div className="flex w-full rounded-lg overflow-hidden" style={{ height: 52 }}>
        {data.map((d, i) => {
          const pct = totalCount > 0 ? (d.count / totalCount) * 100 : 0
          if (pct === 0) return null
          return (
            <div
              key={d.name}
              onClick={() => onClickSegment?.(d.name)}
              className="relative group flex items-center justify-center overflow-hidden transition-all duration-300 cursor-pointer"
              style={{
                width: `${pct}%`,
                backgroundColor: FUNNEL_COLORS[i % FUNNEL_COLORS.length],
                minWidth: pct > 0 ? 4 : 0,
              }}
            >
              {pct >= 6 && (
                <span className="text-white text-sm font-bold whitespace-nowrap leading-none drop-shadow-sm">
                  {pct.toFixed(0)}%
                </span>
              )}
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
      {/* Inline legend */}
      <div className="flex flex-wrap gap-x-6 gap-y-1.5 mt-3">
        {data.map((d, i) => {
          const pct = totalCount > 0 ? ((d.count / totalCount) * 100).toFixed(0) : 0
          return (
            <span key={d.name} onClick={() => onClickSegment?.(d.name)} className="flex items-center gap-1.5 text-sm text-slate-700 whitespace-nowrap cursor-pointer hover:text-blue-600 transition-colors">
              <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: FUNNEL_COLORS[i % FUNNEL_COLORS.length] }} />
              {d.name} <span className="font-semibold">{d.count}件</span><span className="text-slate-400">({pct}%)</span>
            </span>
          )
        })}
      </div>
    </div>
  )
}


/* ─── Chart Card Wrapper ─── */
function ChartCard({ title, sub, children }) {
  return (
    <div className="bg-white rounded-lg shadow px-6 py-5 mb-5">
      <div className="flex items-baseline gap-2 mb-3">
        <h3 className="text-sm font-bold text-slate-700">{title}</h3>
        {sub && <span className="text-[11px] text-slate-400">{sub}</span>}
      </div>
      {children}
    </div>
  )
}
