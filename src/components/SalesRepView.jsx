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

// 最終ステータス変更日を取得
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

export default function SalesRepView({ proposals, users = [] }) {
  const [selectedRep, setSelectedRep] = useState(null)

  const reps = useMemo(() => {
    const map = {}
    const wonStatuses = ['受注', '決裁者合意']
    const inProgressStatuses = ['担当者合意', '決裁者アポ調整中']

    proposals.forEach(p => {
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
  }, [proposals])

  const selectedRepData = useMemo(() => {
    if (!selectedRep) return null
    const repProposals = proposals.filter(p => (p.salesRep || '(未設定)') === selectedRep)

    // Pipeline data
    const pipeline = PROPOSAL_STATUSES.map(status => {
      const items = repProposals.filter(p => p.status === status)
      return {
        name: status,
        count: items.length,
      }
    }).filter(d => d.count > 0)

    // Monthly data
    const monthMap = {}
    repProposals.forEach(p => {
      if (!p.initialDate) return
      const month = p.initialDate.slice(0, 7)
      if (!monthMap[month]) monthMap[month] = { month, total: 0, won: 0 }
      monthMap[month].total++
      if (['受注', '決裁者合意'].includes(p.status)) monthMap[month].won++
    })
    const monthly = Object.values(monthMap).sort((a, b) => a.month.localeCompare(b.month))

    // ─── 平均リードタイム ───
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
        wonAvg: avg(wonDays),
        wonCount: wonDays.length,
        lostAvg: avg(lostDays),
        lostCount: lostDays.length,
        inProgressAvg: avg(inProgressDays),
        inProgressCount: inProgressDays.length,
      }
    })()

    // ─── 3. 業種別の勝ちパターン ───
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

    // ─── 4. 関係性別の実績 ───
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
  }, [selectedRep, proposals])

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
      <h2 className="text-xl font-bold text-slate-800 mb-6">営業担当別実績</h2>

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
          </h3>

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
            {/* ─── 3. 業種別の勝ちパターン ─── */}
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

            {/* ─── 4. 関係性別の実績 ─── */}
            {selectedRepData.byRelationship.length > 0 && (
              <div className="bg-white rounded-lg shadow p-4">
                <h4 className="text-sm font-bold text-slate-700 mb-1">関係性別実績</h4>
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
            {/* Pipeline (既存) */}
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

            {/* Monthly trend (既存) */}
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

          {/* Proposals table (既存) */}
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
                    <th className="px-3 py-2 text-left text-xs font-medium text-slate-500">関係性</th>
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
