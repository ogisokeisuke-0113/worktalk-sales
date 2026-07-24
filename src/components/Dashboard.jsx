import { useMemo, useState } from 'react'
import MultiSelect from './MultiSelect'
import {
  BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  ComposedChart, Line,
} from 'recharts'
import { FUNNEL_COLORS, EMPLOYEE_SCALES } from '../constants'

const COLORS = ['#1a5285', '#2d6a9e', '#4a82ae', '#6e9bbf', '#93b5d0', '#0f8a7e', '#c97a1a', '#d94452']

const HEATMAP_KEYS = {
  industry_relationship: { row: 'industry', col: 'relationship' },
  industry_scale: { row: 'industry', col: 'employeeScale' },
  relationship_scale: { row: 'relationship', col: 'employeeScale' },
}

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
  const [hovered, setHovered] = useState(false)
  const r = radius || [0, 0, 0, 0]
  return (
    <rect
      x={x} y={y} width={width} height={height}
      fill={fill}
      rx={r[0] || 0}
      style={{ cursor: 'pointer', opacity: hovered ? 0.65 : 1, transition: 'opacity 0.12s ease' }}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
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

export default function Dashboard({ proposals, teleapoItems = [], onNavigate, onNavigateTeleapo, users = [] }) {
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

  // テレアポリストへのナビゲーション（担当フィルターを引き継ぐ）
  const navigateTeleapoWithFilters = (extra = {}) => {
    onNavigateTeleapo?.({
      ...extra,
      _teleapoRepFilter: teleapoRepFilter,
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

    return { total: proposals, won, winRate, appoConfirmed, inProgress, lost }
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
    const concludedStatuses = ['受注', '決裁者合意', '失注']

    // 結論済み案件のみを対象（進行中は除外）
    filtered.filter(p => concludedStatuses.includes(p.status)).forEach(p => {
      if (!p.employeeScale) return
      // 旧区分データは除外（EMPLOYEE_SCALES に含まれないもの）
      if (!EMPLOYEE_SCALES.includes(p.employeeScale)) return
      if (!map[p.employeeScale]) map[p.employeeScale] = { name: p.employeeScale, denominator: 0, won: 0 }
      map[p.employeeScale].denominator++
      if (wonStatuses.includes(p.status)) map[p.employeeScale].won++
    })

    return Object.values(map)
      .map(d => ({ ...d, rate: d.denominator > 0 ? Number(((d.won / d.denominator) * 100).toFixed(1)) : 0 }))
      .filter(d => d.denominator > 0)
      // EMPLOYEE_SCALES の定義順でソート
      .sort((a, b) => EMPLOYEE_SCALES.indexOf(a.name) - EMPLOYEE_SCALES.indexOf(b.name))
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
      }
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
  const [teleapoIndustryFilter, setTeleapoIndustryFilter] = useState([])
  const [teleapoDateFrom, setTeleapoDateFrom] = useState('')
  const [teleapoDateTo, setTeleapoDateTo] = useState('')

  const [emailIndustryFilter, setEmailIndustryFilter] = useState([])
  const [emailDateFrom, setEmailDateFrom] = useState('')
  const [emailDateTo, setEmailDateTo] = useState('')

  const teleapoFiltered = useMemo(() => {
    if (!teleapoRepFilter.length) return teleapoItems
    return teleapoItems.filter(i => teleapoRepFilter.includes(i.salesRep))
  }, [teleapoItems, teleapoRepFilter])

  const allIndustries = useMemo(() => {
    const set = new Set()
    teleapoItems.forEach(i => { if (i.industry) set.add(i.industry) })
    return [...set].sort()
  }, [teleapoItems])

  const emailFiltered = useMemo(() => {
    return teleapoItems.filter(item => {
      if (emailIndustryFilter.length > 0 && !emailIndustryFilter.includes(item.industry || '(未設定)')) return false
      if (emailDateFrom || emailDateTo) {
        const sentAt = item.emailSentAt ? item.emailSentAt.slice(0, 10) : null
        if (!sentAt) return false
        if (emailDateFrom && sentAt < emailDateFrom) return false
        if (emailDateTo && sentAt > emailDateTo) return false
      }
      return true
    })
  }, [teleapoItems, emailIndustryFilter, emailDateFrom, emailDateTo])

  // 架電日時で絞り込んだ版（callHistoryのみフィルタ、企業リストは全件）
  const teleapoCallFiltered = useMemo(() => {
    if (!teleapoDateFrom && !teleapoDateTo) return teleapoFiltered
    return teleapoFiltered.map(item => ({
      ...item,
      callHistory: (item.callHistory || []).filter(c => {
        if (!c.date) return false
        const day = c.date.slice(0, 10)
        if (teleapoDateFrom && day < teleapoDateFrom) return false
        if (teleapoDateTo && day > teleapoDateTo) return false
        return true
      }),
    }))
  }, [teleapoFiltered, teleapoDateFrom, teleapoDateTo])

  const teleapoStats = useMemo(() => {
    const total = teleapoFiltered.length
    const allCalls = teleapoCallFiltered.flatMap(i => i.callHistory || [])
    const totalCalls = allCalls.length
    const kept = teleapoFiltered.filter(i => i.isKept).length
    const called = teleapoCallFiltered.filter(i => (i.callHistory || []).length > 0).length
    const uncalled = total - called
    const appoConfirmed = teleapoFiltered.filter(i => i.status === 'アポ確定').length
    const totalKeeps = teleapoFiltered.reduce((s, i) => s + (i.keepHistory || []).length, 0)
    const connected = allCalls.filter(c => !['不在', '受付ブロック'].includes(c.result)).length
    const connectionRate = totalCalls > 0 ? Number(((connected / totalCalls) * 100).toFixed(1)) : 0
    const digestRate = total > 0 ? Number(((called / total) * 100).toFixed(1)) : 0
    const appoRate = called > 0 ? Number(((appoConfirmed / called) * 100).toFixed(1)) : 0
    return { total, totalCalls, kept, called, uncalled, appoConfirmed, totalKeeps, connectionRate, digestRate, appoRate }
  }, [teleapoFiltered, teleapoCallFiltered])

  // ファネル（登録 → 架電済 → アポ確定）
  const teleapoFunnel = useMemo(() => {
    const total = teleapoFiltered.length
    const called = teleapoCallFiltered.filter(i => (i.callHistory || []).length > 0).length
    const appo = teleapoFiltered.filter(i => i.status === 'アポ確定').length
    return [
      { label: '登録企業', value: total, rate: null },
      { label: '架電済', value: called, rate: total > 0 ? Number(((called / total) * 100).toFixed(1)) : 0 },
      { label: 'アポ確定', value: appo, rate: called > 0 ? Number(((appo / called) * 100).toFixed(1)) : 0 },
    ]
  }, [teleapoFiltered, teleapoCallFiltered])

  // 週別架電推移（結果別積み上げ）
  const teleapoWeekly = useMemo(() => {
    const allCalls = teleapoCallFiltered.flatMap(i => i.callHistory || [])
    const map = {}
    allCalls.forEach(c => {
      if (!c.date) return
      const d = new Date(c.date)
      const mon = new Date(d); mon.setDate(d.getDate() - ((d.getDay() + 6) % 7))
      const key = mon.toISOString().slice(0, 10)
      const label = `${mon.getMonth() + 1}/${mon.getDate()}`
      if (!map[key]) map[key] = { week: key, label, total: 0 }
      const r = c.result || '不明'
      map[key][r] = (map[key][r] || 0) + 1
      map[key].total++
    })
    return Object.values(map).sort((a, b) => a.week.localeCompare(b.week)).slice(-16)
  }, [teleapoCallFiltered])

  const teleapoResultDist = useMemo(() => {
    const allCalls = teleapoCallFiltered.flatMap(i => i.callHistory || [])
    const map = {}
    allCalls.forEach(c => {
      if (c.result) map[c.result] = (map[c.result] || 0) + 1
    })
    return Object.entries(map)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
  }, [teleapoCallFiltered])

  const teleapoByIndustry = useMemo(() => {
    const map = {}
    // 母数は架電済み企業のみ
    teleapoCallFiltered.filter(i => (i.callHistory || []).length > 0).forEach(item => {
      const key = item.industry || '(未設定)'
      if (teleapoIndustryFilter.length > 0 && !teleapoIndustryFilter.includes(key)) return
      if (!map[key]) map[key] = { name: key, calls: 0, appo: 0, companies: 0, connected: 0 }
      map[key].companies++
      const history = item.callHistory || []
      map[key].calls += history.length
      map[key].connected += history.filter(c => !['不在', '受付ブロック'].includes(c.result)).length
    })
    teleapoFiltered.filter(i => i.status === 'アポ確定').forEach(item => {
      const key = item.industry || '(未設定)'
      if (teleapoIndustryFilter.length > 0 && !teleapoIndustryFilter.includes(key)) return
      if (map[key]) map[key].appo++
    })
    return Object.values(map)
      .map(d => ({
        ...d,
        appoRate: d.companies > 0 ? Number(((d.appo / d.companies) * 100).toFixed(1)) : 0,
        connectionRate: d.calls > 0 ? Number(((d.connected / d.calls) * 100).toFixed(1)) : 0,
      }))
      .sort((a, b) => b.companies - a.companies)
  }, [teleapoCallFiltered, teleapoFiltered, teleapoIndustryFilter])

  const teleapoByScale = useMemo(() => {
    const map = {}
    // 母数は架電済み企業のみ
    teleapoCallFiltered.filter(i => (i.callHistory || []).length > 0).forEach(item => {
      const key = item.employeeScale || '(未設定)'
      if (!map[key]) map[key] = { name: key, calls: 0, appo: 0, companies: 0, connected: 0 }
      map[key].companies++
      const history = item.callHistory || []
      map[key].calls += history.length
      map[key].connected += history.filter(c => !['不在', '受付ブロック'].includes(c.result)).length
    })
    teleapoFiltered.filter(i => i.status === 'アポ確定').forEach(item => {
      const key = item.employeeScale || '(未設定)'
      if (map[key]) map[key].appo++
    })
    return Object.values(map)
      .map(d => ({
        ...d,
        appoRate: d.companies > 0 ? Number(((d.appo / d.companies) * 100).toFixed(1)) : 0,
        connectionRate: d.calls > 0 ? Number(((d.connected / d.calls) * 100).toFixed(1)) : 0,
      }))
      .sort((a, b) => {
        const numA = parseInt(a.name) || 9999
        const numB = parseInt(b.name) || 9999
        return numA - numB
      })
  }, [teleapoCallFiltered, teleapoFiltered])

  const teleapoByRep = useMemo(() => {
    const map = {}
    // 架電済み企業のみ担当別集計（母数を統一）
    teleapoCallFiltered.filter(i => (i.callHistory || []).length > 0).forEach(item => {
      const key = item.salesRep || '(未設定)'
      if (!map[key]) map[key] = { name: key, calls: 0, companies: 0, keeps: 0, connected: 0, appoConfirmed: 0 }
      map[key].companies++
      const history = item.callHistory || []
      map[key].calls += history.length
      map[key].connected += history.filter(c => !['不在', '受付ブロック'].includes(c.result)).length
    })
    teleapoFiltered.forEach(item => {
      ;(item.keepHistory || []).forEach(k => {
        const key = k.by || '(未設定)'
        if (!map[key]) map[key] = { name: key, calls: 0, companies: 0, keeps: 0, connected: 0, heard: 0, appoConfirmed: 0 }
        map[key].keeps++
      })
      if (item.status === 'アポ確定') {
        const key = item.salesRep || '(未設定)'
        if (map[key]) map[key].appoConfirmed++
      }
    })
    return Object.values(map)
      .map(d => ({
        ...d,
        connectionRate: d.calls > 0 ? Number(((d.connected / d.calls) * 100).toFixed(1)) : 0,
        appoRate: d.companies > 0 ? Number(((d.appoConfirmed / d.companies) * 100).toFixed(1)) : 0,
        avgCalls: d.companies > 0 ? Number((d.calls / d.companies).toFixed(1)) : 0,
      }))
      .filter(d => d.calls > 0 || d.keeps > 0)
      .sort((a, b) => b.calls - a.calls)
  }, [teleapoCallFiltered, teleapoFiltered])

  const teleapoDaily = useMemo(() => {
    const allCalls = teleapoCallFiltered.flatMap(i => i.callHistory || [])
    const map = {}
    allCalls.forEach(c => {
      if (!c.date) return
      const day = c.date.slice(0, 10)
      if (!map[day]) map[day] = { date: day, calls: 0 }
      map[day].calls++
    })
    return Object.values(map).sort((a, b) => a.date.localeCompare(b.date)).slice(-30)
  }, [teleapoCallFiltered])

  // 未架電企業の内訳（全期間）
  const teleapoUncalled = useMemo(() => {
    const items = teleapoFiltered.filter(i => (i.callHistory || []).length === 0)
    const byIndustry = {}
    const byScale = {}
    items.forEach(i => {
      const ind = i.industry || '(未設定)'
      byIndustry[ind] = (byIndustry[ind] || 0) + 1
      const sc = i.employeeScale || '(未設定)'
      byScale[sc] = (byScale[sc] || 0) + 1
    })
    return {
      total: items.length,
      byIndustry: Object.entries(byIndustry).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 8),
      byScale: Object.entries(byScale).map(([name, value]) => ({ name, value })).sort((a, b) => {
        const numA = parseInt(a.name) || 9999
        const numB = parseInt(b.name) || 9999
        return numA - numB
      }),
    }
  }, [teleapoFiltered])

  // 業種 × 規模 クロス集計（架電済み企業のみ）
  const teleapoCrossTab = useMemo(() => {
    const map = {}
    const indSet = new Set()
    const scSet = new Set()

    teleapoCallFiltered.filter(i => (i.callHistory || []).length > 0).forEach(item => {
      const ind = item.industry || '(未設定)'
      if (teleapoIndustryFilter.length > 0 && !teleapoIndustryFilter.includes(ind)) return
      const sc = item.employeeScale || '(未設定)'
      indSet.add(ind); scSet.add(sc)
      if (!map[ind]) map[ind] = {}
      if (!map[ind][sc]) map[ind][sc] = { calls: 0, connected: 0, appo: 0, companies: 0 }
      const history = item.callHistory || []
      map[ind][sc].companies++
      map[ind][sc].calls += history.length
      map[ind][sc].connected += history.filter(c => !['不在', '受付ブロック'].includes(c.result)).length
    })
    teleapoFiltered.filter(i => i.status === 'アポ確定').forEach(item => {
      const ind = item.industry || '(未設定)'
      if (teleapoIndustryFilter.length > 0 && !teleapoIndustryFilter.includes(ind)) return
      const sc = item.employeeScale || '(未設定)'
      if (map[ind]?.[sc]) map[ind][sc].appo++
    })

    // 業種：架電社数の多い順
    const industries = [...indSet].sort((a, b) => {
      const tA = Object.values(map[a] || {}).reduce((s, c) => s + c.companies, 0)
      const tB = Object.values(map[b] || {}).reduce((s, c) => s + c.companies, 0)
      return tB - tA
    })
    // 規模：EMPLOYEE_SCALES の定義順
    const scales = EMPLOYEE_SCALES.filter(s => scSet.has(s))
    ;[...scSet].filter(s => !EMPLOYEE_SCALES.includes(s)).forEach(s => scales.push(s))

    return { map, industries, scales }
  }, [teleapoCallFiltered, teleapoFiltered, teleapoIndustryFilter])

  // Keep転換統計
  const teleapoKeepStats = useMemo(() => {
    const everKept = teleapoFiltered.filter(i => (i.keepHistory || []).length > 0)
    const appoFromKept = everKept.filter(i => i.status === 'アポ確定').length
    const keepConvRate = everKept.length > 0 ? Number(((appoFromKept / everKept.length) * 100).toFixed(1)) : 0
    return { everKept: everKept.length, appoFromKept, keepConvRate }
  }, [teleapoFiltered])

  // メール分析統計
  const emailStats = useMemo(() => {
    const items = emailFiltered
    const total = items.length
    const withEmail = items.filter(i => i.email && i.email.includes('@')).length
    const sent = items.filter(i => ['送信済み', '開封済み', 'クリック済み'].includes(i.emailStatus)).length
    const opened = items.filter(i => ['開封済み', 'クリック済み'].includes(i.emailStatus)).length
    const clicked = items.filter(i => i.emailStatus === 'クリック済み').length
    const unsent = items.filter(i => !i.emailStatus || i.emailStatus === '未送信').length
    const openRate = sent > 0 ? Number(((opened / sent) * 100).toFixed(1)) : 0
    const clickRate = sent > 0 ? Number(((clicked / sent) * 100).toFixed(1)) : 0
    const sentRate = withEmail > 0 ? Number(((sent / withEmail) * 100).toFixed(1)) : 0
    const statusBreakdown = [
      { name: '未送信', count: unsent, color: '#94a3b8' },
      { name: '送信済み', count: sent - opened, color: '#60a5fa' },
      { name: '開封済み', count: opened - clicked, color: '#f59e0b' },
      { name: 'クリック済み', count: clicked, color: '#10b981' },
    ].filter(d => d.count > 0)
    return { total, withEmail, sent, opened, clicked, unsent, openRate, clickRate, sentRate, statusBreakdown }
  }, [emailFiltered])

  // メール × 業種別（emailFiltered使用）
  const emailByIndustry = useMemo(() => {
    const map = {}
    emailFiltered.forEach(item => {
      const key = item.industry || '(未設定)'
      if (!map[key]) map[key] = { name: key, total: 0, hasEmail: 0, sent: 0, opened: 0, clicked: 0 }
      map[key].total++
      if (item.email && item.email.includes('@')) map[key].hasEmail++
      if (['送信済み', '開封済み', 'クリック済み'].includes(item.emailStatus)) map[key].sent++
      if (['開封済み', 'クリック済み'].includes(item.emailStatus)) map[key].opened++
      if (item.emailStatus === 'クリック済み') map[key].clicked++
    })
    return Object.values(map)
      .map(d => ({
        ...d,
        coverageRate: d.total > 0 ? Number(((d.hasEmail / d.total) * 100).toFixed(1)) : 0,
        sentRate: d.hasEmail > 0 ? Number(((d.sent / d.hasEmail) * 100).toFixed(1)) : 0,
        openRate: d.sent > 0 ? Number(((d.opened / d.sent) * 100).toFixed(1)) : 0,
      }))
      .sort((a, b) => b.total - a.total)
  }, [emailFiltered])

  // メール × 規模別（emailFiltered使用）
  const emailByScale = useMemo(() => {
    const map = {}
    emailFiltered.forEach(item => {
      const key = item.employeeScale || '(未設定)'
      if (!map[key]) map[key] = { name: key, total: 0, hasEmail: 0, sent: 0, opened: 0, clicked: 0 }
      map[key].total++
      if (item.email && item.email.includes('@')) map[key].hasEmail++
      if (['送信済み', '開封済み', 'クリック済み'].includes(item.emailStatus)) map[key].sent++
      if (['開封済み', 'クリック済み'].includes(item.emailStatus)) map[key].opened++
      if (item.emailStatus === 'クリック済み') map[key].clicked++
    })
    return Object.values(map)
      .map(d => ({
        ...d,
        coverageRate: d.total > 0 ? Number(((d.hasEmail / d.total) * 100).toFixed(1)) : 0,
        sentRate: d.hasEmail > 0 ? Number(((d.sent / d.hasEmail) * 100).toFixed(1)) : 0,
        openRate: d.sent > 0 ? Number(((d.opened / d.sent) * 100).toFixed(1)) : 0,
      }))
      .sort((a, b) => {
        const numA = parseInt(a.name) || 9999
        const numB = parseInt(b.name) || 9999
        return numA - numB
      })
  }, [emailFiltered])

  // メール × テンプレート別（emailFiltered使用）
  const emailByTemplate = useMemo(() => {
    const map = {}
    emailFiltered.forEach(item => {
      if (!['送信済み', '開封済み', 'クリック済み'].includes(item.emailStatus)) return
      const key = item.emailTemplateName || '(テンプレ不明)'
      if (!map[key]) map[key] = { name: key, sent: 0, opened: 0, clicked: 0 }
      map[key].sent++
      if (['開封済み', 'クリック済み'].includes(item.emailStatus)) map[key].opened++
      if (item.emailStatus === 'クリック済み') map[key].clicked++
    })
    return Object.values(map)
      .map(d => ({
        ...d,
        openRate: d.sent > 0 ? Number(((d.opened / d.sent) * 100).toFixed(1)) : 0,
        clickRate: d.sent > 0 ? Number(((d.clicked / d.sent) * 100).toFixed(1)) : 0,
      }))
      .sort((a, b) => b.sent - a.sent)
  }, [emailFiltered])

  // メール送信タイミング別（曜日）（emailFiltered使用）
  const DAY_NAMES_EMAIL = ['日', '月', '火', '水', '木', '金', '土']
  const emailByDayOfWeek = useMemo(() => {
    const map = DAY_NAMES_EMAIL.map((d, i) => ({ name: d + '曜', dayIndex: i, sent: 0, opened: 0 }))
    emailFiltered.forEach(item => {
      if (!item.emailSentAt) return
      const day = new Date(item.emailSentAt).getDay()
      map[day].sent++
      if (['開封済み', 'クリック済み'].includes(item.emailStatus)) map[day].opened++
    })
    return map.map(d => ({
      ...d,
      openRate: d.sent > 0 ? Number(((d.opened / d.sent) * 100).toFixed(1)) : 0,
    }))
  }, [emailFiltered])

  // メール送信タイミング別（時間帯）（emailFiltered使用）
  const emailByHour = useMemo(() => {
    const map = Array.from({ length: 24 }, (_, h) => ({ name: `${h}時`, hour: h, sent: 0, opened: 0 }))
    emailFiltered.forEach(item => {
      if (!item.emailSentAt) return
      const hour = new Date(item.emailSentAt).getHours()
      map[hour].sent++
      if (['開封済み', 'クリック済み'].includes(item.emailStatus)) map[hour].opened++
    })
    return map
      .filter(d => d.sent > 0)
      .map(d => ({ ...d, openRate: d.sent > 0 ? Number(((d.opened / d.sent) * 100).toFixed(1)) : 0 }))
  }, [emailFiltered])

  // メールあり/なし別アポ率（テレアポタブ用：teleapoFiltered）
  const emailAppoCorr = useMemo(() => {
    const withMail = teleapoFiltered.filter(i => ['送信済み', '開封済み', 'クリック済み'].includes(i.emailStatus))
    const withoutMail = teleapoFiltered.filter(i => !['送信済み', '開封済み', 'クリック済み'].includes(i.emailStatus))
    return [
      { name: 'メール送信あり', companies: withMail.length, appo: withMail.filter(i => i.status === 'アポ確定').length,
        appoRate: withMail.length > 0 ? Number(((withMail.filter(i => i.status === 'アポ確定').length / withMail.length) * 100).toFixed(1)) : 0 },
      { name: 'メール送信なし', companies: withoutMail.length, appo: withoutMail.filter(i => i.status === 'アポ確定').length,
        appoRate: withoutMail.length > 0 ? Number(((withoutMail.filter(i => i.status === 'アポ確定').length / withoutMail.length) * 100).toFixed(1)) : 0 },
    ]
  }, [teleapoFiltered])

  // メール送信〜架電 経過日数別アポ率（テレアポタブ用：teleapoFiltered）
  const emailLagAppo = useMemo(() => {
    const buckets = [
      { label: '当日', min: 0, max: 0, companies: 0, appo: 0 },
      { label: '1日後', min: 1, max: 1, companies: 0, appo: 0 },
      { label: '2〜3日後', min: 2, max: 3, companies: 0, appo: 0 },
      { label: '4〜7日後', min: 4, max: 7, companies: 0, appo: 0 },
      { label: '8日以上後', min: 8, max: Infinity, companies: 0, appo: 0 },
    ]
    teleapoFiltered.forEach(item => {
      if (!item.emailSentAt || !(item.callHistory || []).length) return
      const sentDate = new Date(item.emailSentAt)
      const firstCallDate = new Date(item.callHistory[0].date)
      const lagDays = Math.max(0, Math.floor((firstCallDate - sentDate) / (1000 * 60 * 60 * 24)))
      const bucket = buckets.find(b => lagDays >= b.min && lagDays <= b.max)
      if (bucket) { bucket.companies++; if (item.status === 'アポ確定') bucket.appo++ }
    })
    return buckets.filter(b => b.companies > 0).map(b => ({ ...b, appoRate: Number(((b.appo / b.companies) * 100).toFixed(1)) }))
  }, [teleapoFiltered])

  // メールあり/なし別アポ率（メール分析タブ用：emailFiltered）
  const emailAppoCorrF = useMemo(() => {
    const withMail = emailFiltered.filter(i => ['送信済み', '開封済み', 'クリック済み'].includes(i.emailStatus))
    const withoutMail = emailFiltered.filter(i => !['送信済み', '開封済み', 'クリック済み'].includes(i.emailStatus))
    return [
      { name: 'メール送信あり', companies: withMail.length, appo: withMail.filter(i => i.status === 'アポ確定').length,
        appoRate: withMail.length > 0 ? Number(((withMail.filter(i => i.status === 'アポ確定').length / withMail.length) * 100).toFixed(1)) : 0 },
      { name: 'メール送信なし', companies: withoutMail.length, appo: withoutMail.filter(i => i.status === 'アポ確定').length,
        appoRate: withoutMail.length > 0 ? Number(((withoutMail.filter(i => i.status === 'アポ確定').length / withoutMail.length) * 100).toFixed(1)) : 0 },
    ]
  }, [emailFiltered])

  // メール送信〜架電 経過日数別アポ率（メール分析タブ用：emailFiltered）
  const emailLagAppoF = useMemo(() => {
    const buckets = [
      { label: '当日', min: 0, max: 0, companies: 0, appo: 0 },
      { label: '1日後', min: 1, max: 1, companies: 0, appo: 0 },
      { label: '2〜3日後', min: 2, max: 3, companies: 0, appo: 0 },
      { label: '4〜7日後', min: 4, max: 7, companies: 0, appo: 0 },
      { label: '8日以上後', min: 8, max: Infinity, companies: 0, appo: 0 },
    ]
    emailFiltered.forEach(item => {
      if (!item.emailSentAt || !(item.callHistory || []).length) return
      const sentDate = new Date(item.emailSentAt)
      const firstCallDate = new Date(item.callHistory[0].date)
      const lagDays = Math.max(0, Math.floor((firstCallDate - sentDate) / (1000 * 60 * 60 * 24)))
      const bucket = buckets.find(b => lagDays >= b.min && lagDays <= b.max)
      if (bucket) { bucket.companies++; if (item.status === 'アポ確定') bucket.appo++ }
    })
    return buckets.filter(b => b.companies > 0).map(b => ({ ...b, appoRate: Number(((b.appo / b.companies) * 100).toFixed(1)) }))
  }, [emailFiltered])

  // 開封状態別 接続率・アポ率（メール分析タブ用：emailFiltered）
  const emailOpenAppoCorr = useMemo(() => {
    const groups = [
      { label: '開封済み', items: emailFiltered.filter(i => ['開封済み', 'クリック済み'].includes(i.emailStatus)) },
      { label: '送信済み(未開封)', items: emailFiltered.filter(i => i.emailStatus === '送信済み') },
      { label: 'メール未送信', items: emailFiltered.filter(i => !['送信済み', '開封済み', 'クリック済み'].includes(i.emailStatus)) },
    ]
    return groups.map(g => {
      const called = g.items.filter(i => (i.callHistory || []).length > 0)
      const connected = called.filter(i => (i.callHistory || []).some(c => !['不在', '受付ブロック'].includes(c.result)))
      const appo = g.items.filter(i => i.status === 'アポ確定')
      return {
        name: g.label,
        total: g.items.length,
        connectionRate: called.length > 0 ? Number(((connected.length / called.length) * 100).toFixed(1)) : 0,
        appoRate: g.items.length > 0 ? Number(((appo.length / g.items.length) * 100).toFixed(1)) : 0,
      }
    }).filter(g => g.total > 0)
  }, [emailFiltered])

  const DAY_NAMES_CALL = ['日', '月', '火', '水', '木', '金', '土']

  const teleapoByHour = useMemo(() => {
    const map = Array.from({ length: 24 }, (_, h) => ({ name: `${h}時`, hour: h, calls: 0, connected: 0 }))
    teleapoCallFiltered.forEach(item => {
      ;(item.callHistory || []).forEach(c => {
        if (!c.date) return
        const hour = new Date(c.date).getHours()
        map[hour].calls++
        if (!['不在', '受付ブロック'].includes(c.result)) map[hour].connected++
      })
    })
    return map.filter(d => d.calls > 0).map(d => ({
      ...d, connectionRate: Number(((d.connected / d.calls) * 100).toFixed(1))
    }))
  }, [teleapoCallFiltered])

  const teleapoByDayOfWeek = useMemo(() => {
    const map = DAY_NAMES_CALL.map((d, i) => ({ name: d + '曜', dayIndex: i, calls: 0, connected: 0 }))
    teleapoCallFiltered.forEach(item => {
      ;(item.callHistory || []).forEach(c => {
        if (!c.date) return
        const day = new Date(c.date).getDay()
        map[day].calls++
        if (!['不在', '受付ブロック'].includes(c.result)) map[day].connected++
      })
    })
    return map.map(d => ({ ...d, connectionRate: d.calls > 0 ? Number(((d.connected / d.calls) * 100).toFixed(1)) : 0 }))
  }, [teleapoCallFiltered])

  const teleapoByCallCount = useMemo(() => {
    const buckets = [
      { label: '1回', min: 1, max: 1, companies: 0, appo: 0 },
      { label: '2回', min: 2, max: 2, companies: 0, appo: 0 },
      { label: '3回', min: 3, max: 3, companies: 0, appo: 0 },
      { label: '4〜5回', min: 4, max: 5, companies: 0, appo: 0 },
      { label: '6回以上', min: 6, max: Infinity, companies: 0, appo: 0 },
    ]
    teleapoCallFiltered.filter(i => (i.callHistory || []).length > 0).forEach(item => {
      const n = item.callHistory.length
      const bucket = buckets.find(b => n >= b.min && n <= b.max)
      if (bucket) {
        bucket.companies++
        if (item.status === 'アポ確定') bucket.appo++
      }
    })
    return buckets.filter(b => b.companies > 0).map(b => ({
      ...b, appoRate: Number(((b.appo / b.companies) * 100).toFixed(1))
    }))
  }, [teleapoCallFiltered])

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
            <button onClick={() => setDashboardMode('email')}
              className={`px-4 py-1.5 text-xs font-medium rounded-md transition-colors ${
                dashboardMode === 'email'
                  ? 'bg-white text-[#2d6a9e] shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}>
              メール分析
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
        {/* メール分析モードのフィルター */}
        {dashboardMode === 'email' && (
          <div className="flex flex-wrap items-center gap-2">
            {allIndustries.length > 0 && (
              <MultiSelect label="業種" selected={emailIndustryFilter} onChange={setEmailIndustryFilter} options={allIndustries} placeholder="全業種" />
            )}
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-slate-400 font-medium">送信期間:</span>
              <input type="date" value={emailDateFrom} onChange={e => setEmailDateFrom(e.target.value)}
                className={`text-sm border rounded-md px-2 py-1 bg-white focus:outline-none focus:ring-2 focus:ring-blue-400 ${emailDateFrom ? 'border-blue-300 text-blue-700 bg-blue-50' : 'border-slate-200 text-slate-700'}`} />
              <span className="text-slate-400 text-xs">〜</span>
              <input type="date" value={emailDateTo} onChange={e => setEmailDateTo(e.target.value)}
                className={`text-sm border rounded-md px-2 py-1 bg-white focus:outline-none focus:ring-2 focus:ring-blue-400 ${emailDateTo ? 'border-blue-300 text-blue-700 bg-blue-50' : 'border-slate-200 text-slate-700'}`} />
            </div>
            {(emailIndustryFilter.length > 0 || emailDateFrom || emailDateTo) && (
              <button onClick={() => { setEmailIndustryFilter([]); setEmailDateFrom(''); setEmailDateTo('') }}
                className="text-xs text-red-400 hover:text-red-600 px-2 py-1.5 rounded hover:bg-red-50 whitespace-nowrap">全解除</button>
            )}
          </div>
        )}
        {/* テレアポモードのフィルター */}
        {dashboardMode === 'teleapo' && (
          <div className="flex flex-wrap items-center gap-2">
            {teleapoSalesReps.length > 0 && (
              <MultiSelect label="担当" selected={teleapoRepFilter} onChange={setTeleapoRepFilter} options={teleapoSalesReps} placeholder="全担当" />
            )}
            {allIndustries.length > 0 && (
              <MultiSelect label="業種" selected={teleapoIndustryFilter} onChange={setTeleapoIndustryFilter} options={allIndustries} placeholder="全業種" />
            )}
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-slate-400 font-medium">期間:</span>
              <input type="date" value={teleapoDateFrom} onChange={e => setTeleapoDateFrom(e.target.value)}
                className={`text-sm border rounded-md px-2 py-1 bg-white focus:outline-none focus:ring-2 focus:ring-blue-400 ${teleapoDateFrom ? 'border-blue-300 text-blue-700 bg-blue-50' : 'border-slate-200 text-slate-700'}`} />
              <span className="text-slate-400 text-xs">〜</span>
              <input type="date" value={teleapoDateTo} onChange={e => setTeleapoDateTo(e.target.value)}
                className={`text-sm border rounded-md px-2 py-1 bg-white focus:outline-none focus:ring-2 focus:ring-blue-400 ${teleapoDateTo ? 'border-blue-300 text-blue-700 bg-blue-50' : 'border-slate-200 text-slate-700'}`} />
            </div>
            {(teleapoRepFilter.length > 0 || teleapoIndustryFilter.length > 0 || teleapoDateFrom || teleapoDateTo) && (
              <button onClick={() => { setTeleapoRepFilter([]); setTeleapoIndustryFilter([]); setTeleapoDateFrom(''); setTeleapoDateTo('') }}
                className="text-xs text-red-400 hover:text-red-600 px-2 py-1.5 rounded hover:bg-red-50 whitespace-nowrap">全解除</button>
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

            {/* ── ファネル KPI ── */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 mb-5">
              <p className="text-xs font-semibold text-slate-500 mb-4 uppercase tracking-wide">架電ファネル</p>
              <div className="flex items-stretch gap-0">
                {teleapoFunnel.map((step, i) => (
                  <div key={step.label} className="flex items-center flex-1 min-w-0">
                    <div className={`flex-1 rounded-xl px-4 py-3 text-center ${
                      i === 0 ? 'bg-slate-100' :
                      i === 1 ? 'bg-sky-50 border border-sky-200' :
                      i === 2 ? 'bg-teal-50 border border-teal-200' :
                      'bg-purple-50 border border-purple-200'
                    }`}>
                      <p className={`text-[11px] font-medium mb-1 ${
                        i === 0 ? 'text-slate-500' :
                        i === 1 ? 'text-sky-600' :
                        i === 2 ? 'text-teal-600' :
                        'text-purple-600'
                      }`}>{step.label}</p>
                      <p className={`text-2xl font-bold ${
                        i === 0 ? 'text-slate-700' :
                        i === 1 ? 'text-sky-700' :
                        i === 2 ? 'text-teal-700' :
                        'text-purple-700'
                      }`}>{step.value}<span className="text-sm font-normal ml-0.5">社</span></p>
                      {step.rate !== null && (
                        <p className="text-[10px] text-slate-400 mt-0.5">前段比 {step.rate}%</p>
                      )}
                    </div>
                    {i < teleapoFunnel.length - 1 && (
                      <div className="text-slate-300 text-xl mx-1 shrink-0">›</div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* ── KPI カード ── */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
              <KpiCard label="登録企業" value={teleapoStats.total} suffix="社" />
              <KpiCard label="総架電数" value={teleapoStats.totalCalls} suffix="件" color="blue"
                sub={`消化率 ${teleapoStats.digestRate}%`} />
              <KpiCard label="接続率" value={teleapoStats.connectionRate} suffix="%" color="green"
                sub="不在・受付ブロック除く" />
              <KpiCard label="アポ確定" value={teleapoStats.appoConfirmed} suffix="社" color="purple"
                sub={`確定率 ${teleapoStats.appoRate}%（架電済比）`} />
            </div>
            <div className="grid grid-cols-4 gap-4 mb-5">
              <KpiCard label="架電済" value={teleapoStats.called} suffix="社" color="blue" small />
              <KpiCard label="未架電" value={teleapoStats.uncalled} suffix="社" color="amber" small />
              <KpiCard label="Keep中（本日）" value={teleapoStats.kept} suffix="社" color="purple" small />
              <KpiCard label="Keep転換率" value={teleapoKeepStats.keepConvRate} suffix="%" color="purple" small
                sub={`Keep企業 ${teleapoKeepStats.everKept}社`} />
            </div>

            {/* ── 週別架電推移（結果別積み上げ） ── */}
            {teleapoWeekly.length > 0 && (() => {
              const RESULT_COLORS = {
                '不在': '#94a3b8', '受付ブロック': '#64748b', '担当者不在': '#7dd3fc',
                '資料送付済': '#60a5fa', '折り返し依頼': '#34d399', 'ヒアリング済': '#10b981',
                '断り': '#f87171', '不明': '#cbd5e1',
              }
              const resultKeys = [...new Set(teleapoWeekly.flatMap(w => Object.keys(w).filter(k => !['week', 'label', 'total'].includes(k))))]
              return (
                <ChartCard title="週別架電推移（結果別）" sub={teleapoDateFrom || teleapoDateTo ? `${teleapoDateFrom || '〜'} 〜 ${teleapoDateTo || '〜'}` : '直近16週'}>
                  <ResponsiveContainer width="100%" height={240}>
                    <BarChart data={teleapoWeekly} margin={{ right: 10 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      {resultKeys.map(key => (
                        <Bar key={key} dataKey={key} stackId="a" fill={RESULT_COLORS[key] || '#93b5d0'} name={key} />
                      ))}
                    </BarChart>
                  </ResponsiveContainer>
                </ChartCard>
              )
            })()}

            {/* ── 日別架電推移 ── */}
            {teleapoDaily.length > 0 && (
              <ChartCard title="日別架電推移（直近30日）">
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={teleapoDaily}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="date" tick={{ fontSize: 10 }}
                      tickFormatter={d => `${d.slice(5, 7)}/${d.slice(8, 10)}`} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip labelFormatter={d => d} contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }} />
                    <Bar dataKey="calls" name="架電数" fill="#4a82ae" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>
            )}

            {/* ── 架電結果分布 + 担当別詳細 ── */}
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
                    <table className="w-full text-xs">
                      <thead className="bg-slate-50">
                        <tr>
                          <th className="px-2 py-2 text-left font-medium text-slate-500">担当</th>
                          <th className="px-2 py-2 text-right font-medium text-slate-500">架電社数</th>
                          <th className="px-2 py-2 text-right font-medium text-slate-500">架電数</th>
                          <th className="px-2 py-2 text-right font-medium text-slate-500">接続率</th>
                          <th className="px-2 py-2 text-right font-medium text-slate-500">平均架電回数</th>
                          <th className="px-2 py-2 text-right font-medium text-slate-500">アポ確定</th>
                          <th className="px-2 py-2 text-right font-medium text-slate-500">確定率</th>
                          <th className="px-2 py-2 text-right font-medium text-slate-500">Keep数</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {teleapoByRep.map(r => (
                          <tr key={r.name} className="hover:bg-sky-50 cursor-pointer transition-colors" onClick={() => navigateTeleapoWithFilters({ salesRep: r.name })}>
                            <td className="px-2 py-2 font-medium text-slate-800">
                              <div className="flex items-center gap-1.5">
                                <div className="w-5 h-5 rounded-full bg-gradient-to-br from-[#4a82ae] to-[#2d6a9e] flex items-center justify-center text-white text-[9px] font-bold shrink-0">
                                  {r.name.slice(0, 1)}
                                </div>
                                {r.name}
                              </div>
                            </td>
                            <td className="px-2 py-2 text-right font-medium">{r.companies}</td>
                            <td className="px-2 py-2 text-right font-medium">{r.calls}</td>
                            <td className="px-2 py-2 text-right">
                              <span className={`inline-block px-1 py-0.5 rounded text-[11px] font-bold ${
                                r.connectionRate >= 60 ? 'bg-green-100 text-green-700' :
                                r.connectionRate >= 40 ? 'bg-yellow-100 text-yellow-700' :
                                'bg-slate-100 text-slate-500'
                              }`}>{r.connectionRate}%</span>
                            </td>
                            <td className="px-2 py-2 text-right text-slate-600">{r.avgCalls}回</td>
                            <td className="px-2 py-2 text-right text-purple-600 font-medium">{r.appoConfirmed || 0}</td>
                            <td className="px-2 py-2 text-right">
                              <span className={`inline-block px-1 py-0.5 rounded text-[11px] font-bold ${
                                r.appoRate >= 10 ? 'bg-purple-100 text-purple-700' :
                                r.appoRate >= 5 ? 'bg-sky-100 text-sky-700' :
                                'bg-slate-100 text-slate-500'
                              }`}>{r.appoRate}%</span>
                            </td>
                            <td className="px-2 py-2 text-right text-[#4a82ae] font-medium">{r.keeps || 0}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </ChartCard>
              )}
            </div>

            {/* ── 業種別・規模別（架電済み企業ベース） ── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4 items-start">
              {teleapoByIndustry.length > 0 && (() => {
                const data = teleapoByIndustry
                const chartH = Math.max(180, data.length * 40)
                const maxRate = Math.max(niceMax(data, 'appoRate'), niceMax(data, 'connectionRate'))
                const ticks = Array.from({ length: maxRate / 10 + 1 }, (_, i) => i * 10)
                return (
                  <ChartCard title="業種別 アポ確定率 / 接続率" sub="母数：架電済み企業">
                    <ResponsiveContainer width="100%" height={chartH}>
                      <BarChart data={data} layout="vertical" margin={{ left: 0, right: 50 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                        <XAxis type="number" domain={[0, maxRate]} ticks={ticks} unit="%" tick={{ fontSize: 11 }} />
                        <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={120}
                          tickFormatter={name => name.length > 6 ? name.slice(0, 6) + '…' : name} />
                        <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }}
                          formatter={(val, name) => [`${val}%`, name]} />
                        <Legend wrapperStyle={{ fontSize: 11 }} />
                        <Bar dataKey="appoRate" name="アポ確定率" fill="#0f766e" barSize={10}
                          label={{ position: 'right', fontSize: 10, fill: '#64748b', formatter: v => `${v}%` }}
                          shape={(props) => <ClickableBar {...props} fill="#0f766e" onClick={() => navigateTeleapoWithFilters({ industry: props.payload?.name })} />} />
                        <Bar dataKey="connectionRate" name="接続率" fill="#4a82ae" barSize={10}
                          shape={(props) => <ClickableBar {...props} fill="#4a82ae" onClick={() => navigateTeleapoWithFilters({ industry: props.payload?.name })} />} />
                      </BarChart>
                    </ResponsiveContainer>
                  </ChartCard>
                )
              })()}

              {teleapoByScale.length > 0 && (() => {
                const data = teleapoByScale
                const maxRate = Math.max(niceMax(data, 'appoRate'), niceMax(data, 'connectionRate'))
                const ticks = Array.from({ length: maxRate / 10 + 1 }, (_, i) => i * 10)
                return (
                  <ChartCard title="従業員規模別 アポ確定率 / 接続率" sub="母数：架電済み企業">
                    <ResponsiveContainer width="100%" height={260}>
                      <BarChart data={data} margin={{ right: 10, bottom: 20 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                        <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} angle={-20} textAnchor="end" height={55} />
                        <YAxis domain={[0, maxRate]} ticks={ticks} unit="%" tick={{ fontSize: 11 }} />
                        <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }}
                          formatter={(val, name) => [`${val}%`, name]} />
                        <Legend wrapperStyle={{ fontSize: 11 }} />
                        <Bar dataKey="appoRate" name="アポ確定率" fill="#0f766e" barSize={14}
                          shape={(props) => <ClickableBar {...props} fill="#0f766e" onClick={() => navigateTeleapoWithFilters({ employeeScale: props.payload?.name })} />} />
                        <Bar dataKey="connectionRate" name="接続率" fill="#4a82ae" barSize={14}
                          shape={(props) => <ClickableBar {...props} fill="#4a82ae" onClick={() => navigateTeleapoWithFilters({ employeeScale: props.payload?.name })} />} />
                      </BarChart>
                    </ResponsiveContainer>
                  </ChartCard>
                )
              })()}
            </div>

            {/* ── 業種 × 従業員規模 クロス集計 ── */}
            {teleapoCrossTab.industries.length > 0 && teleapoCrossTab.scales.length > 0 && (() => {
              const { map, industries, scales } = teleapoCrossTab
              const getCell = (ind, sc) => map[ind]?.[sc] || null
              const rowTotal = (ind) => {
                const cells = Object.values(map[ind] || {})
                return cells.reduce((s, c) => ({ companies: s.companies + c.companies, calls: s.calls + c.calls, connected: s.connected + c.connected, appo: s.appo + c.appo }), { companies: 0, calls: 0, connected: 0, appo: 0 })
              }
              const colTotal = (sc) => industries.reduce((s, ind) => {
                const c = map[ind]?.[sc]
                if (!c) return s
                return { companies: s.companies + c.companies, calls: s.calls + c.calls, connected: s.connected + c.connected, appo: s.appo + c.appo }
              }, { companies: 0, calls: 0, connected: 0, appo: 0 })
              const grandTotal = industries.reduce((s, ind) => {
                const r = rowTotal(ind)
                return { companies: s.companies + r.companies, calls: s.calls + r.calls, connected: s.connected + r.connected, appo: s.appo + r.appo }
              }, { companies: 0, calls: 0, connected: 0, appo: 0 })

              const CellContent = ({ c, isTotal }) => {
                if (!c || c.companies === 0) return <span className="text-slate-300">—</span>
                const connRate = c.calls > 0 ? Math.round(c.connected / c.calls * 100) : 0
                const appoRate = c.companies > 0 ? Math.round(c.appo / c.companies * 100) : 0
                return (
                  <div className={`text-center ${isTotal ? 'font-semibold' : ''}`}>
                    <div className="text-[10px] text-slate-400 mb-0.5">{c.companies}社</div>
                    <div className={`text-[11px] font-medium ${connRate >= 60 ? 'text-green-600' : connRate >= 40 ? 'text-sky-600' : 'text-slate-500'}`}>
                      通電 {connRate}%
                    </div>
                    <div className={`text-[11px] font-bold ${appoRate >= 10 ? 'text-purple-700' : appoRate >= 5 ? 'text-teal-600' : appoRate > 0 ? 'text-slate-600' : 'text-slate-300'}`}>
                      確定 {appoRate}%
                    </div>
                  </div>
                )
              }

              return (
                <ChartCard title="業種 × 従業員規模 クロス集計" sub="母数：架電済み企業 ｜ 通電率＝不在・受付ブロック除く ｜ 確定率＝アポ確定社数÷架電社数">
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs border-collapse">
                      <thead>
                        <tr className="bg-slate-50">
                          <th className="px-3 py-2 text-left font-medium text-slate-500 border border-slate-200 sticky left-0 bg-slate-50 z-10 min-w-[120px]">業種</th>
                          {scales.map(sc => (
                            <th key={sc} className="px-2 py-2 text-center font-medium text-slate-500 border border-slate-200 min-w-[90px] whitespace-nowrap">
                              {sc}
                            </th>
                          ))}
                          <th className="px-2 py-2 text-center font-medium text-slate-600 border border-slate-200 min-w-[90px] bg-slate-100">合計</th>
                        </tr>
                      </thead>
                      <tbody>
                        {industries.map((ind, ri) => {
                          const rt = rowTotal(ind)
                          return (
                            <tr key={ind} className={ri % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}>
                              <td className={`px-3 py-2 font-medium text-slate-700 border border-slate-200 sticky left-0 z-10 ${ri % 2 === 0 ? 'bg-white' : 'bg-slate-50'}`}>
                                {ind.length > 10 ? ind.slice(0, 10) + '…' : ind}
                              </td>
                              {scales.map(sc => {
                                const c = getCell(ind, sc)
                                return (
                                  <td key={sc} className="px-2 py-2 border border-slate-200 cursor-pointer hover:bg-sky-50 transition-colors"
                                    onClick={() => c && navigateTeleapoWithFilters({ industry: ind, employeeScale: sc })}>
                                    <CellContent c={c} />
                                  </td>
                                )
                              })}
                              <td className="px-2 py-2 border border-slate-200 bg-slate-50">
                                <CellContent c={rt} isTotal />
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                      <tfoot>
                        <tr className="bg-slate-100">
                          <td className="px-3 py-2 font-semibold text-slate-600 border border-slate-200 sticky left-0 bg-slate-100 z-10">合計</td>
                          {scales.map(sc => {
                            const ct = colTotal(sc)
                            return (
                              <td key={sc} className="px-2 py-2 border border-slate-200">
                                <CellContent c={ct} isTotal />
                              </td>
                            )
                          })}
                          <td className="px-2 py-2 border border-slate-200 bg-slate-200">
                            <CellContent c={grandTotal} isTotal />
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </ChartCard>
              )
            })()}

            {/* ── 架電タイミング分析 ── */}
            {(teleapoByHour.length > 0 || teleapoByDayOfWeek.some(d => d.calls > 0)) && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
                {teleapoByHour.length > 0 && (
                  <ChartCard title="時間帯別 架電件数 / 接続率" sub="架電記録から集計">
                    <ResponsiveContainer width="100%" height={220}>
                      <ComposedChart data={teleapoByHour}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                        <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={1} />
                        <YAxis yAxisId="left" tick={{ fontSize: 11 }} />
                        <YAxis yAxisId="right" orientation="right" domain={[0, 100]} unit="%" tick={{ fontSize: 11 }} />
                        <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }}
                          formatter={(v, n) => n === 'connectionRate' ? [`${v}%`, '接続率'] : [`${v}件`, '架電件数']} />
                        <Bar yAxisId="left" dataKey="calls" name="架電件数" fill="#93b5d0" barSize={14} radius={[2, 2, 0, 0]} />
                        <Line yAxisId="right" type="monotone" dataKey="connectionRate" name="接続率" stroke="#0f766e" strokeWidth={2} dot={{ r: 3 }} />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </ChartCard>
                )}
                <ChartCard title="曜日別 架電件数 / 接続率" sub="架電記録から集計">
                  {teleapoByDayOfWeek.every(d => d.calls === 0) ? (
                    <p className="text-sm text-slate-400 py-4 text-center">架電データなし</p>
                  ) : (
                    <ResponsiveContainer width="100%" height={220}>
                      <ComposedChart data={teleapoByDayOfWeek}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                        <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                        <YAxis yAxisId="left" tick={{ fontSize: 11 }} />
                        <YAxis yAxisId="right" orientation="right" domain={[0, 100]} unit="%" tick={{ fontSize: 11 }} />
                        <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }}
                          formatter={(v, n) => n === 'connectionRate' ? [`${v}%`, '接続率'] : [`${v}件`, '架電件数']} />
                        <Bar yAxisId="left" dataKey="calls" name="架電件数" fill="#93b5d0" barSize={20} radius={[2, 2, 0, 0]} />
                        <Line yAxisId="right" type="monotone" dataKey="connectionRate" name="接続率" stroke="#0f766e" strokeWidth={2} dot={{ r: 4 }} />
                      </ComposedChart>
                    </ResponsiveContainer>
                  )}
                </ChartCard>
              </div>
            )}
            {teleapoByCallCount.length > 0 && (
              <ChartCard title="架電回数別 アポ確定率" sub="N回架電した企業のうちアポ確定になった割合" className="mb-4">
                <ResponsiveContainer width="100%" height={220}>
                  <ComposedChart data={teleapoByCallCount}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                    <YAxis yAxisId="left" tick={{ fontSize: 11 }} />
                    <YAxis yAxisId="right" orientation="right" domain={[0, 100]} unit="%" tick={{ fontSize: 11 }} />
                    <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }}
                      formatter={(v, n) => n === 'appoRate' ? [`${v}%`, 'アポ確定率'] : [`${v}社`, '架電社数']} />
                    <Bar yAxisId="left" dataKey="companies" name="架電社数" fill="#b8cfe0" barSize={30} radius={[2, 2, 0, 0]} />
                    <Line yAxisId="right" type="monotone" dataKey="appoRate" name="アポ確定率" stroke="#c97a1a" strokeWidth={2.5} dot={{ r: 5, fill: '#c97a1a' }}
                      label={{ position: 'top', fontSize: 11, fill: '#c97a1a', formatter: v => v > 0 ? `${v}%` : '' }} />
                  </ComposedChart>
                </ResponsiveContainer>
              </ChartCard>
            )}

            {/* ── メール × 架電 相関（テレアポタブ内サマリ） ── */}
            {emailAppoCorr.some(d => d.companies > 0) && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
                <ChartCard title="メール送信有無別 アポ確定率" sub="メール→架電の効果検証">
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={emailAppoCorr} margin={{ top: 10, right: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                      <YAxis domain={[0, 100]} unit="%" tick={{ fontSize: 11 }} />
                      <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }}
                        formatter={(v, n) => n === 'appoRate' ? [`${v}%`, 'アポ確定率'] : [`${v}社`, n]} />
                      <Bar dataKey="appoRate" name="アポ確定率" fill="#0f766e" barSize={50} radius={[4,4,0,0]}
                        label={{ position: 'top', fontSize: 13, fill: '#0f766e', formatter: v => `${v}%` }} />
                    </BarChart>
                  </ResponsiveContainer>
                  <div className="flex justify-around mt-1 text-xs text-slate-500">
                    {emailAppoCorr.map(d => <span key={d.name}>{d.companies}社</span>)}
                  </div>
                </ChartCard>

                {emailLagAppo.length > 0 && (
                  <ChartCard title="送信〜架電 経過日数別 アポ確定率" sub="最適な架電タイミング検証">
                    <ResponsiveContainer width="100%" height={200}>
                      <BarChart data={emailLagAppo} margin={{ top: 10, right: 10, bottom: 20 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                        <XAxis dataKey="label" tick={{ fontSize: 10 }} interval={0} angle={-20} textAnchor="end" height={50} />
                        <YAxis domain={[0, 100]} unit="%" tick={{ fontSize: 11 }} />
                        <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }}
                          formatter={(v, n) => n === 'appoRate' ? [`${v}%`, 'アポ確定率'] : [`${v}社`, n]} />
                        <Bar dataKey="appoRate" name="アポ確定率" fill="#7c3aed" barSize={30} radius={[4,4,0,0]}
                          label={{ position: 'top', fontSize: 11, fill: '#7c3aed', formatter: v => `${v}%` }} />
                      </BarChart>
                    </ResponsiveContainer>
                  </ChartCard>
                )}
              </div>
            )}

            {/* ── 未架電企業内訳 ── */}
            {teleapoUncalled.total > 0 && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4 items-start">
                <ChartCard title={`未架電企業内訳（業種別）`} sub={`全${teleapoUncalled.total}社`}>
                  <ResponsiveContainer width="100%" height={Math.max(160, teleapoUncalled.byIndustry.length * 36)}>
                    <BarChart data={teleapoUncalled.byIndustry} layout="vertical" margin={{ left: 0, right: 40 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis type="number" tick={{ fontSize: 11 }} />
                      <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={120}
                        tickFormatter={name => name.length > 6 ? name.slice(0, 6) + '…' : name} />
                      <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                      <Bar dataKey="value" name="未架電社数" fill="#f59e0b" barSize={18}
                        label={{ position: 'right', fontSize: 11, fill: '#64748b' }}
                        shape={(props) => <ClickableBar {...props} fill="#f59e0b" onClick={() => navigateTeleapoWithFilters({ industry: props.payload?.name })} />} />
                    </BarChart>
                  </ResponsiveContainer>
                </ChartCard>
                <ChartCard title="未架電企業内訳（規模別）" sub={`全${teleapoUncalled.total}社`}>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={teleapoUncalled.byScale} margin={{ right: 10, bottom: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} angle={-20} textAnchor="end" height={55} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                      <Bar dataKey="value" name="未架電社数" fill="#f59e0b" barSize={20}
                        shape={(props) => <ClickableBar {...props} fill="#f59e0b" onClick={() => navigateTeleapoWithFilters({ employeeScale: props.payload?.name })} />} />
                    </BarChart>
                  </ResponsiveContainer>
                </ChartCard>
              </div>
            )}

          </>)}
        </div>
      )}

      {/* ========== メール分析 ダッシュボード ========== */}
      {dashboardMode === 'email' && (
        <div>
          {teleapoItems.length === 0 ? (
            <div className="text-center py-16 text-slate-400">
              <p className="text-base mb-1">テレアポデータがありません</p>
              <p className="text-sm">テレアポリストからデータを追加してください</p>
            </div>
          ) : (
            <>
              {/* KPIカード */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
                {[
                  { label: 'メールあり企業', value: emailStats.withEmail, sub: `全${emailStats.total}社中`, color: 'text-slate-700' },
                  { label: '送信済み', value: emailStats.sent, sub: `送信率 ${emailStats.sentRate}%`, color: 'text-blue-600' },
                  { label: '開封済み', value: emailStats.opened, sub: `開封率 ${emailStats.openRate}%`, color: 'text-amber-600' },
                  { label: 'クリック済み', value: emailStats.clicked, sub: `クリック率 ${emailStats.clickRate}%`, color: 'text-emerald-600' },
                ].map(kpi => (
                  <div key={kpi.label} className="bg-white rounded-xl border border-slate-200 shadow-sm px-4 py-4">
                    <p className="text-xs text-slate-500 mb-1">{kpi.label}</p>
                    <p className={`text-3xl font-bold ${kpi.color}`}>{kpi.value}<span className="text-base font-normal ml-1">社</span></p>
                    <p className="text-xs text-slate-400 mt-1">{kpi.sub}</p>
                  </div>
                ))}
              </div>

              {/* メールファネル */}
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 mb-5">
                <p className="text-xs font-semibold text-slate-500 mb-4 uppercase tracking-wide">メールファネル</p>
                <div className="space-y-4">
                  {[
                    { label: '送信率', value: emailStats.sentRate, color: 'bg-blue-500', desc: `${emailStats.sent}社 / メールあり${emailStats.withEmail}社` },
                    { label: '開封率', value: emailStats.openRate, color: 'bg-amber-400', desc: `${emailStats.opened}社 / 送信済み${emailStats.sent}社` },
                    { label: 'クリック率', value: emailStats.clickRate, color: 'bg-emerald-500', desc: `${emailStats.clicked}社 / 送信済み${emailStats.sent}社` },
                  ].map(row => (
                    <div key={row.label}>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-sm font-medium text-slate-700">{row.label}</span>
                        <span className="text-sm font-bold text-slate-800">{row.value}%</span>
                      </div>
                      <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
                        <div className={`h-full ${row.color} rounded-full transition-all`} style={{ width: `${Math.min(row.value, 100)}%` }} />
                      </div>
                      <p className="text-xs text-slate-400 mt-1">{row.desc}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* ── 業種別・規模別 ── */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
                {emailByIndustry.length > 0 && (
                  <ChartCard title="業種別 メールカバレッジ / 送信率" sub="カバレッジ＝メアドあり企業÷全企業">
                    <ResponsiveContainer width="100%" height={Math.max(200, emailByIndustry.length * 44)}>
                      <BarChart data={emailByIndustry} layout="vertical" margin={{ left: 0, right: 50 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                        <XAxis type="number" domain={[0, 100]} ticks={[0,25,50,75,100]} unit="%" tick={{ fontSize: 11 }} />
                        <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={120}
                          tickFormatter={n => n.length > 6 ? n.slice(0,6) + '…' : n} />
                        <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }}
                          formatter={(v, n) => [`${v}%`, n]} />
                        <Legend wrapperStyle={{ fontSize: 11 }} />
                        <Bar dataKey="coverageRate" name="カバレッジ率" fill="#94a3b8" barSize={10}
                          label={{ position: 'right', fontSize: 10, fill: '#64748b', formatter: v => `${v}%` }} />
                        <Bar dataKey="sentRate" name="送信率" fill="#3b82f6" barSize={10} />
                      </BarChart>
                    </ResponsiveContainer>
                  </ChartCard>
                )}
                {emailByScale.length > 0 && (
                  <ChartCard title="従業員規模別 メールカバレッジ / 送信率" sub="カバレッジ＝メアドあり企業÷全企業">
                    <ResponsiveContainer width="100%" height={260}>
                      <BarChart data={emailByScale} margin={{ right: 10, bottom: 20 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                        <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} angle={-20} textAnchor="end" height={55} />
                        <YAxis domain={[0, 100]} ticks={[0,25,50,75,100]} unit="%" tick={{ fontSize: 11 }} />
                        <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }}
                          formatter={(v, n) => [`${v}%`, n]} />
                        <Legend wrapperStyle={{ fontSize: 11 }} />
                        <Bar dataKey="coverageRate" name="カバレッジ率" fill="#94a3b8" barSize={14} />
                        <Bar dataKey="sentRate" name="送信率" fill="#3b82f6" barSize={14} />
                      </BarChart>
                    </ResponsiveContainer>
                  </ChartCard>
                )}
              </div>

              {/* ── テンプレート別 ── */}
              {emailByTemplate.length > 0 && (
                <ChartCard title="テンプレート別 送信数 / 開封率" sub="母数：送信済み企業" className="mb-4">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm border-collapse">
                      <thead>
                        <tr className="bg-slate-50 text-xs text-slate-500 font-medium">
                          <th className="px-3 py-2 text-left border border-slate-200">テンプレート名</th>
                          <th className="px-3 py-2 text-right border border-slate-200">送信数</th>
                          <th className="px-3 py-2 text-right border border-slate-200">開封済み</th>
                          <th className="px-3 py-2 text-right border border-slate-200">開封率</th>
                          <th className="px-3 py-2 text-right border border-slate-200">クリック率</th>
                        </tr>
                      </thead>
                      <tbody>
                        {emailByTemplate.map((t, i) => (
                          <tr key={t.name} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}>
                            <td className="px-3 py-2.5 font-medium text-slate-700 border border-slate-200">{t.name}</td>
                            <td className="px-3 py-2.5 text-right text-slate-600 border border-slate-200">{t.sent}社</td>
                            <td className="px-3 py-2.5 text-right text-amber-600 font-medium border border-slate-200">{t.opened}社</td>
                            <td className="px-3 py-2.5 text-right border border-slate-200">
                              <span className={`font-semibold ${t.openRate >= 30 ? 'text-emerald-600' : t.openRate >= 15 ? 'text-amber-600' : 'text-slate-500'}`}>{t.openRate}%</span>
                            </td>
                            <td className="px-3 py-2.5 text-right border border-slate-200">
                              <span className={`font-semibold ${t.clickRate >= 10 ? 'text-emerald-600' : 'text-slate-500'}`}>{t.clickRate}%</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </ChartCard>
              )}

              {/* ── 送信タイミング別（曜日・時間帯） ── */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
                <ChartCard title="送信曜日別 送信数 / 開封率" sub="送信日時ベース">
                  {emailByDayOfWeek.every(d => d.sent === 0) ? (
                    <p className="text-sm text-slate-400 py-4 text-center">送信データなし</p>
                  ) : (
                    <ResponsiveContainer width="100%" height={220}>
                      <ComposedChart data={emailByDayOfWeek}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                        <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                        <YAxis yAxisId="left" tick={{ fontSize: 11 }} />
                        <YAxis yAxisId="right" orientation="right" domain={[0, 100]} unit="%" tick={{ fontSize: 11 }} />
                        <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }} />
                        <Legend wrapperStyle={{ fontSize: 11 }} />
                        <Bar yAxisId="left" dataKey="sent" name="送信数" fill="#3b82f6" barSize={24} radius={[3,3,0,0]} />
                        <Line yAxisId="right" type="monotone" dataKey="openRate" name="開封率" stroke="#f59e0b" strokeWidth={2} dot={{ r: 4 }} />
                      </ComposedChart>
                    </ResponsiveContainer>
                  )}
                </ChartCard>

                <ChartCard title="送信時間帯別 送信数 / 開封率" sub="送信日時ベース">
                  {emailByHour.length === 0 ? (
                    <p className="text-sm text-slate-400 py-4 text-center">送信データなし</p>
                  ) : (
                    <ResponsiveContainer width="100%" height={220}>
                      <ComposedChart data={emailByHour}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                        <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} angle={-30} textAnchor="end" height={45} />
                        <YAxis yAxisId="left" tick={{ fontSize: 11 }} />
                        <YAxis yAxisId="right" orientation="right" domain={[0, 100]} unit="%" tick={{ fontSize: 11 }} />
                        <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }} />
                        <Legend wrapperStyle={{ fontSize: 11 }} />
                        <Bar yAxisId="left" dataKey="sent" name="送信数" fill="#6366f1" barSize={16} radius={[2,2,0,0]} />
                        <Line yAxisId="right" type="monotone" dataKey="openRate" name="開封率" stroke="#f59e0b" strokeWidth={2} dot={{ r: 3 }} />
                      </ComposedChart>
                    </ResponsiveContainer>
                  )}
                </ChartCard>
              </div>

              {/* ── メール × 架電 相関分析 ── */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 mb-4">
                <p className="text-xs font-semibold text-slate-600 mb-3 uppercase tracking-wide">メール → 架電 相関分析</p>
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                  {/* メールあり/なし別 */}
                  <ChartCard title="メール送信有無別 アポ確定率" sub="架電済み企業ベース">
                    <ResponsiveContainer width="100%" height={200}>
                      <BarChart data={emailAppoCorrF} margin={{ top: 10, right: 20 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                        <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                        <YAxis domain={[0, 100]} unit="%" tick={{ fontSize: 11 }} />
                        <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }}
                          formatter={(v, n) => n === 'appoRate' ? [`${v}%`, 'アポ確定率'] : [`${v}社`, n]} />
                        <Bar dataKey="appoRate" name="アポ確定率" fill="#0f766e" barSize={40} radius={[4,4,0,0]}
                          label={{ position: 'top', fontSize: 12, fill: '#0f766e', formatter: v => `${v}%` }} />
                      </BarChart>
                    </ResponsiveContainer>
                    <div className="flex justify-around mt-1 text-xs text-slate-500">
                      {emailAppoCorrF.map(d => <span key={d.name}>{d.companies}社</span>)}
                    </div>
                  </ChartCard>

                  {/* 経過日数別 */}
                  <ChartCard title="送信〜架電 経過日数別 アポ確定率" sub="emailSentAt と初回架電日の差">
                    {emailLagAppoF.length === 0 ? (
                      <p className="text-sm text-slate-400 py-8 text-center">データなし<br/><span className="text-xs">（メール送信後に架電した企業が必要）</span></p>
                    ) : (
                      <ResponsiveContainer width="100%" height={200}>
                        <BarChart data={emailLagAppoF} margin={{ top: 10, right: 10, bottom: 20 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                          <XAxis dataKey="label" tick={{ fontSize: 10 }} interval={0} angle={-20} textAnchor="end" height={50} />
                          <YAxis domain={[0, 100]} unit="%" tick={{ fontSize: 11 }} />
                          <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }}
                            formatter={(v, n) => n === 'appoRate' ? [`${v}%`, 'アポ確定率'] : [`${v}社`, n]} />
                          <Bar dataKey="appoRate" name="アポ確定率" fill="#7c3aed" barSize={28} radius={[4,4,0,0]}
                            label={{ position: 'top', fontSize: 11, fill: '#7c3aed', formatter: v => `${v}%` }} />
                        </BarChart>
                      </ResponsiveContainer>
                    )}
                  </ChartCard>

                  {/* 開封状態別 */}
                  <ChartCard title="開封状態別 接続率 / アポ確定率" sub="SendGrid連携後に自動更新">
                    {emailOpenAppoCorr.length === 0 ? (
                      <p className="text-sm text-slate-400 py-8 text-center">データなし</p>
                    ) : (
                      <ResponsiveContainer width="100%" height={200}>
                        <BarChart data={emailOpenAppoCorr} margin={{ top: 10, right: 10, bottom: 30 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                          <XAxis dataKey="name" tick={{ fontSize: 9 }} interval={0} angle={-15} textAnchor="end" height={55} />
                          <YAxis domain={[0, 100]} unit="%" tick={{ fontSize: 11 }} />
                          <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }}
                            formatter={(v, n) => [`${v}%`, n]} />
                          <Legend wrapperStyle={{ fontSize: 10 }} />
                          <Bar dataKey="connectionRate" name="接続率" fill="#4a82ae" barSize={14} />
                          <Bar dataKey="appoRate" name="アポ確定率" fill="#0f766e" barSize={14} />
                        </BarChart>
                      </ResponsiveContainer>
                    )}
                  </ChartCard>
                </div>
              </div>

              {/* 注記 */}
              <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-xs text-amber-700">
                <p className="font-semibold mb-1">開封率・クリック率について</p>
                <p>現在、開封・クリックはSendGrid Webhookが未接続のため自動更新されません。バックエンド実装後、リアルタイムで追跡されます。</p>
              </div>
            </>
          )}
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
              <Bar yAxisId="left" dataKey="proposals" name="提案数" fill="#4a82ae" radius={[3, 3, 0, 0]}
                activeBar={{ fill: '#4a82ae', fillOpacity: 0.55 }}
                className="cursor-pointer" onClick={(d) => navigateWithFilters({ month: d.month })} />
              <Bar yAxisId="left" dataKey="won" name="受注数" fill="#0f766e" radius={[3, 3, 0, 0]}
                activeBar={{ fill: '#0f766e', fillOpacity: 0.55 }}
                className="cursor-pointer" onClick={(d) => navigateWithFilters({ month: d.month, status: '受注' })} />
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
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {repSummary.map(r => (
                  <tr key={r.name} className="hover:bg-sky-50 cursor-pointer transition-colors" onClick={() => navigateWithFilters({ salesRep: r.name })}>
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
              <BarChart data={scaleData} margin={{ right: 10, bottom: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} angle={-20} textAnchor="end" height={55} />
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
          const hmKeys = HEATMAP_KEYS[heatmapTab]

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
                          <td key={cell.col}
                            className="px-2 py-2 text-center border-b border-slate-100 cursor-pointer hover:opacity-80 transition-opacity"
                            style={{ backgroundColor: bgColor, color: textColor }}
                            title={`${row.row} × ${cell.col}\n受注率: ${cell.rate}%（受注${cell.won}件 / 提案${cell.total}件）`}
                            onClick={() => navigateWithFilters({ [hmKeys.row]: row.row, [hmKeys.col]: cell.col })}>
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
                      <Bar yAxisId="right" dataKey="denominator" name="提案数" fill="#dbe6f0" radius={[3, 3, 0, 0]}
                        activeBar={{ fill: '#dbe6f0', fillOpacity: 0.5 }}
                        className="cursor-pointer" onClick={(d) => navigateWithFilters({ month: d.name, decisionMaker: 'yes' })} />
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
                      shape={(props) => {
                        const extra = { decisionMaker: 'yes' }
                        if (revisitTab === 'byRep') extra.salesRep = props.payload?.name
                        else if (revisitTab === 'byIndustry') extra.industry = props.payload?.name
                        else if (revisitTab === 'byRelationship') extra.relationship = props.payload?.name
                        else if (revisitTab === 'byScale') extra.employeeScale = props.payload?.name
                        return <ClickableBar {...props} fill={navyByValue(props.payload?.rate || 0, maxVal)} onClick={() => navigateWithFilters(extra)} />
                      }} />
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
              className="relative group flex items-center justify-center overflow-hidden transition-all duration-300 cursor-pointer hover:opacity-70"
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
