import { useState, useEffect } from 'react'
import { INDUSTRIES, EMPLOYEE_SCALES, PROPOSAL_STATUSES, RELATIONSHIPS, LOSS_REASONS, DEFAULT_PROPOSAL } from '../constants'

export default function ProposalSidePanel({ proposal, onSave, onClose, apiKey, salesReps = [] }) {
  const isEdit = !!proposal
  const [form, setForm] = useState({ ...DEFAULT_PROPOSAL })
  const [aiLoading, setAiLoading] = useState(false)
  const [aiResult, setAiResult] = useState('')
  const [activeTab, setActiveTab] = useState('info')
  const [newNote, setNewNote] = useState('')

  useEffect(() => {
    if (proposal) {
      setForm({
        ...DEFAULT_PROPOSAL,
        ...proposal,
        activityLog: proposal.activityLog || [],
      })
    } else {
      setForm({
        ...DEFAULT_PROPOSAL,
        id: crypto.randomUUID(),
        initialDate: new Date().toISOString().slice(0, 10),
      })
    }
  }, [proposal])

  const set = (key, value) => setForm(prev => ({ ...prev, [key]: value }))

  const handleAiDetect = async () => {
    if (!form.companyName.trim()) return
    if (!apiKey) {
      setAiResult('APIキーが設定されていません。設定タブから入力してください。')
      return
    }
    setAiLoading(true)
    setAiResult('')
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 300,
          messages: [{
            role: 'user',
            content: `以下の企業名から、業種と従業員規模を推定してください。

企業名: ${form.companyName}

以下のJSON形式で回答してください。必ずこの選択肢から選んでください。
業種の選択肢: ${INDUSTRIES.join(' / ')}
従業員規模の選択肢: ${EMPLOYEE_SCALES.join(' / ')}

回答形式:
{"industry": "業種", "employeeScale": "従業員規模", "reason": "判定根拠（1文で）"}

JSONのみ出力してください。`
          }]
        })
      })

      if (!res.ok) {
        const errBody = await res.text()
        throw new Error(`API error: ${res.status} ${errBody}`)
      }

      const data = await res.json()
      const text = data.content[0].text.trim()
      const jsonMatch = text.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0])
        if (parsed.industry && INDUSTRIES.includes(parsed.industry)) {
          set('industry', parsed.industry)
        }
        if (parsed.employeeScale && EMPLOYEE_SCALES.includes(parsed.employeeScale)) {
          set('employeeScale', parsed.employeeScale)
        }
        setAiResult(parsed.reason || '判定完了')
      } else {
        setAiResult('判定結果を解析できませんでした')
      }
    } catch (err) {
      setAiResult(`エラー: ${err.message}`)
    } finally {
      setAiLoading(false)
    }
  }

  const handleAddNote = () => {
    if (!newNote.trim()) return
    const entry = {
      date: new Date().toISOString(),
      type: 'note',
      note: newNote.trim(),
    }
    setForm(prev => ({
      ...prev,
      activityLog: [...(prev.activityLog || []), entry],
    }))
    setNewNote('')
  }

  const handleSubmit = (e) => {
    if (e) e.preventDefault()
    if (!form.companyName.trim()) return
    onSave(form)
  }

  const activityLog = [...(form.activityLog || [])].sort((a, b) =>
    (b.date || '').localeCompare(a.date || '')
  )

  const getTypeIcon = (type) => {
    switch (type) {
      case 'create': return { icon: '✦', color: 'bg-[#4a82ae]' }
      case 'status': return { icon: '→', color: 'bg-[#5a7a8a]' }
      case 'note': return { icon: '✎', color: 'bg-[#b45309]' }
      default: return { icon: '•', color: 'bg-slate-400' }
    }
  }

  const getTypeLabel = (entry) => {
    switch (entry.type) {
      case 'create': return '提案を作成'
      case 'status': return `${entry.from} → ${entry.to}`
      case 'note': return entry.note
      default: return entry.note || ''
    }
  }

  return (
    <div className="fixed inset-0 z-50 animate-fade-in">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="absolute right-0 top-0 h-full w-full max-w-xl bg-white shadow-2xl flex flex-col animate-slide-right">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b bg-slate-50 shrink-0">
          <h3 className="text-base font-bold text-slate-800">
            {isEdit ? '提案を編集' : '新規提案を追加'}
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-2xl leading-none">&times;</button>
        </div>

        {/* Tabs */}
        <div className="flex border-b shrink-0">
          <button
            onClick={() => setActiveTab('info')}
            className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
              activeTab === 'info'
                ? 'text-[#2d6a9e] border-b-2 border-[#2d6a9e] bg-sky-50/50'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            基本情報
          </button>
          <button
            onClick={() => setActiveTab('timeline')}
            className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
              activeTab === 'timeline'
                ? 'text-[#2d6a9e] border-b-2 border-[#2d6a9e] bg-sky-50/50'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            活動履歴 ({activityLog.length})
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {activeTab === 'info' && (
            <form onSubmit={handleSubmit} className="p-5 space-y-4">
              {/* Company & AI Detection */}
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">企業名 *</label>
                <div className="flex gap-2">
                  <input type="text" value={form.companyName} onChange={e => set('companyName', e.target.value)}
                    placeholder="株式会社○○" required
                    className="flex-1 border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  {form.companyName.trim() && (
                    <button type="button" onClick={handleAiDetect} disabled={aiLoading}
                      className="px-3 py-2 bg-purple-600 text-white text-xs rounded-md hover:bg-purple-700 disabled:opacity-50 whitespace-nowrap transition-colors">
                      {aiLoading ? '判定中...' : 'AI判定'}
                    </button>
                  )}
                </div>
                {aiResult && (
                  <p className="mt-1 text-xs text-purple-600">{aiResult}</p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">初回提案日時</label>
                  <input type="date" value={form.initialDate} onChange={e => set('initialDate', e.target.value)}
                    className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">営業担当</label>
                  <select value={form.salesRep || ''} onChange={e => set('salesRep', e.target.value)}
                    className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                    <option value="">選択してください</option>
                    {salesReps.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">担当者</label>
                  <input type="text" value={form.contactName || ''} onChange={e => set('contactName', e.target.value)}
                    placeholder="先方担当者名"
                    className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">役職</label>
                  <input type="text" value={form.position} onChange={e => set('position', e.target.value)}
                    placeholder="部長、課長など"
                    className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">業種</label>
                  <select value={form.industry} onChange={e => set('industry', e.target.value)}
                    className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="">選択してください</option>
                    {INDUSTRIES.map(i => <option key={i} value={i}>{i}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">従業員規模</label>
                  <select value={form.employeeScale} onChange={e => set('employeeScale', e.target.value)}
                    className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="">選択してください</option>
                    {EMPLOYEE_SCALES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>

              {/* Status & Relationship */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">提案状況</label>
                  <select value={form.status} onChange={e => set('status', e.target.value)}
                    className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                    {PROPOSAL_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">チャネル</label>
                  <select value={form.relationship} onChange={e => set('relationship', e.target.value)}
                    className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                    {RELATIONSHIPS.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
              </div>

              {/* Dates */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">決裁者アポ日</label>
                  <input type="date" value={form.decisionMakerDate} onChange={e => set('decisionMakerDate', e.target.value)}
                    className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">結論日</label>
                  <input type="date" value={form.conclusionDate} onChange={e => set('conclusionDate', e.target.value)}
                    className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>

              {/* Loss Reason */}
              {form.status === '失注' && (
                <div className="bg-rose-50 rounded-lg p-3 space-y-3">
                  <p className="text-xs font-bold text-red-700">失注情報</p>
                  <div>
                    <label className="block text-xs font-semibold text-red-600 mb-1">失注理由</label>
                    <select value={form.lossReason} onChange={e => set('lossReason', e.target.value)}
                      className="w-full border border-red-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400 bg-white">
                      <option value="">選択してください</option>
                      {LOSS_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-red-600 mb-1">失注理由詳細</label>
                    <input type="text" value={form.lossReasonDetail || ''} onChange={e => set('lossReasonDetail', e.target.value)}
                      placeholder="詳細な理由"
                      className="w-full border border-red-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400 bg-white" />
                  </div>
                </div>
              )}

              {/* Priority & Other */}
              <div className="flex items-center gap-3">
                <input type="checkbox" id="priorityFlag" checked={form.priorityFlag}
                  onChange={e => set('priorityFlag', e.target.checked)}
                  className="h-4 w-4 text-[#4a82ae] rounded" />
                <label htmlFor="priorityFlag" className="text-sm font-medium text-slate-700">優先フラグ</label>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">その他</label>
                <input type="text" value={form.other} onChange={e => set('other', e.target.value)}
                  className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">備考</label>
                <textarea value={form.notes} onChange={e => set('notes', e.target.value)} rows={2}
                  className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>

              {/* Action Buttons */}
              <div className="flex justify-end gap-3 pt-2 border-t">
                <button type="button" onClick={onClose}
                  className="px-4 py-2 text-sm text-slate-600 bg-slate-100 rounded-md hover:bg-slate-200 transition-colors">
                  キャンセル
                </button>
                <button type="submit"
                  className="px-5 py-2 text-sm text-white bg-[#2d6a9e] rounded-md hover:bg-[#1a5285] transition-colors font-medium">
                  {isEdit ? '更新' : '追加'}
                </button>
              </div>
            </form>
          )}

          {activeTab === 'timeline' && (
            <div className="p-5">
              {/* Add Note */}
              <div className="mb-5">
                <label className="block text-xs font-semibold text-slate-600 mb-1">メモを追加</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newNote}
                    onChange={e => setNewNote(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddNote() } }}
                    placeholder="活動メモを入力..."
                    className="flex-1 border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <button
                    type="button"
                    onClick={handleAddNote}
                    disabled={!newNote.trim()}
                    className="px-3 py-2 bg-blue-600 text-white text-xs rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors"
                  >
                    追加
                  </button>
                </div>
              </div>

              {/* Timeline */}
              {activityLog.length === 0 ? (
                <div className="text-center py-12 text-slate-400">
                  <p className="text-sm">活動履歴がありません</p>
                  <p className="text-xs mt-1">ステータス変更やメモ追加で自動記録されます</p>
                </div>
              ) : (
                <div className="relative">
                  <div className="absolute left-3 top-0 bottom-0 w-0.5 bg-slate-200" />
                  <div className="space-y-4">
                    {activityLog.map((entry, i) => {
                      const { icon, color } = getTypeIcon(entry.type)
                      return (
                        <div key={i} className="flex gap-3 relative">
                          <div className={`w-6 h-6 rounded-full ${color} flex items-center justify-center text-white text-xs font-bold z-10 shrink-0`}>
                            {icon}
                          </div>
                          <div className="flex-1 pb-2">
                            <p className="text-sm text-slate-800">{getTypeLabel(entry)}</p>
                            <p className="text-[10px] text-slate-400 mt-0.5">
                              {entry.date ? new Date(entry.date).toLocaleString('ja-JP') : ''}
                            </p>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Save button in timeline tab too */}
              <div className="flex justify-end gap-3 pt-4 mt-4 border-t">
                <button type="button" onClick={onClose}
                  className="px-4 py-2 text-sm text-slate-600 bg-slate-100 rounded-md hover:bg-slate-200 transition-colors">
                  キャンセル
                </button>
                <button type="button" onClick={() => handleSubmit()}
                  className="px-5 py-2 text-sm text-white bg-[#2d6a9e] rounded-md hover:bg-[#1a5285] transition-colors font-medium">
                  {isEdit ? '更新' : '追加'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
