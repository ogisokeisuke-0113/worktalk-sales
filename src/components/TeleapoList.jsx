import { useState } from 'react'
import { TELEAPO_STATUSES, TELEAPO_STATUS_COLORS } from '../constants'

function TeleapoModal({ item, onSave, onClose }) {
  const isEdit = !!item
  const [form, setForm] = useState(item || {
    id: crypto.randomUUID(),
    companyName: '',
    phone: '',
    contactName: '',
    status: '未架電',
    callDate: '',
    memo: '',
  })

  const set = (key, value) => setForm(prev => ({ ...prev, [key]: value }))

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!form.companyName.trim()) return
    onSave(form)
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b">
          <h3 className="text-lg font-bold text-slate-800">{isEdit ? '編集' : '新規追加'}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-2xl leading-none">&times;</button>
        </div>
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">企業名 *</label>
            <input type="text" value={form.companyName} onChange={e => set('companyName', e.target.value)} required
              className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">電話番号</label>
            <input type="tel" value={form.phone} onChange={e => set('phone', e.target.value)}
              className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">担当者名</label>
            <input type="text" value={form.contactName} onChange={e => set('contactName', e.target.value)}
              className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">ステータス</label>
            <select value={form.status} onChange={e => set('status', e.target.value)}
              className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              {TELEAPO_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">架電日時</label>
            <input type="datetime-local" value={form.callDate} onChange={e => set('callDate', e.target.value)}
              className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">メモ</label>
            <textarea value={form.memo} onChange={e => set('memo', e.target.value)} rows={2}
              className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="px-4 py-2 text-sm text-slate-600 bg-slate-100 rounded-md hover:bg-slate-200">キャンセル</button>
            <button type="submit"
              className="px-4 py-2 text-sm text-white bg-blue-600 rounded-md hover:bg-blue-700">{isEdit ? '更新' : '追加'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function TeleapoList({ items, setItems, onPromote }) {
  const [showModal, setShowModal] = useState(false)
  const [editItem, setEditItem] = useState(null)
  const [statusFilter, setStatusFilter] = useState('')

  const filtered = statusFilter ? items.filter(i => i.status === statusFilter) : items

  const handleSave = (item) => {
    setItems(prev => {
      const idx = prev.findIndex(i => i.id === item.id)
      if (idx >= 0) {
        const next = [...prev]
        next[idx] = item
        return next
      }
      return [...prev, item]
    })
    setShowModal(false)
    setEditItem(null)
  }

  const handleDelete = (id) => {
    if (confirm('削除しますか？')) {
      setItems(prev => prev.filter(i => i.id !== id))
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h2 className="text-xl font-bold text-slate-800">テレアポリスト</h2>
        <button onClick={() => { setEditItem(null); setShowModal(true) }}
          className="px-4 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700">+ 新規追加</button>
      </div>

      <div className="flex gap-2 mb-4">
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          className="border border-slate-300 rounded-md px-2 py-1.5 text-sm bg-white">
          <option value="">全ステータス</option>
          {TELEAPO_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      <div className="text-sm text-slate-500 mb-2">{filtered.length}件表示 / 全{items.length}件</div>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 sticky top-0">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-medium text-slate-500 uppercase whitespace-nowrap">企業名</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-slate-500 uppercase whitespace-nowrap">電話番号</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-slate-500 uppercase whitespace-nowrap">担当者名</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-slate-500 uppercase whitespace-nowrap">ステータス</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-slate-500 uppercase whitespace-nowrap">架電日時</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-slate-500 uppercase whitespace-nowrap">メモ</th>
                <th className="px-3 py-2 text-center text-xs font-medium text-slate-500 uppercase whitespace-nowrap">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.length === 0 ? (
                <tr><td colSpan={7} className="px-3 py-8 text-center text-slate-400">データがありません</td></tr>
              ) : filtered.map(item => (
                <tr key={item.id} className="hover:bg-slate-50">
                  <td className="px-3 py-2 whitespace-nowrap font-medium text-slate-800">{item.companyName}</td>
                  <td className="px-3 py-2 whitespace-nowrap text-slate-600">{item.phone}</td>
                  <td className="px-3 py-2 whitespace-nowrap text-slate-600">{item.contactName}</td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${TELEAPO_STATUS_COLORS[item.status] || ''}`}>
                      {item.status}
                    </span>
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-slate-600">
                    {item.callDate ? new Date(item.callDate).toLocaleString('ja-JP') : ''}
                  </td>
                  <td className="px-3 py-2 text-slate-600 max-w-[200px] truncate">{item.memo}</td>
                  <td className="px-3 py-2 whitespace-nowrap text-center space-x-2">
                    <button onClick={() => { setEditItem(item); setShowModal(true) }}
                      className="text-blue-600 hover:text-blue-800 text-xs">編集</button>
                    <button onClick={() => onPromote(item)}
                      className="text-green-600 hover:text-green-800 text-xs">昇格</button>
                    <button onClick={() => handleDelete(item.id)}
                      className="text-red-400 hover:text-red-600 text-xs">削除</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <TeleapoModal
          item={editItem}
          onSave={handleSave}
          onClose={() => { setShowModal(false); setEditItem(null) }}
        />
      )}
    </div>
  )
}
