import { useState, useMemo } from 'react'
import { TELEAPO_STATUSES, TELEAPO_STATUS_COLORS, INDUSTRIES, EMPLOYEE_SCALES, CALL_RESULTS } from '../constants'
import TeleapoCsvImport from './TeleapoCsvImport'
import MultiSelect from './MultiSelect'

const INPUT = 'w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#6e9bbf]'

/* ───────────────────── 企業編集モーダル ───────────────────── */
function CompanyModal({ item, onSave, onClose, salesReps }) {
  const isEdit = !!item
  const [form, setForm] = useState(item || {
    id: crypto.randomUUID(),
    companyName: '',
    phone: '',
    contactName: '',
    industry: '',
    employeeScale: '',
    salesRep: '',
    status: '未架電',
    isKept: false,
    memo: '',
    callHistory: [],
  })

  const set = (key, value) => setForm(prev => ({ ...prev, [key]: value }))

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!form.companyName.trim()) return
    onSave(form)
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b sticky top-0 bg-white z-10">
          <h3 className="text-lg font-bold text-slate-800">{isEdit ? '企業情報を編集' : '新規追加'}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-2xl leading-none">&times;</button>
        </div>
        <form onSubmit={handleSubmit} className="p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="block text-xs font-medium text-slate-600 mb-1">企業名 *</label>
              <input type="text" value={form.companyName} onChange={e => set('companyName', e.target.value)} required className={INPUT} />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">電話番号</label>
              <input type="tel" value={form.phone} onChange={e => set('phone', e.target.value)} className={INPUT} />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">担当者名</label>
              <input type="text" value={form.contactName} onChange={e => set('contactName', e.target.value)} className={INPUT} />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">業種</label>
              <select value={form.industry} onChange={e => set('industry', e.target.value)} className={INPUT}>
                <option value="">未設定</option>
                {INDUSTRIES.map(i => <option key={i} value={i}>{i}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">従業員数</label>
              <select value={form.employeeScale} onChange={e => set('employeeScale', e.target.value)} className={INPUT}>
                <option value="">未設定</option>
                {EMPLOYEE_SCALES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">担当営業</label>
              <select value={form.salesRep} onChange={e => set('salesRep', e.target.value)} className={INPUT}>
                <option value="">未設定</option>
                {salesReps.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">ステータス</label>
              <select value={form.status} onChange={e => set('status', e.target.value)} className={INPUT}>
                {TELEAPO_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">メモ</label>
            <textarea value={form.memo} onChange={e => set('memo', e.target.value)} rows={2} className={INPUT} />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="px-4 py-2 text-sm text-slate-600 bg-slate-100 rounded-md hover:bg-slate-200">キャンセル</button>
            <button type="submit"
              className="px-4 py-2 text-sm text-white bg-[#2d6a9e] rounded-md hover:bg-[#1a5285]">{isEdit ? '更新' : '追加'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}

/* ───────────────────── 架電記録モーダル ───────────────────── */
function CallRecordModal({ onSave, onClose }) {
  const [form, setForm] = useState({
    date: new Date().toISOString().slice(0, 16),
    result: '',
    note: '',
  })
  const set = (key, value) => setForm(prev => ({ ...prev, [key]: value }))

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-xl w-full max-w-sm" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b">
          <h3 className="text-base font-bold text-slate-800">架電結果を記録</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-2xl leading-none">&times;</button>
        </div>
        <div className="p-4 space-y-3">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">日時</label>
            <input type="datetime-local" value={form.date} onChange={e => set('date', e.target.value)} className={INPUT} />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">結果</label>
            <select value={form.result} onChange={e => set('result', e.target.value)} className={INPUT}>
              <option value="">選択してください</option>
              {CALL_RESULTS.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">メモ</label>
            <textarea value={form.note} onChange={e => set('note', e.target.value)} rows={2} className={INPUT} placeholder="通話内容のメモ..." />
          </div>
          <div className="flex justify-end gap-3 pt-1">
            <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 bg-slate-100 rounded-md hover:bg-slate-200">キャンセル</button>
            <button onClick={() => { if (form.result) onSave(form) }}
              disabled={!form.result}
              className="px-4 py-2 text-sm text-white bg-[#2d6a9e] rounded-md hover:bg-[#1a5285] disabled:opacity-40">記録</button>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ───────────────────── 詳細パネル ───────────────────── */
function DetailPanel({ item, onClose, onUpdate, onEdit, onPromote, onDelete, currentUser }) {
  const [showCallModal, setShowCallModal] = useState(false)
  const callCount = (item.callHistory || []).length

  const addCallRecord = (record) => {
    const updated = {
      ...item,
      callHistory: [...(item.callHistory || []), { ...record, id: crypto.randomUUID() }],
      status: record.result === 'アポ獲得' ? 'アポ確定' : (item.status === '未架電' ? '架電済' : item.status),
    }
    onUpdate(updated)
    setShowCallModal(false)
  }

  const toggleKeep = () => {
    const newKept = !item.isKept
    const update = { ...item, isKept: newKept }
    // キープ時に担当者が未確定なら自動でログインユーザーをセット
    if (newKept && (!item.salesRep || item.salesRep === '未確定') && currentUser) {
      update.salesRep = currentUser.name
    }
    onUpdate(update)
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex justify-end" onClick={onClose}>
      <div className="bg-white w-full max-w-lg h-full overflow-y-auto shadow-2xl animate-slide-right" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="sticky top-0 bg-white border-b px-5 py-4 z-10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h3 className="text-lg font-bold text-slate-800">{item.companyName}</h3>
              <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${TELEAPO_STATUS_COLORS[item.status] || 'bg-slate-100 text-slate-600'}`}>
                {item.status}
              </span>
            </div>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-2xl">&times;</button>
          </div>
          <div className="flex gap-2 mt-3 flex-wrap">
            <button onClick={toggleKeep}
              className={`px-3 py-1.5 text-xs font-medium rounded-md border transition-colors ${
                item.isKept
                  ? 'bg-amber-50 border-amber-300 text-[#b45309]'
                  : 'bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100'
              }`}>
              {item.isKept ? 'Keep中' : 'Keep'}
            </button>
            <button onClick={() => setShowCallModal(true)}
              className="px-3 py-1.5 text-xs font-medium rounded-md bg-[#2d6a9e] text-white hover:bg-[#1a5285]">
              架電を記録
            </button>
            <button onClick={() => onEdit(item)}
              className="px-3 py-1.5 text-xs font-medium rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50">
              編集
            </button>
            <button onClick={() => onPromote(item)}
              className="px-3 py-1.5 text-xs font-medium rounded-md bg-[#0f766e] text-white hover:bg-[#0a5c56]">
              提案リストへ昇格
            </button>
            <button onClick={() => { if (confirm('削除しますか？')) onDelete(item.id) }}
              className="px-3 py-1.5 text-xs font-medium rounded-md text-[#be123c] border border-rose-200 hover:bg-rose-50 ml-auto">
              削除
            </button>
          </div>
        </div>

        {/* Info */}
        <div className="px-5 py-4 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            {[
              ['電話番号', item.phone],
              ['担当者名', item.contactName],
              ['業種', item.industry],
              ['従業員数', item.employeeScale],
              ['担当営業', item.salesRep],
              ['架電回数', `${callCount}回`],
            ].map(([label, val]) => (
              <div key={label} className="bg-slate-50 rounded-lg px-3 py-2">
                <p className="text-[10px] text-slate-400 font-medium">{label}</p>
                <p className="text-sm font-medium text-slate-700">{val || '-'}</p>
              </div>
            ))}
          </div>

          {item.memo && (
            <div className="bg-slate-50 rounded-lg px-3 py-2">
              <p className="text-[10px] text-slate-400 font-medium mb-1">メモ</p>
              <p className="text-sm text-slate-700 whitespace-pre-wrap">{item.memo}</p>
            </div>
          )}

          {/* Call History */}
          <div>
            <h4 className="text-sm font-bold text-slate-700 mb-2">架電履歴 ({callCount}件)</h4>
            {callCount === 0 ? (
              <p className="text-sm text-slate-400 py-4 text-center">まだ架電記録がありません</p>
            ) : (
              <div className="space-y-2">
                {[...(item.callHistory || [])].reverse().map((c, i) => (
                  <div key={c.id || i} className="border border-slate-200 rounded-lg px-3 py-2">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-medium text-slate-500">
                        {c.date ? new Date(c.date).toLocaleString('ja-JP') : ''}
                      </span>
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                        c.result === 'アポ獲得' ? 'bg-teal-50 text-[#0f766e]' :
                        c.result === '断り' ? 'bg-rose-50 text-[#be123c]' :
                        'bg-sky-50 text-[#4a82ae]'
                      }`}>{c.result}</span>
                    </div>
                    {c.note && <p className="text-xs text-slate-600">{c.note}</p>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {showCallModal && (
        <CallRecordModal onSave={addCallRecord} onClose={() => setShowCallModal(false)} />
      )}
    </div>
  )
}

/* ───────────────────── 検索画面 ───────────────────── */
function SearchPage({ filters, setFilters, searchText, setSearchText, onSearch, stats, salesReps, onAddNew, onCsvImport }) {
  const setFilter = (key, value) => setFilters(prev => ({ ...prev, [key]: value }))

  const activeCount = [
    filters.status.length > 0,
    filters.industry.length > 0,
    filters.salesRep.length > 0,
    filters.callCount,
    filters.employeeScale.length > 0,
    filters.kept,
    filters.callDateFrom,
    filters.callDateTo,
    searchText.trim()
  ].filter(Boolean).length

  const handleClear = () => {
    setFilters({ status: [], industry: [], salesRep: [], callCount: '', employeeScale: [], kept: '', callDateFrom: '', callDateTo: '' })
    setSearchText('')
  }

  return (
    <div>
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h2 className="text-xl font-bold text-slate-800">テレアポリスト</h2>
          <div className="flex gap-4 mt-1 text-xs text-slate-500">
            <span>全{stats.total}件</span>
            <span>架電済 {stats.called}件</span>
            <span>Keep {stats.kept}件</span>
            <span className="text-[#0f766e] font-medium">アポ確定 {stats.appo}件</span>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={onCsvImport}
            className="px-4 py-2 text-sm text-[#2d6a9e] bg-white border border-[#2d6a9e] rounded-md hover:bg-sky-50 transition-colors">
            CSVインポート
          </button>
          <button onClick={onAddNew}
            className="px-4 py-2 bg-[#2d6a9e] text-white text-sm rounded-md hover:bg-[#1a5285]">+ 新規追加</button>
        </div>
      </div>

      {/* 検索カード */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        <h3 className="text-base font-bold text-slate-700 mb-5">絞り込み検索</h3>

        {/* キーワード検索 */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-slate-600 mb-2">キーワード</label>
          <input
            type="text"
            value={searchText}
            onChange={e => setSearchText(e.target.value)}
            placeholder="企業名・担当者名・電話番号・メモなど..."
            className="w-full border border-slate-300 rounded-lg px-4 py-3 text-base bg-white focus:outline-none focus:ring-2 focus:ring-[#6e9bbf] focus:border-transparent placeholder:text-slate-400"
          />
        </div>

        {/* 架電日時 */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-slate-600 mb-1.5">架電日時</label>
          <div className="flex items-center gap-2">
            <input type="date" value={filters.callDateFrom || ''} onChange={e => setFilter('callDateFrom', e.target.value)}
              className="flex-1 border border-slate-300 rounded-lg px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#6e9bbf]" />
            <span className="text-sm text-slate-400">〜</span>
            <input type="date" value={filters.callDateTo || ''} onChange={e => setFilter('callDateTo', e.target.value)}
              className="flex-1 border border-slate-300 rounded-lg px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#6e9bbf]" />
          </div>
        </div>

        {/* フィルター群 */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-6">
          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1.5">ステータス</label>
            <MultiSelect selected={filters.status} onChange={v => setFilter('status', v)} options={TELEAPO_STATUSES} placeholder="すべて" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1.5">業種</label>
            <MultiSelect selected={filters.industry} onChange={v => setFilter('industry', v)} options={INDUSTRIES} placeholder="すべて" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1.5">担当営業</label>
            <MultiSelect selected={filters.salesRep} onChange={v => setFilter('salesRep', v)} options={salesReps} placeholder="すべて" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1.5">架電回数</label>
            <select value={filters.callCount} onChange={e => setFilter('callCount', e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#6e9bbf]">
              <option value="">すべて</option>
              <option value="0">0回（未架電）</option>
              <option value="1-3">1〜3回</option>
              <option value="4+">4回以上</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1.5">従業員規模</label>
            <MultiSelect selected={filters.employeeScale} onChange={v => setFilter('employeeScale', v)} options={EMPLOYEE_SCALES} placeholder="すべて" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1.5">Keep</label>
            <select value={filters.kept} onChange={e => setFilter('kept', e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#6e9bbf]">
              <option value="">すべて</option>
              <option value="true">Keep中のみ</option>
              <option value="false">Keep以外</option>
            </select>
          </div>
        </div>

        {/* アクション */}
        <div className="flex items-center justify-between border-t border-slate-100 pt-4">
          <div className="text-sm text-slate-500">
            {activeCount > 0 ? (
              <span>{activeCount}件の条件を設定中</span>
            ) : (
              <span>条件なし（全件表示）</span>
            )}
          </div>
          <div className="flex gap-3">
            {activeCount > 0 && (
              <button onClick={handleClear}
                className="px-4 py-2.5 text-sm text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors">
                条件クリア
              </button>
            )}
            <button onClick={onSearch}
              className="px-8 py-2.5 text-sm font-medium text-white bg-[#2d6a9e] rounded-lg hover:bg-[#1a5285] transition-colors shadow-sm">
              検索する
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ───────────────────── 結果一覧画面 ───────────────────── */
function ResultsPage({ filtered, items, filters, setFilters, searchText, onBack, salesReps, onSelectItem }) {
  // アクティブなフィルタをバッジ表示用に集める
  const badges = []
  if (searchText.trim()) badges.push({ label: `"${searchText.trim()}"`, key: 'search' })
  if (filters.status.length) filters.status.forEach(s => badges.push({ label: s, key: 'status', onClick: () => setFilters(prev => ({ ...prev, status: prev.status.filter(v => v !== s) })) }))
  if (filters.industry.length) filters.industry.forEach(s => badges.push({ label: s, key: 'industry', onClick: () => setFilters(prev => ({ ...prev, industry: prev.industry.filter(v => v !== s) })) }))
  if (filters.salesRep.length) filters.salesRep.forEach(s => badges.push({ label: s, key: 'salesRep', onClick: () => setFilters(prev => ({ ...prev, salesRep: prev.salesRep.filter(v => v !== s) })) }))
  if (filters.employeeScale.length) filters.employeeScale.forEach(s => badges.push({ label: s, key: 'employeeScale', onClick: () => setFilters(prev => ({ ...prev, employeeScale: prev.employeeScale.filter(v => v !== s) })) }))
  if (filters.callCount) {
    const label = filters.callCount === '0' ? '未架電' : filters.callCount === '1-3' ? '1〜3回' : '4回以上'
    badges.push({ label, key: 'callCount' })
  }
  if (filters.kept === 'true') badges.push({ label: 'Keep中', key: 'kept' })
  if (filters.kept === 'false') badges.push({ label: 'Keep以外', key: 'kept' })
  if (filters.callDateFrom || filters.callDateTo) {
    const from = filters.callDateFrom || '...'
    const to = filters.callDateTo || '...'
    badges.push({ label: `架電: ${from} 〜 ${to}`, key: 'callDate' })
  }

  return (
    <div>
      {/* ヘッダー：戻るボタン + 件数 */}
      <div className="flex items-center gap-4 mb-4">
        <button onClick={onBack}
          className="flex items-center gap-1.5 text-sm text-[#4a82ae] hover:text-[#2d6a9e] font-medium transition-colors">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          検索条件に戻る
        </button>
      </div>

      <div className="flex flex-wrap items-end justify-between gap-3 mb-3">
        <div>
          <h2 className="text-lg font-bold text-slate-800">
            検索結果 <span className="text-[#2d6a9e]">{filtered.length}</span>
            <span className="text-sm font-normal text-slate-500 ml-1">/ 全{items.length}件</span>
          </h2>
          {badges.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {badges.map((b, i) => (
                <span key={`${b.key}-${i}`}
                  onClick={b.onClick}
                  className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-sky-50 text-[#2d6a9e] border border-sky-200${b.onClick ? ' cursor-pointer hover:bg-sky-100' : ''}`}>
                  {b.label}
                  {b.onClick && <span className="ml-1">&times;</span>}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* テーブル */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 sticky top-0">
              <tr>
                <th className="px-3 py-2.5 text-left text-xs font-medium text-slate-500 whitespace-nowrap w-8"></th>
                <th className="px-3 py-2.5 text-left text-xs font-medium text-slate-500 whitespace-nowrap">企業名</th>
                <th className="px-3 py-2.5 text-left text-xs font-medium text-slate-500 whitespace-nowrap">業種</th>
                <th className="px-3 py-2.5 text-left text-xs font-medium text-slate-500 whitespace-nowrap">従業員規模</th>
                <th className="px-3 py-2.5 text-left text-xs font-medium text-slate-500 whitespace-nowrap">担当営業</th>
                <th className="px-3 py-2.5 text-center text-xs font-medium text-slate-500 whitespace-nowrap">架電数</th>
                <th className="px-3 py-2.5 text-left text-xs font-medium text-slate-500 whitespace-nowrap">ステータス</th>
                <th className="px-3 py-2.5 text-left text-xs font-medium text-slate-500 whitespace-nowrap">最終架電</th>
                <th className="px-3 py-2.5 text-left text-xs font-medium text-slate-500 whitespace-nowrap">最終結果</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.length === 0 ? (
                <tr><td colSpan={9} className="px-3 py-12 text-center text-slate-400">
                  <p className="text-base mb-1">該当する企業がありません</p>
                  <p className="text-xs">検索条件を変更してお試しください</p>
                </td></tr>
              ) : filtered.map(item => {
                const history = item.callHistory || []
                const lastCall = history.length > 0 ? history[history.length - 1] : null
                return (
                  <tr key={item.id} onClick={() => onSelectItem(item)}
                    className="hover:bg-sky-50/50 cursor-pointer transition-colors">
                    <td className="px-3 py-2.5 text-center">
                      {item.isKept && <span className="text-[#b45309] text-xs font-bold" title="Keep中">K</span>}
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <span className="font-medium text-slate-800">{item.companyName}</span>
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap text-slate-500 text-xs">{item.industry || '-'}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap text-slate-500 text-xs">{item.employeeScale || '-'}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap text-slate-600 text-xs">{item.salesRep || '-'}</td>
                    <td className="px-3 py-2.5 text-center">
                      <span className={`inline-block min-w-[28px] text-center px-1.5 py-0.5 rounded-full text-xs font-bold ${
                        history.length === 0 ? 'bg-slate-100 text-slate-400' :
                        history.length <= 3 ? 'bg-sky-50 text-[#4a82ae]' :
                        'bg-sky-100 text-[#2d6a9e]'
                      }`}>{history.length}</span>
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${TELEAPO_STATUS_COLORS[item.status] || 'bg-slate-100 text-slate-600'}`}>
                        {item.status}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap text-slate-500 text-xs">
                      {lastCall?.date ? new Date(lastCall.date).toLocaleDateString('ja-JP') : '-'}
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap text-xs">
                      {lastCall ? (
                        <span className={`font-medium ${
                          lastCall.result === 'アポ獲得' ? 'text-[#0f766e]' :
                          lastCall.result === '断り' ? 'text-[#be123c]' :
                          'text-slate-600'
                        }`}>{lastCall.result}</span>
                      ) : '-'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

/* ───────────────────── メインコンポーネント ───────────────────── */
export default function TeleapoList({ items, setItems, onPromote, proposals = [], currentUser, users = [] }) {
  const [page, setPage] = useState('search') // 'search' | 'results'
  const [showModal, setShowModal] = useState(false)
  const [showCsvImport, setShowCsvImport] = useState(false)
  const [editItem, setEditItem] = useState(null)
  const [selectedItem, setSelectedItem] = useState(null)
  const [searchText, setSearchText] = useState('')
  const [filters, setFilters] = useState({
    status: [],
    industry: [],
    salesRep: [],
    callCount: '',
    employeeScale: [],
    kept: '',
    callDateFrom: '',
    callDateTo: '',
  })

  // 登録ユーザー + 既存データから営業担当を統合
  const salesReps = useMemo(() => {
    const set = new Set(users.map(u => u.name))
    set.add('未確定')
    items.forEach(i => { if (i.salesRep) set.add(i.salesRep) })
    proposals.forEach(p => { if (p.salesRep) set.add(p.salesRep) })
    return [...set].sort()
  }, [items, proposals, users])

  const filtered = useMemo(() => {
    const q = searchText.trim().toLowerCase()
    return items.filter(item => {
      if (filters.status.length && !filters.status.includes(item.status)) return false
      if (filters.industry.length && !filters.industry.includes(item.industry)) return false
      if (filters.salesRep.length && !filters.salesRep.includes(item.salesRep)) return false
      if (filters.employeeScale.length && !filters.employeeScale.includes(item.employeeScale)) return false
      if (filters.kept === 'true' && !item.isKept) return false
      if (filters.kept === 'false' && item.isKept) return false
      const cc = (item.callHistory || []).length
      if (filters.callCount === '0' && cc !== 0) return false
      if (filters.callCount === '1-3' && (cc < 1 || cc > 3)) return false
      if (filters.callCount === '4+' && cc < 4) return false
      // 架電日時フィルター：いずれかの架電が指定期間内にあるか
      if (filters.callDateFrom || filters.callDateTo) {
        const history = item.callHistory || []
        if (history.length === 0) return false
        const from = filters.callDateFrom ? new Date(filters.callDateFrom + 'T00:00:00') : null
        const to = filters.callDateTo ? new Date(filters.callDateTo + 'T23:59:59') : null
        const hasMatch = history.some(c => {
          if (!c.date) return false
          const d = new Date(c.date)
          if (from && d < from) return false
          if (to && d > to) return false
          return true
        })
        if (!hasMatch) return false
      }
      if (q) {
        const hay = [item.companyName, item.phone, item.contactName, item.salesRep, item.industry, item.memo]
          .filter(Boolean).join(' ').toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [items, filters, searchText])

  const handleSave = (item) => {
    setItems(prev => {
      const idx = prev.findIndex(i => i.id === item.id)
      if (idx >= 0) {
        const next = [...prev]
        next[idx] = item
        return next
      }
      return [...prev, { ...item, callHistory: item.callHistory || [] }]
    })
    setShowModal(false)
    setEditItem(null)
  }

  const handleUpdate = (updated) => {
    setItems(prev => prev.map(i => i.id === updated.id ? updated : i))
    setSelectedItem(updated)
  }

  const handleDelete = (id) => {
    setItems(prev => prev.filter(i => i.id !== id))
    setSelectedItem(null)
  }

  const handlePromote = (item) => {
    onPromote(item)
    setSelectedItem(null)
  }

  const handleEdit = (item) => {
    setEditItem(item)
    setShowModal(true)
    setSelectedItem(null)
  }

  const handleCsvImport = (imported) => {
    setItems(prev => [...prev, ...imported])
    setShowCsvImport(false)
  }

  const stats = useMemo(() => {
    const total = items.length
    const kept = items.filter(i => i.isKept).length
    const called = items.filter(i => (i.callHistory || []).length > 0).length
    const appo = items.filter(i => i.status === 'アポ確定').length
    return { total, kept, called, appo }
  }, [items])

  return (
    <div>
      {page === 'search' && (
        <SearchPage
          filters={filters}
          setFilters={setFilters}
          searchText={searchText}
          setSearchText={setSearchText}
          onSearch={() => setPage('results')}
          stats={stats}
          salesReps={salesReps}
          onAddNew={() => { setEditItem(null); setShowModal(true) }}
          onCsvImport={() => setShowCsvImport(true)}
        />
      )}

      {page === 'results' && (
        <ResultsPage
          filtered={filtered}
          items={items}
          filters={filters}
          setFilters={setFilters}
          searchText={searchText}
          onBack={() => setPage('search')}
          salesReps={salesReps}
          onSelectItem={setSelectedItem}
        />
      )}

      {/* Detail Panel */}
      {selectedItem && (
        <DetailPanel
          item={selectedItem}
          onClose={() => setSelectedItem(null)}
          onUpdate={handleUpdate}
          onEdit={handleEdit}
          onPromote={handlePromote}
          onDelete={handleDelete}
          currentUser={currentUser}
        />
      )}

      {/* Company Modal */}
      {showModal && (
        <CompanyModal
          item={editItem}
          salesReps={salesReps}
          onSave={handleSave}
          onClose={() => { setShowModal(false); setEditItem(null) }}
        />
      )}

      {/* CSV Import Modal */}
      {showCsvImport && (
        <TeleapoCsvImport
          onImport={handleCsvImport}
          onClose={() => setShowCsvImport(false)}
          existingItems={items}
          salesReps={salesReps}
        />
      )}
    </div>
  )
}
