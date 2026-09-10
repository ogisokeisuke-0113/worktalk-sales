import { useState, useMemo } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Cell, PieChart, Pie, Legend,
} from 'recharts'
import { PROPOSAL_STATUSES, STATUS_COLORS, FUNNEL_COLORS, RELATIONSHIPS } from '../constants'

const COLORS = ['#1a5285', '#2d6a9e', '#4a82ae', '#6e9bbf', '#93b5d0', '#0f766e', '#b45309', '#be123c']
const NAVY_SCALE = ['#dbe6f0', '#b8cfe0', '#93b5d0', '#6e9bbf', '#4a82ae', '#2d6a9e', '#1a5285']
function navyByValue(value, max) {
  if (max <= 0) return NAVY_SCALE[3]
  const ratio = Math.min(value / max, 1)
  const idx = Math.round(ratio * (NAVY_SCALE.length - 1))
  return NAVY_SCALE[idx]
}

function daysBetween(dateStr1, dateStr2) {
  if (!dateStr1 || !dateStr2) return null
  const d1 = new Date(dateStr1)
  const d2 = new Date(dateStr2)
  if (isNaN(d1) || isNaN(d2)) return null
  return Math.round(Math.abs(d2 - d1) / (1000 * 60 * 60 * 24))
}

function getLastStatusDate(proposal) {
  if (proposal.conclusionDate) return proposal.conclusionDate
  if (proposal.activityLog) {
    for (let i = proposal.activityLog.length - 1; i >= 0; i--) {
      const log = proposal.activityLog[i]
      if (log.type === 'status' && log.date) return log.date
    }
  }
  return null
}

// dateFrom / dateTo は "YYYY-MM-DD" 形式、null なら制限なし
function inPeriod(dateStr, dateFrom, dateTo) {
  if (!dateStr) return false
  const d = dateStr.slice(0, 10)
  if (dateFrom && d < dateFrom) return false
  if (dateTo && d > dateTo) return false
  return true
}

function todayStr() {
  return new Date().toISOString().slice(0, 10)
}

function firstDayOfMonth() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

