import { useState, useMemo, useEffect } from 'react'
import { INDUSTRIES, PROPOSAL_STATUSES, RELATIONSHIPS, STATUS_COLORS } from '../constants'
import ProposalSidePanel from './ProposalModal'
import CsvImportModal from './CsvImportModal'
import KanbanBoard from './KanbanBoard'
import MultiSelect from './MultiSelect'

function formatYen(amount) {
  if (!amount) return '-'
  if (amount >= 100000000) return `¥${(amount / 100000000).toFixed(1)}億`
  if (amount >= 10000) return `¥${(amount / 10000).toFixed(amount % 10000 === 0 ? 0 : 1)}万`
  return `¥${amount.toLocaleString()}`
}

function exportCsv(proposals) {
  const headers = ['初回提案日時','企業名','営業担当','担当者','業種','従業員規模','優先フラグ','その他','役職','提案状況','見込み金額','受注金額','決裁者アポ日','結論日','関係性','失注理由','失注理由詳細','備考']
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

export default function ProposalList({ proposals, setProposals, apiKey, initialFilter, onFilterConsumed, users = [], onDeleteProposals }) {
  const [showPanel, setShowPanel] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [editItem, setEditItem] = useState(null)
  const [viewMode, setViewMode] = useState('kanban')
  const [selectedIds, setSelectedIds] = useState(new Set())
  const [bulkField, setBulkField] = useState('')  // 一括変更対象フィールド
  const [bulkValue, setBulkValue] = useState('')
  const [searchText, setSearchText] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [filters, setFilters] = useState({
    industry: [],
    status: [],
    relationship: [],
    priority: '',
    month: [],
    salesRep: [],
    employeeScale: [],
    lossReason: [],
    decisionMaker: '',
  })

  // ダッシュボードからのフィルタ適用（ダッシュボードの絞り込み状態を引き継ぐ）
  useEffect(() => {
    if (initialFilter) {
      const df = initialFilter._dashboardFilters || {}

      let statusFilter = []
      if (initialFilter.status === '進行中') {
        statusFilter = ['担当者合意', '決裁者アポ調整中']
      } else if (initialFilter.status === '受注') {
        statusFilter = ['受注', '決裁者合意']
      } else if (initialFilter.status) {
        statusFilter = [initialFilter.status]
      }

      // クリック先のフィルター + ダッシュボードの絞り込み状態をマージ
      const clickIndustry = initialFilter.industry ? [initialFilter.industry] : []
      const clickRelationship = initialFilter.relationship ? [initialFilter.relationship] : []
      const clickEmployeeScale = initialFilter.employeeScale ? [initialFilter.employeeScale] : []

      setFilters({
        industry: clickIndustry.length ? clickIndustry : (df.industry || []),
        status: statusFilter,
        relationship: clickRelationship.length ? clickRelationship : (df.relationship || []),
        employeeScale: clickEmployeeScale.length ? clickEmployeeScale : [],
        lossReason: initialFilter.lossReason ? [initialFilter.lossReason] : [],
        salesRep: df.salesRep || [],
        priority: '',
        month: [],
        decisionMaker: df.decisionMaker || '',
      })
      // ダッシュボードの期間フィルターを引き継ぐ
      setDateFrom(df.dateFrom || '')
      setDateTo(df.dateTo || '')
      setSearchText('')
      onFilterConsumed?.()
    }
  }, [initialFilter])

  const months = useMemo(() => {
    const set = new Set()
    proposals.forEach(p => {
      if (p.initialDate) set.add(p.initialDate.slice(0, 7))
    })
    return [...set].sort().reverse()
  }, [proposals])

  const salesReps = useMemo(() => {
    const set = new Set(users.map(u => u.name))
    proposals.forEach(p => {
      if (p.salesRep) set.add(p.salesRep)
    })
    return [...set].sort()
  }, [proposals, users])

  const filtered = useMemo(() => {
    const q = searchText.trim().toLowerCase()
    return proposals.filter(p => {
      if (filters.industry.length && !filters.industry.includes(p.industry)) return false
      if (filters.status.length && !filters.status.includes(p.status)) return false
      if (filters.relationship.length && !filters.relationship.includes(p.relationship)) return false
      if (filters.priority === 'true' && !p.priorityFlag) return false
      if (filters.priority === 'false' && p.priorityFlag) return false
      if (filters.month.length && (!p.initialDate || !filters.month.some(m => p.initialDate.startsWith(m)))) return false
      if (filters.salesRep.length && !filters.salesRep.includes(p.salesRep)) return false
      if (filters.employeeScale.length && !filters.employeeScale.includes(p.employeeScale)) return false
      if (filters.lossReason.length && !filters.lossReason.includes(p.lossReason)) return false
      if (filters.decisionMaker === 'yes' && !p.decisionMakerDate) return false
      if (filters.decisionMaker === 'no' && p.decisionMakerDate) return false
      if (dateFrom && (!p.initialDate || p.initialDate < dateFrom)) return false
      if (dateTo && (!p.initialDate || p.initialDate > dateTo)) return false
      if (q) {
        const hay = [p.companyName, p.salesRep, p.contactName, p.industry, p.position, p.relationship, p.notes]
          .filter(Boolean).join(' ').toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [proposals, filters, searchText, dateFrom, dateTo])

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

  const toggleSelect = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  const toggleSelectAll = () => {
    if (selectedIds.size === filtered.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(filtered.map(p => p.id)))
    }
  }

  const applyBulkEdit = () => {
    if (!bulkField || !bulkValue || selectedIds.size === 0) return
    setProposals(prev => prev.map(p => {
      if (!selectedIds.has(p.id)) return p
      return { ...p, [bulkField]: bulkValue }
    }))
    setSelectedIds(new Set())
    setBulkField('')
    setBulkValue('')
  }

  const deleteSelected = () => {
    if (selectedIds.size === 0) return
    if (!confirm(`選択した${selectedIds.size}件を削除しますか？この操作は取り消せません。`)) return
    const toDelete = proposals.filter(p => selectedIds.has(p.id))
    onDeleteProposals?.(toDelete)
    setProposals(prev => prev.filter(p => !selectedIds.has(p.id)))
    setSelectedIds(new Set())
  }

  const BULK_FIELDS = [
    { key: 'industry', label: '業種', options: INDUSTRIES },
    { key: 'relationship', label: '関係性', options: RELATIONSHIPS },
    { key: 'status', label: 'ステータス', options: PROPOSAL_STATUSES },
  ]

  const activeBulkField = BULK_FIELDS.find(f => f.key === bulkField)

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
            className="px-4 py-2 bg-[#0f766e] text-white text-sm rounded-md hover:bg-[#0a5c56] transition-colors"
          >
            CSVインポート
          </button>
          {proposals.length > 0 && (
            <button
              onClick={() => exportCsv(filtered)}
              className="px-4 py-2 bg-slate-600 text-white text-sm rounded-md hover:bg-slate-700 transition-colors"
            >
              CSVエクスポート{filtered.length < proposals.length ? `（${filtered.length}件）` : ''}
            </button>
          )}
          <button
            onClick={() => { setEditItem(null); setShowPanel(true) }}
            className="px-4 py-2 bg-[#2d6a9e] text-white text-sm rounded-md hover:bg-[#1a5285] transition-colors"
          >
            + 新規追加
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="mb-3">
        <input
          type="text"
          value={searchText}
          onChange={e => setSearchText(e.target.value)}
          placeholder="企業名・担当者・業種などで検索..."
          className="w-full sm:w-80 border border-slate-300 rounded-md px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#6e9bbf] focus:border-transparent"
        />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-4">
        <MultiSelect selected={filters.industry} onChange={v => setFilter('industry', v)} options={INDUSTRIES} placeholder="全業種" />
        <MultiSelect selected={filters.status} onChange={v => setFilter('status', v)} options={PROPOSAL_STATUSES} placeholder="全状況" />
        <MultiSelect selected={filters.relationship} onChange={v => setFilter('relationship', v)} options={RELATIONSHIPS} placeholder="全関係性" />
        <MultiSelect selected={filters.salesRep} onChange={v => setFilter('salesRep', v)} options={salesReps} placeholder="全営業" />
        <select value={filters.priority} onChange={e => setFilter('priority', e.target.value)}
          className="border border-slate-300 rounded-md px-2 py-1.5 text-sm bg-white">
          <option value="">優先フラグ</option>
          <option value="true">あり</option>
          <option value="false">なし</option>
        </select>
        <MultiSelect selected={filters.month} onChange={v => setFilter('month', v)} options={months} placeholder="全月" />
        <div className="flex items-center gap-1">
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
            className={`border rounded-md px-2 py-1.5 text-sm w-[130px] ${dateFrom ? 'border-blue-400 bg-blue-50' : 'border-slate-300 bg-white'}`} />
          <span className="text-slate-400 text-xs">〜</span>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
            className={`border rounded-md px-2 py-1.5 text-sm w-[130px] ${dateTo ? 'border-blue-400 bg-blue-50' : 'border-slate-300 bg-white'}`} />
        </div>
        <label className="inline-flex items-center gap-1.5 cursor-pointer">
          <input type="checkbox" checked={filters.decisionMaker === 'yes'}
            onChange={e => setFilter('decisionMaker', e.target.checked ? 'yes' : '')}
            className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 h-3.5 w-3.5" />
          <span className={`text-sm ${filters.decisionMaker === 'yes' ? 'text-blue-700 font-medium' : 'text-slate-600'}`}>決裁者アポあり</span>
        </label>
        {(Object.values(filters).some(v => Array.isArray(v) ? v.length > 0 : Boolean(v)) || dateFrom || dateTo) && (
          <button onClick={() => { setFilters({ industry: [], status: [], relationship: [], priority: '', month: [], salesRep: [], employeeScale: [], lossReason: [], decisionMaker: '' }); setDateFrom(''); setDateTo('') }}
            className="text-sm text-[#4a82ae] hover:text-[#2d6a9e] px-2">
            クリア
          </button>
        )}
      </div>

      {/* ダッシュボードからの絞り込み表示 */}
      {(filters.employeeScale.length > 0 || filters.lossReason.length > 0) && (
        <div className="flex items-center gap-2 mb-3">
          {filters.employeeScale.length > 0 && (
            <span className="inline-flex items-center gap-1 bg-cyan-50 text-cyan-700 text-xs font-medium px-2.5 py-1 rounded-full border border-cyan-200">
              従業員規模: {filters.employeeScale.join(', ')}
              <button onClick={() => setFilter('employeeScale', [])} className="ml-0.5 hover:text-cyan-900">✕</button>
            </span>
          )}
          {filters.lossReason.length > 0 && (
            <span className="inline-flex items-center gap-1 bg-red-50 text-red-700 text-xs font-medium px-2.5 py-1 rounded-full border border-red-200">
              失注理由: {filters.lossReason.join(', ')}
              <button onClick={() => setFilter('lossReason', [])} className="ml-0.5 hover:text-red-900">✕</button>
            </span>
          )}
        </div>
      )}

      {/* Stats Bar */}
      <div className="flex items-center gap-4 text-sm text-slate-500 mb-3">
        <span>{filtered.length}件表示 / 全{proposals.length}件</span>
        {filteredStats.expectedTotal > 0 && (
          <span className="text-[#4a82ae]">見込み: {formatYen(filteredStats.expectedTotal)}</span>
        )}
        {filteredStats.actualTotal > 0 && (
          <span className="text-green-600">受注: {formatYen(filteredStats.actualTotal)}</span>
        )}
      </div>

      {/* 一括編集バー */}
      {selectedIds.size > 0 && viewMode === 'table' && (
        <div className="flex items-center gap-3 bg-blue-50 border border-blue-200 rounded-lg px-4 py-2.5 mb-3">
          <span className="text-sm font-medium text-blue-800">{selectedIds.size}件選択中</span>
          <span className="text-slate-400">→</span>
          <select value={bulkField} onChange={e => { setBulkField(e.target.value); setBulkValue('') }}
            className="border border-slate-300 rounded-md px-2 py-1 text-sm bg-white">
            <option value="">変更項目</option>
            {BULK_FIELDS.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}
          </select>
          {activeBulkField && (
            <select value={bulkValue} onChange={e => setBulkValue(e.target.value)}
              className="border border-slate-300 rounded-md px-2 py-1 text-sm bg-white">
              <option value="">選択...</option>
              {activeBulkField.options.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          )}
          <button onClick={applyBulkEdit} disabled={!bulkField || !bulkValue}
            className={`px-3 py-1 text-sm font-medium rounded-md transition-colors ${bulkField && bulkValue ? 'bg-[#1a5285] text-white hover:bg-[#2d6a9e]' : 'bg-slate-200 text-slate-400 cursor-not-allowed'}`}>
            適用
          </button>
          <div className="w-px h-5 bg-blue-200 mx-1" />
          <button onClick={deleteSelected}
            className="px-3 py-1 text-sm font-medium rounded-md bg-red-500 text-white hover:bg-red-600 transition-colors">
            削除
          </button>
          <button onClick={() => { setSelectedIds(new Set()); setBulkField(''); setBulkValue('') }}
            className="text-sm text-slate-500 hover:text-slate-700 ml-auto">
            選択解除
          </button>
        </div>
      )}

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
                  <th className="px-2 py-2 text-center w-10">
                    <input type="checkbox" checked={filtered.length > 0 && selectedIds.size === filtered.length}
                      onChange={toggleSelectAll}
                      className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 h-3.5 w-3.5 cursor-pointer" />
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-slate-500 uppercase whitespace-nowrap">日付</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-slate-500 uppercase whitespace-nowrap">企業名</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-slate-500 uppercase whitespace-nowrap">業種</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-slate-500 uppercase whitespace-nowrap">営業</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-slate-500 uppercase whitespace-nowrap">担当者</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-slate-500 uppercase whitespace-nowrap">役職</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-slate-500 uppercase whitespace-nowrap">状況</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-slate-500 uppercase whitespace-nowrap">見込み</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-slate-500 uppercase whitespace-nowrap">受注額</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-slate-500 uppercase whitespace-nowrap">関係性</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-slate-500 uppercase whitespace-nowrap">決裁者アポ</th>
                  <th className="px-3 py-2 text-center text-xs font-medium text-slate-500 uppercase whitespace-nowrap">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={13} className="px-3 py-8 text-center text-slate-400">
                      データがありません
                    </td>
                  </tr>
                ) : filtered.map(p => (
                  <tr key={p.id}
                    onClick={() => handleCardClick(p)}
                    className={`cursor-pointer hover:bg-slate-50 transition-colors ${p.priorityFlag ? 'bg-yellow-50' : ''} ${selectedIds.has(p.id) ? 'bg-blue-50' : ''}`}>
                    <td className="px-2 py-2 text-center" onClick={e => e.stopPropagation()}>
                      <input type="checkbox" checked={selectedIds.has(p.id)}
                        onChange={() => toggleSelect(p.id)}
                        className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 h-3.5 w-3.5 cursor-pointer" />
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-slate-600">{p.initialDate}</td>
                    <td className="px-3 py-2 whitespace-nowrap font-medium text-slate-800">
                      {p.priorityFlag && <span className="text-yellow-500 mr-1">&#9733;</span>}
                      {p.companyName}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-slate-500 text-xs">{p.industry || '-'}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-slate-600">{p.salesRep}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-slate-600">{p.contactName}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-slate-600">{p.position}</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[p.status] || 'bg-slate-100 text-slate-600'}`}>
                        {p.status}
                      </span>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-right text-[#4a82ae] text-xs">
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
          salesReps={salesReps}
        />
      )}

      {showImport && (
        <CsvImportModal
          onImport={handleCsvImport}
          onClose={() => setShowImport(false)}
          existingProposals={proposals}
        />
      )}
    </div>
  )
}
