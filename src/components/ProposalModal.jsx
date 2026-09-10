import { useState, useEffect } from 'react'
import { INDUSTRIES, EMPLOYEE_SCALES, PROPOSAL_STATUSES, RELATIONSHIPS, LOSS_REASONS, LOSS_CATEGORIES, RECONSIDERING_TIMINGS, DEFAULT_PROPOSAL, PROPOSAL_SERVICES, CONTACT_POSITIONS, MEETING_PHASES, MEETING_CHECKS, NEXT_ACTIONS, MEETING_RESULTS } from '../constants'

const MEETING_DEFAULT = {
  id: '',
  date: '',
  service: '',
  phase: '',
  attendeesSelf: [],
  attendeesClient: '',
  checks: [],
  result: '',
  nextAction: '',
  nextActionDate: '',
  note: '',
}

export default function ProposalSidePanel({ proposal, onSave, onClose, onDelete, apiKey, salesReps = [] }) {
  const isEdit = !!proposal
  const [form, setForm] = useState({ ...DEFAULT_PROPOSAL })
  const [aiLoading, setAiLoading] = useState(false)
  const [aiResult, setAiResult] = useState('')
  const [activeTab, setActiveTab] = useState('info')
  const [newNote, setNewNote] = useState('')
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [meetingForm, setMeetingForm] = useState(null)
  const [editingMeetingId, setEditingMeetingId] = useState(null)

  useEffect(() => {
    if (proposal) {
      setForm({
        ...DEFAULT_PROPOSAL,
        ...proposal,
        activityLog: proposal.activityLog || [],
        meetingLog: proposal.meetingLog || [],
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

  const handleSaveMeeting = () => {
    if (!meetingForm) return
    const entry = { ...meetingForm, id: meetingForm.id || crypto.randomUUID() }
    setForm(prev => {
      const log = prev.meetingLog || []
      const exists = log.find(m => m.id === entry.id)
      return {
        ...prev,
        meetingLog: exists
          ? log.map(m => m.id === entry.id ? entry : m)
          : [...log, entry],
      }
    })
    setMeetingForm(null)
    setEditingMeetingId(null)
  }

  const handleDeleteMeeting = (id) => {
    setForm(prev => ({ ...prev, meetingLog: (prev.meetingLog || []).filter(m => m.id !== id) }))
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
          <div className="flex items-center gap-2">
            {isEdit && onDelete && (
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="flex items-center gap-1 px-2.5 py-1 text-xs text-red-500 hover:text-red-700 hover:bg-red-50 rounded-md transition-colors"
                title="この提案を削除"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
                削除
              </button>
            )}
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-2xl leading-none">&times;</button>
          </div>
        </div>

        {/* Delete confirmation overlay */}
        {showDeleteConfirm && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/80 backdrop-blur-sm">
            <div className="bg-white border border-red-200 rounded-xl shadow-xl p-6 mx-6 text-center">
              <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-3">
                <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6 text-red-500" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
              </div>
              <p className="text-sm font-bold text-slate-800 mb-1">この提案を削除しますか？</p>
              <p className="text-xs text-slate-500 mb-5">
                <span className="font-medium text-slate-700">{form.companyName}</span> のデータが完全に削除されます。<br />この操作は取り消せません。
              </p>
              <div className="flex gap-3 justify-center">
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  className="px-4 py-2 text-sm text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors"
                >
                  キャンセル
                </button>
                <button
                  onClick={() => { onDelete(proposal.id); onClose() }}
                  className="px-4 py-2 text-sm text-white bg-red-500 rounded-lg hover:bg-red-600 transition-colors font-medium"
                >
                  削除する
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="flex border-b shrink-0">
          {[
            { key: 'info', label: '基本情報' },
            { key: 'meeting', label: `商談記録 (${(form.meetingLog || []).length})` },
            { key: 'timeline', label: `活動履歴 (${activityLog.length})` },
          ].map(t => (
            <button key={t.key}
              onClick={() => setActiveTab(t.key)}
              className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
                activeTab === t.key
                  ? 'text-[#2d6a9e] border-b-2 border-[#2d6a9e] bg-sky-50/50'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {t.label}
            </button>
          ))}
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

              {/* Service Selection */}
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">提案サービス *</label>
                <div className="flex flex-wrap gap-1.5">
                  {PROPOSAL_SERVICES.map(s => (
                    <button key={s} type="button"
                      onClick={() => set('service', form.service === s ? '' : s)}
                      className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                        form.service === s
                          ? 'bg-[#2d6a9e] text-white border-[#2d6a9e]'
                          : 'bg-white text-slate-600 border-slate-300 hover:border-[#2d6a9e] hover:text-[#2d6a9e]'
                      }`}>
                      {s}
                    </button>
                  ))}
                </div>
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
                  <select value={form.position || ''} onChange={e => set('position', e.target.value)}
                    className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                    <option value="">選択してください</option>
                    {CONTACT_POSITIONS.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
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
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-red-600 mb-1">失注カテゴリ</label>
                      <select value={form.lossCategory || ''} onChange={e => set('lossCategory', e.target.value)}
                        className="w-full border border-red-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400 bg-white">
                        <option value="">選択してください</option>
                        {LOSS_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-red-600 mb-1">再検討時期</label>
                      <select value={form.reconsiderationTiming || ''} onChange={e => set('reconsiderationTiming', e.target.value)}
                        className="w-full border border-red-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400 bg-white">
                        <option value="">選択してください</option>
                        {RECONSIDERING_TIMINGS.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-red-600 mb-1">競合他社名</label>
                    <input type="text" value={form.competitorName || ''} onChange={e => set('competitorName', e.target.value)}
                      placeholder="競合となった会社名（任意）"
                      className="w-full border border-red-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400 bg-white" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-red-600 mb-1">商談での主な懸念事項</label>
                    <textarea value={form.lossNotes || ''} onChange={e => set('lossNotes', e.target.value)}
                      rows={2} placeholder="顧客が商談で挙げた懸念・反論など"
                      className="w-full border border-red-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400 bg-white" />
                  </div>
                  <div className="border-t border-red-100 pt-2">
                    <p className="text-[10px] font-semibold text-red-400 mb-2 uppercase tracking-wide">要件確認</p>
                    <div>
                      <label className="block text-xs font-semibold text-red-600 mb-1">失注理由（要件）</label>
                      <select value={form.lossReason} onChange={e => set('lossReason', e.target.value)}
                        className="w-full border border-red-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400 bg-white">
                        <option value="">選択してください</option>
                        {LOSS_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
                      </select>
                    </div>
                    <div className="mt-2">
                      <label className="block text-xs font-semibold text-red-600 mb-1">失注理由詳細</label>
                      <input type="text" value={form.lossReasonDetail || ''} onChange={e => set('lossReasonDetail', e.target.value)}
                        placeholder="詳細な理由"
                        className="w-full border border-red-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400 bg-white" />
                    </div>
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

          {activeTab === 'meeting' && (
            <div className="p-5 space-y-4">
              {/* 新規追加ボタン */}
              {!meetingForm && (
                <button
                  onClick={() => { setMeetingForm({ ...MEETING_DEFAULT, date: new Date().toISOString().slice(0, 10) }); setEditingMeetingId(null) }}
                  className="w-full py-2 border-2 border-dashed border-slate-300 rounded-lg text-sm text-slate-500 hover:border-[#2d6a9e] hover:text-[#2d6a9e] transition-colors"
                >
                  + 商談記録を追加
                </button>
              )}

              {/* 入力フォーム */}
              {meetingForm && (
                <div className="border border-[#2d6a9e] rounded-xl p-4 space-y-3 bg-sky-50/30">
                  <p className="text-xs font-bold text-[#2d6a9e]">{editingMeetingId ? '商談記録を編集' : '新規商談記録'}</p>

                  {/* 日時・フェーズ */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-500 mb-1">日時</label>
                      <input type="date" value={meetingForm.date}
                        onChange={e => setMeetingForm(p => ({ ...p, date: e.target.value }))}
                        className="w-full border border-slate-300 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-500 mb-1">商談フェーズ</label>
                      <select value={meetingForm.phase}
                        onChange={e => setMeetingForm(p => ({ ...p, phase: e.target.value }))}
                        className="w-full border border-slate-300 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white">
                        <option value="">選択</option>
                        {MEETING_PHASES.map(ph => <option key={ph} value={ph}>{ph}</option>)}
                      </select>
                    </div>
                  </div>

                  {/* 提案サービス */}
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">提案サービス</label>
                    <div className="flex flex-wrap gap-1.5">
                      {PROPOSAL_SERVICES.map(s => (
                        <button key={s} type="button"
                          onClick={() => setMeetingForm(p => ({ ...p, service: p.service === s ? '' : s }))}
                          className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                            meetingForm.service === s
                              ? 'bg-[#2d6a9e] text-white border-[#2d6a9e]'
                              : 'bg-white text-slate-600 border-slate-300 hover:border-[#2d6a9e] hover:text-[#2d6a9e]'
                          }`}>
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* 参加者 */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-500 mb-1">自社参加者</label>
                      <div className="flex flex-wrap gap-1">
                        {salesReps.filter(r => r !== '未確定').map(r => (
                          <button key={r} type="button"
                            onClick={() => setMeetingForm(p => {
                              const cur = p.attendeesSelf || []
                              return { ...p, attendeesSelf: cur.includes(r) ? cur.filter(x => x !== r) : [...cur, r] }
                            })}
                            className={`px-2 py-0.5 rounded-full text-xs border transition-colors ${
                              (meetingForm.attendeesSelf || []).includes(r)
                                ? 'bg-slate-700 text-white border-slate-700'
                                : 'bg-white text-slate-500 border-slate-300 hover:border-slate-500'
                            }`}>
                            {r}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-500 mb-1">先方参加者</label>
                      <input type="text" value={meetingForm.attendeesClient || ''}
                        onChange={e => setMeetingForm(p => ({ ...p, attendeesClient: e.target.value }))}
                        placeholder="例：田中部長"
                        className="w-full border border-slate-300 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
                    </div>
                  </div>

                  {/* 確認項目 */}
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">確認項目</label>
                    <div className="flex flex-wrap gap-2">
                      {MEETING_CHECKS.map(c => (
                        <label key={c} className="flex items-center gap-1.5 cursor-pointer">
                          <input type="checkbox"
                            checked={(meetingForm.checks || []).includes(c)}
                            onChange={() => setMeetingForm(p => {
                              const cur = p.checks || []
                              return { ...p, checks: cur.includes(c) ? cur.filter(x => x !== c) : [...cur, c] }
                            })}
                            className="w-3.5 h-3.5 rounded text-[#2d6a9e]" />
                          <span className="text-xs text-slate-600">{c}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* 商談結果 */}
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">商談結果</label>
                    <div className="flex flex-wrap gap-1.5">
                      {MEETING_RESULTS.map(r => (
                        <button key={r} type="button"
                          onClick={() => setMeetingForm(p => ({ ...p, result: p.result === r ? '' : r }))}
                          className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                            meetingForm.result === r
                              ? r === '受注' ? 'bg-teal-600 text-white border-teal-600'
                              : r === '失注' ? 'bg-rose-600 text-white border-rose-600'
                              : 'bg-[#2d6a9e] text-white border-[#2d6a9e]'
                              : 'bg-white text-slate-600 border-slate-300 hover:border-slate-400'
                          }`}>
                          {r}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* 次のアクション */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-500 mb-1">次のアクション</label>
                      <select value={meetingForm.nextAction || ''}
                        onChange={e => setMeetingForm(p => ({ ...p, nextAction: e.target.value }))}
                        className="w-full border border-slate-300 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white">
                        <option value="">選択</option>
                        {NEXT_ACTIONS.map(a => <option key={a} value={a}>{a}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-500 mb-1">次回予定日</label>
                      <input type="date" value={meetingForm.nextActionDate || ''}
                        onChange={e => setMeetingForm(p => ({ ...p, nextActionDate: e.target.value }))}
                        className="w-full border border-slate-300 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
                    </div>
                  </div>

                  {/* メモ（最小化） */}
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">メモ（補足のみ）</label>
                    <input type="text" value={meetingForm.note || ''}
                      onChange={e => setMeetingForm(p => ({ ...p, note: e.target.value }))}
                      placeholder="上記で表現できない補足情報のみ"
                      className="w-full border border-slate-300 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
                  </div>

                  <div className="flex justify-end gap-2 pt-1">
                    <button type="button" onClick={() => { setMeetingForm(null); setEditingMeetingId(null) }}
                      className="px-4 py-1.5 text-sm text-slate-600 bg-slate-100 rounded-md hover:bg-slate-200 transition-colors">
                      キャンセル
                    </button>
                    <button type="button" onClick={handleSaveMeeting}
                      className="px-4 py-1.5 text-sm text-white bg-[#2d6a9e] rounded-md hover:bg-[#1a5285] transition-colors font-medium">
                      保存
                    </button>
                  </div>
                </div>
              )}

              {/* 記録一覧 */}
              {(form.meetingLog || []).length === 0 && !meetingForm ? (
                <div className="text-center py-12 text-slate-400">
                  <p className="text-sm">商談記録がありません</p>
                  <p className="text-xs mt-1">「商談記録を追加」から記録してください</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {[...(form.meetingLog || [])].sort((a, b) => (b.date || '').localeCompare(a.date || '')).map(m => (
                    <div key={m.id} className="border border-slate-200 rounded-xl p-4 bg-white">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-semibold text-slate-800">{m.date || '日付未設定'}</span>
                          {m.phase && <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">{m.phase}</span>}
                          {m.service && <span className="text-xs px-2 py-0.5 rounded-full bg-[#e8f0f8] text-[#2d6a9e] font-medium">{m.service}</span>}
                          {m.result && (
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                              m.result === '受注' ? 'bg-teal-100 text-teal-700' :
                              m.result === '失注' ? 'bg-rose-100 text-rose-700' :
                              m.result === '担当者合意' || m.result === '決裁者合意' ? 'bg-amber-50 text-amber-700' :
                              'bg-slate-100 text-slate-600'
                            }`}>{m.result}</span>
                          )}
                        </div>
                        <div className="flex gap-1.5 shrink-0">
                          <button type="button"
                            onClick={() => { setMeetingForm({ ...MEETING_DEFAULT, ...m }); setEditingMeetingId(m.id) }}
                            className="text-xs text-slate-400 hover:text-[#2d6a9e] transition-colors">編集</button>
                          <button type="button"
                            onClick={() => handleDeleteMeeting(m.id)}
                            className="text-xs text-slate-400 hover:text-red-500 transition-colors">削除</button>
                        </div>
                      </div>
                      {((m.attendeesSelf && m.attendeesSelf.length > 0) || m.attendeesClient) && (
                        <p className="text-xs text-slate-500 mb-1">
                          参加: {[...(m.attendeesSelf || []), m.attendeesClient].filter(Boolean).join(' / ')}
                        </p>
                      )}
                      {m.checks && m.checks.length > 0 && (
                        <div className="flex flex-wrap gap-1 mb-1.5">
                          {m.checks.map(c => (
                            <span key={c} className="text-[10px] px-1.5 py-0.5 rounded bg-teal-50 text-teal-700">✓ {c}</span>
                          ))}
                        </div>
                      )}
                      {m.nextAction && (
                        <p className="text-xs text-[#2d6a9e] font-medium mt-1">
                          → {m.nextAction}{m.nextActionDate ? `（${m.nextActionDate}）` : ''}
                        </p>
                      )}
                      {m.note && <p className="text-xs text-slate-400 mt-1">{m.note}</p>}
                    </div>
                  ))}
                </div>
              )}

              {/* 保存ボタン */}
              <div className="flex justify-end gap-3 pt-4 mt-2 border-t">
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