export default function SalesRepView({ proposals, users = [], teleapoItems = [] }) {
  const [selectedRep, setSelectedRep] = useState(null)
  const [dateFrom, setDateFrom] = useState(null)
  const [dateTo, setDateTo] = useState(null)

  // 期間フィルタ済み提案
  const filteredProposals = useMemo(() => {
    if (!dateFrom && !dateTo) return proposals
    return proposals.filter(p => inPeriod(p.initialDate, dateFrom, dateTo))
  }, [proposals, dateFrom, dateTo])

  const reps = useMemo(() => {
    const map = {}
    const wonStatuses = ['受注', '決裁者合意']
    const inProgressStatuses = ['担当者合意', '決裁者アポ調整中']

    filteredProposals.forEach(p => {
      const name = p.salesRep || '(未設定)'
      if (!map[name]) {
        map[name] = {
          name, total: 0, won: 0, lost: 0, inProgress: 0, appoConfirmed: 0,
          denominator: 0,
        }
      }
      const r = map[name]
      if (p.status === 'アポ確定') {
        r.appoConfirmed++
      } else {
        r.total++
        r.denominator++
        if (wonStatuses.includes(p.status)) r.won++
        if (p.status === '失注') r.lost++
        if (inProgressStatuses.includes(p.status)) r.inProgress++
      }
    })

    return Object.values(map)
      .map(r => ({
        ...r,
        winRate: r.denominator > 0 ? Number(((r.won / r.denominator) * 100).toFixed(1)) : 0,
      }))
      .sort((a, b) => b.total - a.total)
  }, [filteredProposals])

  // テレアポ集計（担当者・期間フィルタ済み）
  const teleapoStats = useMemo(() => {
    if (!selectedRep) return null

    // この担当者 × 期間 の架電履歴が 1件でもあるアイテムを収集
    const repItems = teleapoItems.map(item => {
      const calls = (item.callHistory || []).filter(c =>
        c.caller === selectedRep &&
        ((!dateFrom && !dateTo) || inPeriod(c.date, dateFrom, dateTo))
      )
      return { item, calls }
    }).filter(x => x.calls.length > 0)

    const totalCompanies = repItems.length
    const totalCalls = repItems.reduce((s, x) => s + x.calls.length, 0)

    const NOT_CONNECTED = ['不在', '受付ブロック']
    const connectedCalls = repItems.reduce((s, x) =>
      s + x.calls.filter(c => !NOT_CONNECTED.includes(c.result)).length, 0)
    const connectionRate = totalCalls > 0 ? Number(((connectedCalls / totalCalls) * 100).toFixed(1)) : 0

    // 接続した企業数（少なくとも1回接続あり）
    const connectedCompanies = repItems.filter(x =>
      x.calls.some(c => !NOT_CONNECTED.includes(c.result))
    ).length

    // アポ確定数: status=アポ確定 かつ アポ獲得の架電がこの担当者・期間内にある
    const appoItems = repItems.filter(x =>
      x.item.status === 'アポ確定' &&
      x.calls.some(c => c.result === 'アポ獲得')
    )
    const appoCount = appoItems.length
    const appoRate = totalCalls > 0 ? Number(((appoCount / totalCalls) * 100).toFixed(1)) : 0

    // 提案数（filteredProposals から）
    const repProposalCount = filteredProposals.filter(p => (p.salesRep || '(未設定)') === selectedRep).length
    const repWonCount = filteredProposals.filter(p =>
      (p.salesRep || '(未設定)') === selectedRep &&
      ['受注', '決裁者合意'].includes(p.status)
    ).length

    // 業種別実績（テレアポ）
    const industryMap = {}
    repItems.forEach(({ item, calls }) => {
      const ind = item.industry || '(未設定)'
      if (!industryMap[ind]) industryMap[ind] = { name: ind, companies: 0, appo: 0 }
      industryMap[ind].companies++
      if (item.status === 'アポ確定' && calls.some(c => c.result === 'アポ獲得')) {
        industryMap[ind].appo++
      }
    })
    const byIndustry = Object.values(industryMap)
      .map(d => ({
        ...d,
        rate: d.companies > 0 ? Number(((d.appo / d.companies) * 100).toFixed(1)) : 0,
      }))
      .sort((a, b) => b.companies - a.companies)

    // 断り理由ランキング
    const rejMap = {}
    repItems.forEach(({ calls }) => {
      calls.filter(c => c.result === '断り').forEach(c => {
        const reason = c.rejectionReason || '(未記入)'
        rejMap[reason] = (rejMap[reason] || 0) + 1
      })
    })
    const rejectionRanking = Object.entries(rejMap)
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5)

    // Keep転換率
    const keepItems = teleapoItems.filter(item => {
      const kh = item.keepHistory || []
      return kh.some(k =>
        k.by === selectedRep &&
        ((!dateFrom && !dateTo) || inPeriod(k.at, dateFrom, dateTo))
      )
    })
    const keepCount = keepItems.length
    const keepConverted = keepItems.filter(item => item.status === 'アポ確定').length
    const keepRate = keepCount > 0 ? Number(((keepConverted / keepCount) * 100).toFixed(1)) : 0

    return {
      totalCompanies,
      totalCalls,
      connectedCalls,
      connectedCompanies,
      connectionRate,
      appoCount,
      appoRate,
      repProposalCount,
      repWonCount,
      byIndustry,
      rejectionRanking,
      keepCount,
      keepConverted,
      keepRate,
    }
  }, [selectedRep, teleapoItems, filteredProposals, dateFrom, dateTo])

  const selectedRepData = useMemo(() => {
    if (!selectedRep) return null
    const repProposals = filteredProposals.filter(p => (p.salesRep || '(未設定)') === selectedRep)

    const pipeline = PROPOSAL_STATUSES.map(status => {
      const items = repProposals.filter(p => p.status === status)
      return { name: status, count: items.length }
    }).filter(d => d.count > 0)

    const monthMap = {}
    repProposals.forEach(p => {
      if (!p.initialDate) return
      const month = p.initialDate.slice(0, 7)
      if (!monthMap[month]) monthMap[month] = { month, total: 0, won: 0 }
      monthMap[month].total++
      if (['受注', '決裁者合意'].includes(p.status)) monthMap[month].won++
    })
    const monthly = Object.values(monthMap).sort((a, b) => a.month.localeCompare(b.month))

    const leadTime = (() => {
      const wonDays = []
      const lostDays = []
      const inProgressDays = []
      const now = new Date().toISOString().slice(0, 10)

      repProposals.forEach(p => {
        if (!p.initialDate) return
        if (['受注', '決裁者合意'].includes(p.status)) {
          const endDate = getLastStatusDate(p) || p.conclusionDate || now
          const days = daysBetween(p.initialDate, endDate)
          if (days !== null) wonDays.push(days)
        } else if (p.status === '失注') {
          const endDate = getLastStatusDate(p) || now
          const days = daysBetween(p.initialDate, endDate)
          if (days !== null) lostDays.push(days)
        } else {
          const days = daysBetween(p.initialDate, now)
          if (days !== null) inProgressDays.push(days)
        }
      })

      const avg = arr => arr.length > 0 ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : null
      return {
        wonAvg: avg(wonDays), wonCount: wonDays.length,
        lostAvg: avg(lostDays), lostCount: lostDays.length,
        inProgressAvg: avg(inProgressDays), inProgressCount: inProgressDays.length,
      }
    })()

    const byIndustry = (() => {
      const map = {}
      repProposals.forEach(p => {
        const ind = p.industry || '(未設定)'
        if (!map[ind]) map[ind] = { name: ind, total: 0, won: 0, lost: 0 }
        map[ind].total++
        if (['受注', '決裁者合意'].includes(p.status)) map[ind].won++
        if (p.status === '失注') map[ind].lost++
      })
      return Object.values(map)
        .map(d => ({
          ...d,
          winRate: (d.won + d.lost) > 0 ? Number(((d.won / (d.won + d.lost)) * 100).toFixed(1)) : null,
        }))
        .sort((a, b) => b.total - a.total)
    })()

    const byRelationship = (() => {
      const map = {}
      repProposals.forEach(p => {
        const rel = p.relationship || '(未設定)'
        if (!map[rel]) map[rel] = { name: rel, total: 0, won: 0, lost: 0 }
        map[rel].total++
        if (['受注', '決裁者合意'].includes(p.status)) map[rel].won++
        if (p.status === '失注') map[rel].lost++
      })
      return Object.values(map)
        .map(d => ({
          ...d,
          winRate: (d.won + d.lost) > 0 ? Number(((d.won / (d.won + d.lost)) * 100).toFixed(1)) : null,
        }))
        .sort((a, b) => b.total - a.total)
    })()

    return { proposals: repProposals, pipeline, monthly, leadTime, byIndustry, byRelationship }
  }, [selectedRep, filteredProposals])

  if (proposals.length === 0) {
    return (
      <div className="text-center py-20 text-slate-400">
        <p className="text-lg mb-2">データがありません</p>
        <p className="text-sm">提案リストタブからデータを追加してください</p>
      </div>
    )
  }

  const periodLabel = (!dateFrom && !dateTo)
    ? '累計'
    : `${dateFrom || '開始'} 〜 ${dateTo || '終了'}`

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <h2 className="text-xl font-bold text-slate-800">営業担当別実績</h2>

        {/* 期間フィルタ */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-slate-500 font-medium">期間:</span>
          <input
            type="date"
            value={dateFrom || ''}
            onChange={e => setDateFrom(e.target.value || null)}
            className="text-xs border border-slate-300 rounded px-2 py-1 text-slate-700"
          />
          <span className="text-xs text-slate-400">〜</span>
          <input
            type="date"
            value={dateTo || ''}
            onChange={e => setDateTo(e.target.value || null)}
            className="text-xs border border-slate-300 rounded px-2 py-1 text-slate-700"
          />
          <button
            onClick={() => { setDateFrom(firstDayOfMonth()); setDateTo(todayStr()) }}
            className={`text-xs px-3 py-1 rounded border transition-colors ${
              dateFrom === firstDayOfMonth() && dateTo === todayStr()
                ? 'bg-[#2d6a9e] text-white border-[#2d6a9e]'
                : 'border-slate-300 text-slate-600 hover:bg-slate-100'
            }`}
          >
            今月
          </button>
          <button
            onClick={() => { setDateFrom(null); setDateTo(null) }}
            className={`text-xs px-3 py-1 rounded border transition-colors ${
              !dateFrom && !dateTo
                ? 'bg-[#2d6a9e] text-white border-[#2d6a9e]'
                : 'border-slate-300 text-slate-600 hover:bg-slate-100'
            }`}
          >
            累計
          </button>
          <span className="text-[10px] text-slate-400 ml-1">{periodLabel}</span>
        </div>
      </div>

      {/* Summary Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden mb-6">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">営業担当</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase">提案数</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase">アポ確定</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase">受注</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase">受注率</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase">進行中</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase">失注</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {reps.map(rep => (
                <tr
                  key={rep.name}
                  onClick={() => setSelectedRep(selectedRep === rep.name ? null : rep.name)}
                  className={`cursor-pointer transition-colors ${
                    selectedRep === rep.name ? 'bg-sky-50' : 'hover:bg-slate-50'
                  }`}
                >
                  <td className="px-4 py-3 font-medium text-slate-800">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#4a82ae] to-[#2d6a9e] flex items-center justify-center text-white text-xs font-bold">
                        {rep.name.slice(0, 1)}
                      </div>
                      {rep.name}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right font-medium">{rep.total}</td>
                  <td className="px-4 py-3 text-right text-[#2d6a9e] font-medium">{rep.appoConfirmed}</td>
                  <td className="px-4 py-3 text-right text-[#0f766e] font-medium">{rep.won}</td>
                  <td className="px-4 py-3 text-right">
                    <span className={`inline-block px-2 py-0.5 rounded text-xs font-bold ${
                      rep.winRate >= 20 ? 'bg-teal-50 text-[#0f766e]' :
                      rep.winRate >= 10 ? 'bg-amber-50 text-[#b45309]' :
                      'bg-rose-50 text-[#be123c]'
                    }`}>
                      {rep.winRate}%
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-[#4a82ae] font-medium">{rep.inProgress}</td>
                  <td className="px-4 py-3 text-right text-[#be123c]">{rep.lost}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-slate-50 font-bold text-sm">
              <tr>
                <td className="px-4 py-3 text-slate-700">合計</td>
                <td className="px-4 py-3 text-right">{reps.reduce((s, r) => s + r.total, 0)}</td>
                <td className="px-4 py-3 text-right text-[#2d6a9e]">{reps.reduce((s, r) => s + r.appoConfirmed, 0)}</td>
                <td className="px-4 py-3 text-right text-[#0f766e]">{reps.reduce((s, r) => s + r.won, 0)}</td>
                <td className="px-4 py-3 text-right">-</td>
                <td className="px-4 py-3 text-right text-[#4a82ae]">{reps.reduce((s, r) => s + r.inProgress, 0)}</td>
                <td className="px-4 py-3 text-right text-[#be123c]">{reps.reduce((s, r) => s + r.lost, 0)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Selected Rep Detail */}
      {selectedRep && selectedRepData && (
        <div className="animate-fade-in">
          <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#4a82ae] to-[#2d6a9e] flex items-center justify-center text-white text-xs font-bold">
              {selectedRep.slice(0, 1)}
            </div>
            {selectedRep} の詳細分析
            <span className="text-xs text-slate-400 font-normal ml-2">{periodLabel}</span>
          </h3>

          {/* ─── テレアポ KPI ─── */}
          {teleapoStats && (
            <div className="mb-6">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-1 h-5 rounded-full bg-[#2d6a9e]" />
                <h4 className="text-sm font-bold text-slate-700">テレアポ実績</h4>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-4">
                <div className="bg-sky-50 border border-sky-200 rounded-lg p-3 text-center">
                  <p className="text-[10px] text-[#4a82ae] font-medium mb-1">架電社数</p>
                  <p className="text-2xl font-bold text-[#2d6a9e]">{teleapoStats.totalCompanies}</p>
                  <p className="text-[10px] text-slate-400">社</p>
                </div>
                <div className="bg-sky-50 border border-sky-200 rounded-lg p-3 text-center">
                  <p className="text-[10px] text-[#4a82ae] font-medium mb-1">架電数</p>
                  <p className="text-2xl font-bold text-[#2d6a9e]">{teleapoStats.totalCalls}</p>
                  <p className="text-[10px] text-slate-400">件</p>
                </div>
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-center">
                  <p className="text-[10px] text-[#b45309] font-medium mb-1">接続率</p>
                  <p className="text-2xl font-bold text-[#b45309]">{teleapoStats.connectionRate}%</p>
                  <p className="text-[10px] text-slate-400">{teleapoStats.connectedCalls}件接続</p>
                </div>
                <div className="bg-teal-50 border border-teal-200 rounded-lg p-3 text-center">
                  <p className="text-[10px] text-[#0f766e] font-medium mb-1">アポ確定数</p>
                  <p className="text-2xl font-bold text-[#0f766e]">{teleapoStats.appoCount}</p>
                  <p className="text-[10px] text-slate-400">社</p>
                </div>
                <div className="bg-teal-50 border border-teal-200 rounded-lg p-3 text-center">
                  <p className="text-[10px] text-[#0f766e] font-medium mb-1">確定率</p>
                  <p className="text-2xl font-bold text-[#0f766e]">{teleapoStats.appoRate}%</p>
                  <p className="text-[10px] text-slate-400">架電数比</p>
                </div>
              </div>

              {/* ─── フルファネル ─── */}
              {teleapoStats.totalCompanies > 0 && (() => {
                const steps = [
                  { label: '架電社数', count: teleapoStats.totalCompanies, color: '#4a82ae' },
                  { label: '通電社数', count: teleapoStats.connectedCompanies, color: '#2d6a9e' },
                  { label: 'アポ確定(テレ)', count: teleapoStats.appoCount, color: '#0f766e' },
                  { label: '提案数', count: teleapoStats.repProposalCount, color: '#b45309' },
                  { label: '受注数', count: teleapoStats.repWonCount, color: '#be123c' },
                ]
                const maxCount = Math.max(...steps.map(s => s.count), 1)
                return (
                  <div className="bg-white rounded-lg shadow p-4 mb-4">
                    <h5 className="text-xs font-bold text-slate-600 mb-3">フルファネル（テレアポ〜受注）</h5>
                    <div className="space-y-2">
                      {steps.map((step, i) => {
                        const prev = i > 0 ? steps[i - 1].count : null
                        const convRate = prev && prev > 0 ? Number(((step.count / prev) * 100).toFixed(1)) : null
                        return (
                          <div key={step.label} className="flex items-center gap-3">
                            <div className="w-28 text-right text-[10px] text-slate-600 shrink-0 font-medium">{step.label}</div>
                            <div className="flex-1">
                              <div
                                className="h-7 rounded-r flex items-center px-2 transition-all min-w-[2rem]"
                                style={{
                                  width: `${Math.max((step.count / maxCount) * 100, step.count > 0 ? 10 : 0)}%`,
                                  backgroundColor: step.color,
                                }}
                              >
                                <span className="text-white text-[10px] font-bold whitespace-nowrap">{step.count}</span>
                              </div>
                            </div>
                            {convRate !== null && (
                              <div className="text-[10px] text-slate-400 shrink-0 w-16 text-right">
                                ↓ {convRate}%
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })()}

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
                {/* ─── テレアポ業種別実績 ─── */}
                {teleapoStats.byIndustry.length > 0 && (
                  <div className="bg-white rounded-lg shadow p-4">
                    <h5 className="text-xs font-bold text-slate-600 mb-3">テレアポ業種別実績</h5>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b border-slate-200">
                            <th className="py-2 text-left text-slate-500 font-medium">業種</th>
                            <th className="py-2 text-right text-slate-500 font-medium">架電社数</th>
                            <th className="py-2 text-right text-slate-500 font-medium">アポ確定</th>
                            <th className="py-2 text-right text-slate-500 font-medium">確定率</th>
                          </tr>
                        </thead>
                        <tbody>
                          {teleapoStats.byIndustry.map(d => (
                            <tr key={d.name} className="border-b border-slate-50 hover:bg-slate-50">
                              <td className="py-2 font-medium text-slate-700">{d.name}</td>
                              <td className="py-2 text-right">{d.companies}</td>
                              <td className="py-2 text-right text-[#0f766e] font-medium">{d.appo}</td>
                              <td className="py-2 text-right">
                                <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                  d.rate >= 20 ? 'bg-teal-50 text-[#0f766e]' :
                                  d.rate >= 10 ? 'bg-amber-50 text-[#b45309]' :
                                  'bg-rose-50 text-[#be123c]'
                                }`}>
                                  {d.rate}%
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* ─── 断り理由ランキング ─── */}
                {teleapoStats.rejectionRanking.length > 0 && (
                  <div className="bg-white rounded-lg shadow p-4">
                    <h5 className="text-xs font-bold text-slate-600 mb-3">断り理由 TOP5</h5>
                    <div className="space-y-2">
                      {teleapoStats.rejectionRanking.map((r, i) => {
                        const maxCount = teleapoStats.rejectionRanking[0]?.count || 1
                        return (
                          <div key={r.reason}>
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-[10px] font-medium text-slate-700 flex items-center gap-1">
                                <span className="w-4 h-4 rounded-full bg-rose-100 text-[#be123c] text-[8px] flex items-center justify-center font-bold shrink-0">
                                  {i + 1}
                                </span>
                                {r.reason}
                              </span>
                              <span className="text-[10px] text-slate-500 shrink-0 ml-2">{r.count}件</span>
                            </div>
                            <div className="w-full bg-slate-100 rounded-full h-2">
                              <div
                                className="bg-[#be123c] h-2 rounded-full"
                                style={{ width: `${(r.count / maxCount) * 100}%` }}
                              />
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* ─── Keep転換率 ─── */}
              {teleapoStats.keepCount > 0 && (
                <div className="bg-white rounded-lg shadow p-4 mb-4">
                  <h5 className="text-xs font-bold text-slate-600 mb-3">Keep転換率</h5>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="text-center p-3 rounded-lg bg-sky-50 border border-sky-200">
                      <p className="text-[10px] text-[#4a82ae] font-medium mb-1">Keep数</p>
                      <p className="text-2xl font-bold text-[#2d6a9e]">{teleapoStats.keepCount}</p>
                    </div>
                    <div className="text-center p-3 rounded-lg bg-teal-50 border border-teal-200">
                      <p className="text-[10px] text-[#0f766e] font-medium mb-1">Keep転換数</p>
                      <p className="text-2xl font-bold text-[#0f766e]">{teleapoStats.keepConverted}</p>
                    </div>
                    <div className="text-center p-3 rounded-lg bg-amber-50 border border-amber-200">
                      <p className="text-[10px] text-[#b45309] font-medium mb-1">Keep転換率</p>
                      <p className="text-2xl font-bold text-[#b45309]">{teleapoStats.keepRate}%</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ─── 営業KPIカード ─── */}
          <div className="flex items-center gap-2 mb-3">
            <div className="w-1 h-5 rounded-full bg-[#0f766e]" />
            <h4 className="text-sm font-bold text-slate-700">営業実績</h4>
          </div>

          {/* KPI Cards */}
          <div className="grid grid-cols-3 gap-4 mb-6">
            {(() => {
              const rep = reps.find(r => r.name === selectedRep)
              if (!rep) return null
              return (
                <>
                  <div className="bg-sky-50 border border-sky-200 rounded-lg p-3">
                    <p className="text-xs text-[#4a82ae] font-medium">提案数</p>
                    <p className="text-2xl font-bold text-[#2d6a9e]">{rep.total}</p>
                  </div>
                  <div className="bg-sky-50 border border-sky-200 rounded-lg p-3">
                    <p className="text-xs text-[#4a82ae] font-medium">アポ確定</p>
                    <p className="text-2xl font-bold text-[#2d6a9e]">{rep.appoConfirmed}</p>
                  </div>
                  <div className="bg-teal-50 border border-teal-200 rounded-lg p-3">
                    <p className="text-xs text-[#0f766e] font-medium">受注率</p>
                    <p className="text-2xl font-bold text-[#0f766e]">{rep.winRate}%</p>
                  </div>
                </>
              )
            })()}
          </div>

          {/* ─── 平均リードタイム ─── */}
          <div className="bg-white rounded-lg shadow p-4 mb-6">
            <h4 className="text-sm font-bold text-slate-700 mb-1">平均リードタイム</h4>
            <p className="text-[10px] text-slate-400 mb-4">初回提案日から各結果までの平均所要日数</p>
            <div className="grid grid-cols-3 gap-4">
              <div className="text-center p-3 rounded-lg bg-teal-50 border border-teal-200">
                <p className="text-xs text-[#0f766e] font-medium mb-1">受注まで</p>
                <p className="text-2xl font-bold text-[#0f766e]">
                  {selectedRepData.leadTime.wonAvg !== null ? `${selectedRepData.leadTime.wonAvg}日` : '-'}
                </p>
                <p className="text-[10px] text-slate-400 mt-1">{selectedRepData.leadTime.wonCount}件</p>
              </div>
              <div className="text-center p-3 rounded-lg bg-rose-50 border border-rose-200">
                <p className="text-xs text-[#be123c] font-medium mb-1">失注まで</p>
                <p className="text-2xl font-bold text-[#be123c]">
                  {selectedRepData.leadTime.lostAvg !== null ? `${selectedRepData.leadTime.lostAvg}日` : '-'}
                </p>
                <p className="text-[10px] text-slate-400 mt-1">{selectedRepData.leadTime.lostCount}件</p>
              </div>
              <div className="text-center p-3 rounded-lg bg-sky-50 border border-sky-200">
                <p className="text-xs text-[#4a82ae] font-medium mb-1">進行中の経過</p>
                <p className="text-2xl font-bold text-[#2d6a9e]">
                  {selectedRepData.leadTime.inProgressAvg !== null ? `${selectedRepData.leadTime.inProgressAvg}日` : '-'}
                </p>
                <p className="text-[10px] text-slate-400 mt-1">{selectedRepData.leadTime.inProgressCount}件</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            {/* ─── 業種別の勝ちパターン ─── */}
            {selectedRepData.byIndustry.length > 0 && (
              <div className="bg-white rounded-lg shadow p-4">
                <h4 className="text-sm font-bold text-slate-700 mb-1">業種別実績</h4>
                <p className="text-[10px] text-slate-400 mb-3">得意業種の把握と注力すべき業種の判断に</p>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-slate-200">
                        <th className="py-2 text-left text-slate-500 font-medium">業種</th>
                        <th className="py-2 text-right text-slate-500 font-medium">提案</th>
                        <th className="py-2 text-right text-slate-500 font-medium">受注</th>
                        <th className="py-2 text-right text-slate-500 font-medium">失注</th>
                        <th className="py-2 text-right text-slate-500 font-medium">受注率</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedRepData.byIndustry.map(d => (
                        <tr key={d.name} className="border-b border-slate-50 hover:bg-slate-50">
                          <td className="py-2 font-medium text-slate-700">{d.name}</td>
                          <td className="py-2 text-right">{d.total}</td>
                          <td className="py-2 text-right text-[#0f766e] font-medium">{d.won}</td>
                          <td className="py-2 text-right text-[#be123c]">{d.lost}</td>
                          <td className="py-2 text-right">
                            {d.winRate !== null ? (
                              <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                d.winRate >= 50 ? 'bg-teal-50 text-[#0f766e]' :
                                d.winRate >= 25 ? 'bg-amber-50 text-[#b45309]' :
                                'bg-rose-50 text-[#be123c]'
                              }`}>
                                {d.winRate}%
                              </span>
                            ) : (
                              <span className="text-slate-300">-</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* ─── チャネル別の実績 ─── */}
            {selectedRepData.byRelationship.length > 0 && (
              <div className="bg-white rounded-lg shadow p-4">
                <h4 className="text-sm font-bold text-slate-700 mb-1">チャネル別実績</h4>
                <p className="text-[10px] text-slate-400 mb-3">新規開拓力 vs 深耕力のバランス確認</p>
                <div className="space-y-3">
                  {selectedRepData.byRelationship.map(d => {
                    const maxTotal = Math.max(...selectedRepData.byRelationship.map(x => x.total), 1)
                    return (
                      <div key={d.name}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-medium text-slate-700">{d.name}</span>
                          <div className="flex items-center gap-3 text-[10px]">
                            <span className="text-slate-500">{d.total}件</span>
                            <span className="text-[#0f766e] font-medium">受注{d.won}</span>
                            {d.winRate !== null && (
                              <span className={`font-bold ${
                                d.winRate >= 50 ? 'text-[#0f766e]' : d.winRate >= 25 ? 'text-[#b45309]' : 'text-[#be123c]'
                              }`}>
                                {d.winRate}%
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="w-full bg-slate-100 rounded-full h-3">
                          <div className="flex h-3 rounded-full overflow-hidden" style={{ width: `${(d.total / maxTotal) * 100}%` }}>
                            {d.won > 0 && (
                              <div
                                className="bg-[#0f766e] h-full"
                                style={{ width: `${(d.won / d.total) * 100}%` }}
                              />
                            )}
                            {d.lost > 0 && (
                              <div
                                className="bg-[#be123c] h-full"
                                style={{ width: `${(d.lost / d.total) * 100}%` }}
                              />
                            )}
                            {(d.total - d.won - d.lost) > 0 && (
                              <div
                                className="bg-[#4a82ae] h-full"
                                style={{ width: `${((d.total - d.won - d.lost) / d.total) * 100}%` }}
                              />
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                  <div className="flex items-center gap-4 text-[10px] text-slate-400 mt-2 pt-2 border-t border-slate-100">
                    <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-[#0f766e]" />受注</span>
                    <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-[#be123c]" />失注</span>
                    <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-[#4a82ae]" />進行中</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            {/* Pipeline */}
            {selectedRepData.pipeline.length > 0 && (
              <div className="bg-white rounded-lg shadow p-4">
                <h4 className="text-sm font-bold text-slate-700 mb-3">パイプライン</h4>
                <div className="space-y-2">
                  {selectedRepData.pipeline.map((d, i) => {
                    const maxCount = Math.max(...selectedRepData.pipeline.map(x => x.count), 1)
                    return (
                      <div key={d.name} className="flex items-center gap-2">
                        <div className="w-28 text-right text-xs text-slate-600 shrink-0">{d.name}</div>
                        <div className="flex-1">
                          <div
                            className="h-7 rounded-r flex items-center px-2 transition-all"
                            style={{
                              width: `${Math.max((d.count / maxCount) * 100, 15)}%`,
                              backgroundColor: FUNNEL_COLORS[i % FUNNEL_COLORS.length],
                            }}
                          >
                            <span className="text-white text-[10px] font-bold whitespace-nowrap">
                              {d.count}件
                            </span>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Monthly trend */}
            {selectedRepData.monthly.length > 0 && (
              <div className="bg-white rounded-lg shadow p-4">
                <h4 className="text-sm font-bold text-slate-700 mb-3">月別推移</h4>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={selectedRepData.monthly}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip />
                    <Bar dataKey="total" name="提案数" fill="#3b82f6" />
                    <Bar dataKey="won" name="受注" fill="#10b981" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          {/* Proposals table */}
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <div className="px-4 py-3 bg-slate-50 border-b">
              <h4 className="text-sm font-bold text-slate-700">{selectedRep} の提案一覧（{selectedRepData.proposals.length}件）</h4>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-medium text-slate-500">日付</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-slate-500">企業名</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-slate-500">業種</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-slate-500">状況</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-slate-500">チャネル</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {selectedRepData.proposals.map(p => (
                    <tr key={p.id} className="hover:bg-slate-50">
                      <td className="px-3 py-2 whitespace-nowrap text-slate-600">{p.initialDate}</td>
                      <td className="px-3 py-2 whitespace-nowrap font-medium text-slate-800">
                        {p.priorityFlag && <span className="text-yellow-500 mr-1">★</span>}
                        {p.companyName}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap text-slate-500 text-xs">{p.industry || '-'}</td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[p.status] || 'bg-gray-100 text-gray-700'}`}>
                          {p.status}
                        </span>
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap text-slate-500 text-xs">{p.relationship || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
