import { useState, useMemo } from 'react'
import { INDUSTRIES, PROPOSAL_STATUSES, RELATIONSHIPS, STATUS_COLORS } from '../constants'
import ProposalSidePanel from './ProposalModal'
import CsvImportModal from './CsvImportModal'
import KanbanBoard from './KanbanBoard'

function formatYen(amount) {
  if (!amount) return '-'
  if (amount >= 100000000) return `¥${(amount / 100000000).toFixed(1)}億`
  if (amount >= 10000) return `¥${(amount / 10000).toFixed(amount % 10000 === 0 ? 0 : 1)}万`
  return `¥${amount.toLocaleString()}`
}

function exportCsv(proposals) {
  const headers = ['初回提案日時','企業名','営業担当','担当者','業種','従業員規模','優先フラグ','その他','役職','提案状況','見込み金額','受注金額','決済者アポ日','結論日','関係性','失注理由','失注理由詳細','備考']
  const rows = proposals.map(p => [
    p.initialDate, p.companyName, p.salesRep, p.contactName, p.industry, p.employeeScale,
    p.priorityFlag ? '○' : '', p.other, p.position, p.status,
    p.expectedAmount || '', p.actualAmount || '',
    p.decisionMakerDate, p.conclusionDate, p.relationship, p.lossReason, p.lossReasonDetail, p.notes,
  ].map(v => `"${(v ?? '').toString().replace(/"/g, '""')}"`).join(','))

  const bom = '\uFEFF'
  const csv = bom + [headers.join(','), ...rows].join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `提案リスト_${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

export default function ProposalList({ proposals, setProposals, apiKey }) {
  const [showPanel, setShowPanel] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [editItem, setEditItem] = useState(null)
  const [viewMode, setViewMode] = useState('table')
  const [filters, setFilters] = useState({
    industry: '',
    status: '',
    relationship: '',
    priority: '',
    month: '',
    salesRep: '',
  })

  const months = useMemo(() => {
    const set = new Set()
    proposals.forEach(p => {
      if (p.initialDate) set.add(p.initialDate.slice(0, 7))
    })
    return [...set].sort().reverse()
  }, [proposals])

  const salesReps = useMemo(() => {
    const set = new Set()
    proposals.forEach(p => {
      if (p.salesRep) set.add(p.salesRep)
    })
    return [...set].sort()
  }, [proposals])

  const filtered = useMemo(() => {
    return proposals.filter(p => {
      if (filters.industry && p.industry !== filters.industry) return false
      if (filters.status && p.status !== filters.status) return false
      if (filters.relationship && p.relationship !== filters.relationship) return false
      if (filters.priority === 'true' && !p.priorityFlag) return false
      if (filters.priority === 'false' && p.priorityFlag) return false
      if (filters.month && (!p.initialDate || !p.initialDate.startsWith(filters.month))) return false
      if (filters.salesRep && p.salesRep !== filters.salesRep) return false
      return true
    })
  }, [proposals, filters])

  const filteredStats = useMemo(() => {
    const expectedTotal = filtered.reduce((s, p) => s + (p.expectedAmount || 0), 0)
    const actualTotal = filtered.reduce((s, p) => s + (p.actualAmount || 0), 0)
    return { expectedTotal, actualTotal }
  }, [filtered])

  const handleSave = (item) => {
    setProposals(prev => {
      const idx = prev.findIndex(p => p.id === item.id)
      if (idx >= 0) {
        const oldItem = prev[idx]
        const log = [...(item.activityLog || [])]
        if (oldItem.status !== item.status) {
          log.push({
            date: new Date().toISOString(),
            type: 'status',
            from: oldItem.status,
            to: item.status,
            note: `${oldItem.status} → ${item.status}`,
          })
        }
        const updated = { ...item, activityLog: log }
        const next = [...prev]
        next[idx] = updated
        return next
      }
      const log = [{
        date: new Date().toISOString(),
        type: 'create',
        note: '提案を作成',
      }]
      return [...prev, { ...item, activityLog: log }]
    })
    setShowPanel(false)
    setEditItem(null)
  }

  const handleStatusChange = (id, newStatus) => {
    setProposals(prev => {
      return prev.map(p => {
        if (p.id !== id) return p
        const log = [...(p.activityLog || [])]
        log.push({
          date: new Date().toISOString(),
          type: 'status',
          from: p.status,
          to: newStatus,
          note: `${p.status} → ${newStatus}`,
        })
        return { ...p, status: newStatus, activityLog: log }
      })
    })
  }

  const handleDelete = (id) => {
    if (confirm('この提案を削除しますか？')) {
      setProposals(prev => prev.filter(p => p.id !== id))
    }
  }

  const handleCardClick = (item) => {
    setEditItem(item)
    setShowPanel(true)
  }

  const setFilter = (key, value) => setFilters(prev => ({ ...prev, [key]: value }))

  const handleCsvImport = (data, mode) => {
    if (mode === 'replace') {
      setProposals(data)
    } else {
      setProposals(prev => [...prev, ...data])
    }
  }

  return (
    <div>
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h2 className="text-xl font-bold text-slate-800">提案リスト</h2>
        <div className="flex items-center gap-2">
          {/* View Toggle */}
          <div className="flex bg-slate-100 rounded-lg p-0.5">
            <button
              onClick={() => setViewMode('table')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                viewMode === 'table' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              テーブル
            </button>
            <button
              onClick={() => setViewMode('kanban')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                viewMode === 'kanban' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              カンバン
            </button>
          </div>

          <div className="w-px h-6 bg-slate-200" />

          <button
            onClick={() => setShowImport(true)}
            className="px-4 py-2 bg-green-600 text-white text-sm rounded-md hover:bg-green-700 transition-colors"
          >
            CSVインポート
          </button>
          {proposals.length > 0 && (
            <button
              onClick={() => exportCsv(proposals)}
              className="px-4 py-2 bg-slate-600 text-white text-sm rounded-md hover:bg-slate-700 transition-colors"
            >
              CSVエクスポート
            </button>
          )}
          <button
            onClick={() => { setEditItem(null); setShowPanel(true) }}
            className="px-4 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 transition-colors"
          >
            + 新規追加
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-4">
        <select value={filters.industry} onChange={e => setFilter('industry', e.target.value)}
          className="border border-slate-300 rounded-md px-2 py-1.5 text-sm bg-white">
          <option value="">全業種</option>
          {INDUSTRIES.map(i => <option key={i} value={i}>{i}</option>)}
        </select>
        <select value={filters.status} onChange={e => setFilter('status', e.target.value)}
          className="border border-slate-300 rounded-md px-2 py-1.5 text-sm bg-white">
          <option value="">全状況</option>
          {PROPOSAL_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={filters.relationship} onChange={e => setFilter('relationship', e.target.value)}
          className="border border-slate-300 rounded-md px-2 py-1.5 text-sm bg-white">
          <option value="">全関係性</option>
          {RELATIONSHIPS.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
        <select value={filters.salesRep} onChange={e => setFilter('salesRep', e.target.value)}
          className="border border-slate-300 rounded-md px-2 py-1.5 text-sm bg-white">
          <option value="">全営業</option>
          {salesReps.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
        <select value={filters.priority} onChange={e => setFilter('priority', e.target.value)}
          className="border border-slate-300 rounded-md px-2 py-1.5 text-sm bg-white">
          <option value="">優先フラグ</option>
          <option value="true">あり</option>
          <option value="false">なし</option>
        </select>
        <select value={filters.month} onChange={e => setFilter('month', e.target.value)}
          className="border border-slate-300 rounded-md px-2 py-1.5 text-sm bg-white">
          <option value="">全月</option>
          {months.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
        {Object.values(filters).some(Boolean) && (
          <button onClick={() => setFilters({ industry: '', status: '', relationship: '', priority: '', month: '', salesRep: '' })}
            className="text-sm text-blue-600 hover:text-blue-800 px-2">
            クリア
          </button>
        )}
      </div>

      {/* Stats Bar */}
      <div className="flex items-center gap-4 text-sm text-slate-500 mb-3">
        <span>{filtered.length}件表示 / 全{proposals.length}件</span>
        {filteredStats.expectedTotal > 0 && (
          <span className="text-blue-600">見込み: {formatYen(filteredStats.expectedTotal)}</span>
        )}
        {filteredStats.actualTotal > 0 && (
          <span className="text-green-600">受注: {formatYen(filteredStats.actualTotal)}</span>
        )}
      </div>

      {/* View */}
      {viewMode === 'kanban' ? (
        <KanbanBoard
          proposals={filtered}
          onStatusChange={handleStatusChange}
          onCardClick={handleCardClick}
        />
      ) : (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 sticky top-0">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-medium text-slate-500 uppercase whitespace-nowrap">日付</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-slate-500 uppercase whitespace-nowrap">企業名</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-slate-500 uppercase whitespace-nowrap">営業</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-slate-500 uppercase whitespace-nowrap">担当者</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-slate-500 uppercase whitespace-nowrap">役職</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-slate-500 uppercase whitespace-nowrap">状況</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-slate-500 uppercase whitespace-nowrap">見込み</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-slate-500 uppercase whitespace-nowrap">受注額</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-slate-500 uppercase whitespace-nowrap">関係性</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-slate-500 uppercase whitespace-nowrap">決済者アポ</th>
                  <th className="px-3 py-2 text-center text-xs font-medium text-slate-500 uppercase whitespace-nowrap">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="px-3 py-8 text-center text-slate-400">
                      データがありません
                    </td>
                  </tr>
                ) : filtered.map(p => (
                  <tr key={p.id}
                    onClick={() => handleCardClick(p)}
                    className={`cursor-pointer hover:bg-slate-50 transition-colors ${p.priorityFlag ? 'bg-yellow-50' : ''}`}>
                    <td className="px-3 py-2 whitespace-nowrap text-slate-600">{p.initialDate}</td>
                    <td className="px-3 py-2 whitespace-nowrap font-medium text-slate-800">
                      {p.priorityFlag && <span className="text-yellow-500 mr-1">&#9733;</span>}
                      {p.companyName}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-slate-600">{p.salesRep}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-slate-600">{p.contactName}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-slate-600">{p.position}</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[p.status] || 'bg-gray-100 text-gray-700'}`}>
                        {p.status}
                      </span>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-right text-blue-600 text-xs">
                      {p.expectedAmount > 0 ? formatYen(p.expectedAmount) : '-'}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-right text-green-700 font-medium text-xs">
                      {p.actualAmount > 0 ? formatYen(p.actualAmount) : '-'}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-slate-600">{p.relationship}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-slate-600">{p.decisionMakerDate}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-center">
                      <button
                        onClick={e => { e.stopPropagation(); handleDelete(p.id) }}
                        className="text-red-400 hover:text-red-600 text-xs"
                      >
                        削除
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showPanel && (
        <ProposalSidePanel
          proposal={editItem}
          onSave={handleSave}
          onClose={() => { setShowPanel(false); setEditItem(null) }}
          apiKey={apiKey}
        />
      )}

      {showImport && (
        <CsvImportModal
          onImport={handleCsvImport}
          onClose={() => setShowImport(false)}
        />
      )}
    </div>
  )
}
