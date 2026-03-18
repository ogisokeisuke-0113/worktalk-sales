import { useState, useMemo } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Cell, PieChart, Pie, Legend,
} from 'recharts'
import { PROPOSAL_STATUSES, STATUS_COLORS, FUNNEL_COLORS } from '../constants'

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#f97316']

function formatYen(amount) {
  if (!amount) return '¥0'
  if (amount >= 100000000) return `¥${(amount / 100000000).toFixed(1)}億`
  if (amount >= 10000) return `¥${(amount / 10000).toFixed(amount % 10000 === 0 ? 0 : 1)}万`
  return `¥${amount.toLocaleString()}`
}

export default function SalesRepView({ proposals }) {
  const [selectedRep, setSelectedRep] = useState(null)

  const reps = useMemo(() => {
    const map = {}
    const excluded = ['アポ獲得不可', '未提案', 'アポ調整中']
    const wonStatuses = ['受注', '決済者合意']
    const inProgressStatuses = ['アポ確定', '担当者合意', '決済者アポ調整中']

    proposals.forEach(p => {
      const name = p.salesRep || '(未設定)'
      if (!map[name]) {
        map[name] = {
          name, total: 0, won: 0, lost: 0, inProgress: 0,
          denominator: 0, expectedTotal: 0, actualTotal: 0,
          pipelineAmount: 0,
        }
      }
      const r = map[name]
      r.total++
      if (!excluded.includes(p.status)) r.denominator++
      if (wonStatuses.includes(p.status)) {
        r.won++
        r.actualTotal += (p.actualAmount || 0)
      }
      if (p.status === '失注') r.lost++
      if (inProgressStatuses.includes(p.status)) {
        r.inProgress++
        r.pipelineAmount += (p.expectedAmount || 0)
      }
      r.expectedTotal += (p.expectedAmount || 0)
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
        amount: items.reduce((s, p) => s + (p.expectedAmount || 0), 0),
      }
    }).filter(d => d.count > 0)

    // Monthly data
    const monthMap = {}
    repProposals.forEach(p => {
      if (!p.initialDate) return
      const month = p.initialDate.slice(0, 7)
      if (!monthMap[month]) monthMap[month] = { month, total: 0, won: 0, amount: 0 }
      monthMap[month].total++
      if (['受注', '決済者合意'].includes(p.status)) {
        monthMap[month].won++
        monthMap[month].amount += (p.actualAmount || 0)
      }
    })
    const monthly = Object.values(monthMap).sort((a, b) => a.month.localeCompare(b.month))

    return { proposals: repProposals, pipeline, monthly }
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
                <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase">受注</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase">受注率</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase">進行中</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase">失注</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase">見込み合計</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase">受注金額</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase">パイプライン</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {reps.map(rep => (
                <tr
                  key={rep.name}
                  onClick={() => setSelectedRep(selectedRep === rep.name ? null : rep.name)}
                  className={`cursor-pointer transition-colors ${
                    selectedRep === rep.name ? 'bg-blue-50' : 'hover:bg-slate-50'
                  }`}
                >
                  <td className="px-4 py-3 font-medium text-slate-800">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white text-xs font-bold">
                        {rep.name.slice(0, 1)}
                      </div>
                      {rep.name}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right font-medium">{rep.total}</td>
                  <td className="px-4 py-3 text-right text-green-600 font-medium">{rep.won}</td>
                  <td className="px-4 py-3 text-right">
                    <span className={`inline-block px-2 py-0.5 rounded text-xs font-bold ${
                      rep.winRate >= 20 ? 'bg-green-100 text-green-700' :
                      rep.winRate >= 10 ? 'bg-yellow-100 text-yellow-700' :
                      'bg-red-100 text-red-700'
                    }`}>
                      {rep.winRate}%
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-blue-600 font-medium">{rep.inProgress}</td>
                  <td className="px-4 py-3 text-right text-red-500">{rep.lost}</td>
                  <td className="px-4 py-3 text-right text-slate-600">{formatYen(rep.expectedTotal)}</td>
                  <td className="px-4 py-3 text-right font-bold text-green-700">{formatYen(rep.actualTotal)}</td>
                  <td className="px-4 py-3 text-right text-blue-600">{formatYen(rep.pipelineAmount)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-slate-50 font-bold text-sm">
              <tr>
                <td className="px-4 py-3 text-slate-700">合計</td>
                <td className="px-4 py-3 text-right">{reps.reduce((s, r) => s + r.total, 0)}</td>
                <td className="px-4 py-3 text-right text-green-600">{reps.reduce((s, r) => s + r.won, 0)}</td>
                <td className="px-4 py-3 text-right">-</td>
                <td className="px-4 py-3 text-right text-blue-600">{reps.reduce((s, r) => s + r.inProgress, 0)}</td>
                <td className="px-4 py-3 text-right text-red-500">{reps.reduce((s, r) => s + r.lost, 0)}</td>
                <td className="px-4 py-3 text-right">{formatYen(reps.reduce((s, r) => s + r.expectedTotal, 0))}</td>
                <td className="px-4 py-3 text-right text-green-700">{formatYen(reps.reduce((s, r) => s + r.actualTotal, 0))}</td>
                <td className="px-4 py-3 text-right text-blue-600">{formatYen(reps.reduce((s, r) => s + r.pipelineAmount, 0))}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Rep comparison chart */}
      {reps.length > 1 && (
        <div className="bg-white rounded-lg shadow p-4 mb-6">
          <h3 className="text-sm font-bold text-slate-700 mb-3">営業担当別 受注率比較</h3>
          <ResponsiveContainer width="100%" height={Math.max(200, reps.length * 40)}>
            <BarChart data={reps} layout="vertical" margin={{ left: 60 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" domain={[0, 100]} unit="%" tick={{ fontSize: 12 }} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={80} />
              <Tooltip formatter={(v) => `${v}%`} />
              <Bar dataKey="winRate" name="受注率" fill="#3b82f6">
                {reps.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Selected Rep Detail */}
      {selectedRep && selectedRepData && (
        <div className="animate-fade-in">
          <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white text-xs font-bold">
              {selectedRep.slice(0, 1)}
            </div>
            {selectedRep} の詳細
          </h3>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            {(() => {
              const rep = reps.find(r => r.name === selectedRep)
              if (!rep) return null
              return (
                <>
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                    <p className="text-xs text-blue-600 font-medium">提案数</p>
                    <p className="text-2xl font-bold text-blue-700">{rep.total}</p>
                  </div>
                  <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                    <p className="text-xs text-green-600 font-medium">受注率</p>
                    <p className="text-2xl font-bold text-green-700">{rep.winRate}%</p>
                  </div>
                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                    <p className="text-xs text-yellow-600 font-medium">見込み合計</p>
                    <p className="text-xl font-bold text-yellow-700">{formatYen(rep.expectedTotal)}</p>
                  </div>
                  <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                    <p className="text-xs text-green-600 font-medium">受注金額</p>
                    <p className="text-xl font-bold text-green-700">{formatYen(rep.actualTotal)}</p>
                  </div>
                </>
              )
            })()}
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
                              {d.count}件 {d.amount > 0 ? formatYen(d.amount) : ''}
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
                    <th className="px-3 py-2 text-left text-xs font-medium text-slate-500">状況</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-slate-500">見込み</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-slate-500">受注額</th>
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
                      <td className="px-3 py-2 whitespace-nowrap">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[p.status] || 'bg-gray-100 text-gray-700'}`}>
                          {p.status}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right whitespace-nowrap text-blue-600">
                        {p.expectedAmount > 0 ? formatYen(p.expectedAmount) : '-'}
                      </td>
                      <td className="px-3 py-2 text-right whitespace-nowrap font-medium text-green-700">
                        {p.actualAmount > 0 ? formatYen(p.actualAmount) : '-'}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap text-slate-600">{p.relationship}</td>
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
