import { useState, useMemo, useEffect } from 'react'
import { TELEAPO_STATUSES, TELEAPO_STATUS_COLORS, INDUSTRIES, EMPLOYEE_SCALES, CALL_RESULTS, CALL_REJECTION_REASONS, CALL_TYPES, EMAIL_STATUSES, EMAIL_STATUS_COLORS, RELATIONSHIPS } from '../constants'
import TeleapoCsvImport from './TeleapoCsvImport'
import MultiSelect from './MultiSelect'
import CompanyLink from './CompanyLink'

const INPUT = 'w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#6e9bbf]'

// 架電優先スコア（0〜3）: 採用広告費 × 従業員増加数 × DL有無
// Keepが当日中有効かチェック（JST基準）
function isKeepActive(item) {
  if (!item.isKept || !item.keptAt) return false
  const kept = new Date(item.keptAt)
  const now = new Date()
  return kept.getFullYear() === now.getFullYear() &&
         kept.getMonth() === now.getMonth() &&
         kept.getDate() === now.getDate()
}

function calcPriorityScore(item, downloadLeads = []) {
  let score = 0
  // ダウンロードリード一致 → +3
  const companyLower = (item.companyName || '').trim().toLowerCase()
  if (downloadLeads.some(l => (l.companyName || '').trim().toLowerCase() === companyLower)) score += 3
  // メールステータス → 優先度加算
  if (item.emailStatus === 'クリック済み') score += 3
  else if (item.emailStatus === '開封済み') score += 2
  else if (item.emailStatus === '送信済み') score += 0.5
  // 採用広告費あり → +1（高額なら+2）
  if (item.recruitmentAdSpend) {
    const nums = item.recruitmentAdSpend.match(/\d+/g)
    if (nums) {
      const maxVal = Math.max(...nums.map(Number))
      score += maxVal >= 3000 ? 2 : maxVal >= 1000 ? 1 : 0.5
    } else score += 0.5
  }
  // 従業員増加数が正 → +1
  const growth = parseInt(item.employeeGrowth, 10)
  if (!isNaN(growth) && growth > 0) score += growth >= 50 ? 2 : 1
  return Math.min(Math.round(score), 4)
}
const PRIORITY_LABELS = ['', '低', '中', '高', '最高']
const PRIORITY_COLORS = ['', 'bg-slate-100 text-slate-400', 'bg-sky-50 text-[#4a82ae]', 'bg-amber-50 text-amber-700', 'bg-rose-50 text-rose-700']

/* ───────────────────── 企業編集モーダル ───────────────────── */
function CompanyModal({ item, onSave, onClose, salesReps, initialCompanyName = '' }) {
  const isEdit = !!item
  const [form, setForm] = useState(item || {
    id: crypto.randomUUID(),
    companyName: initialCompanyName,
    phone: '',
    recruitmentPhone: '',
    contactName: '',
    contactPosition: '',
    industry: '',
    employeeScale: '',
    salesRep: '',
    status: '未架電',
    isKept: false,
    keptBy: '',
    keptAt: '',
    memo: '',
    callHistory: [],
    companyUrl: '',
    prefecture: '',
    salesScale: '',
    listingStatus: '',
    recruitmentAdSpend: '',
    employeeGrowth: '',
    recruitmentJobType: '',
    listSource: '',
    nextCallDate: '',
    emailStatus: '未送信',
    emailSentAt: '',
    emailOpenedAt: '',
    keepHistory: [],
  })

  const set = (key, value) => setForm(prev => ({ ...prev, [key]: value }))

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!form.companyName.trim()) return
    if (form.status === 'アポ確定' && !form.salesRep) {
      alert('アポ確定の場合は担当営業を設定してください。')
      return
    }
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
            {/* 電話番号（2種） */}
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">代表電話番号</label>
              <input type="tel" value={form.phone} onChange={e => set('phone', e.target.value)} className={INPUT} placeholder="03-xxxx-xxxx" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">採用電話番号 <span className="text-[#0f766e] font-bold">直通</span></label>
              <input type="tel" value={form.recruitmentPhone || ''} onChange={e => set('recruitmentPhone', e.target.value)} className={INPUT} placeholder="採用担当者直通" />
            </div>
            {/* 担当者 */}
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">担当者名</label>
              <input type="text" value={form.contactName} onChange={e => set('contactName', e.target.value)} className={INPUT} />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">役職・部署</label>
              <input type="text" value={form.contactPosition || ''} onChange={e => set('contactPosition', e.target.value)} className={INPUT} placeholder="採用部長など" />
            </div>
            {/* 企業属性 */}
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">業種</label>
              <select value={form.industry} onChange={e => set('industry', e.target.value)} className={INPUT}>
                <option value="">未設定</option>
                {INDUSTRIES.map(i => <option key={i} value={i}>{i}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">従業員規模</label>
              <select value={form.employeeScale} onChange={e => set('employeeScale', e.target.value)} className={INPUT}>
                <option value="">未設定</option>
                {EMPLOYEE_SCALES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">エリア（都道府県）</label>
              <input type="text" value={form.prefecture || ''} onChange={e => set('prefecture', e.target.value)} className={INPUT} placeholder="東京都" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">売上規模</label>
              <input type="text" value={form.salesScale || ''} onChange={e => set('salesScale', e.target.value)} className={INPUT} placeholder="50億〜300億円" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">上場区分</label>
              <select value={form.listingStatus || ''} onChange={e => set('listingStatus', e.target.value)} className={INPUT}>
                <option value="">未設定</option>
                <option value="未上場">未上場</option>
                <option value="プライム">プライム</option>
                <option value="スタンダード">スタンダード</option>
                <option value="グロース">グロース</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">採用職種</label>
              <input type="text" value={form.recruitmentJobType || ''} onChange={e => set('recruitmentJobType', e.target.value)} className={INPUT} placeholder="営業・管理など" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">採用広告費</label>
              <input type="text" value={form.recruitmentAdSpend || ''} onChange={e => set('recruitmentAdSpend', e.target.value)} className={INPUT} placeholder="1000万〜3000万円" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">従業員増加数</label>
              <input type="number" value={form.employeeGrowth || ''} onChange={e => set('employeeGrowth', e.target.value)} className={INPUT} placeholder="67" />
            </div>
            {/* 営業管理 */}
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
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">チャネル</label>
              <select value={form.channel || ''} onChange={e => set('channel', e.target.value)} className={INPUT}>
                <option value="">新規（テレアポ）</option>
                {RELATIONSHIPS.filter(r => r !== '新規').map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">リストソース</label>
              <input type="text" value={form.listSource || ''} onChange={e => set('listSource', e.target.value)} className={INPUT} placeholder="セールスブレインなど" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">アポ獲得日</label>
              <input type="date" value={form.appoDate || ''} onChange={e => set('appoDate', e.target.value)} className={INPUT} />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">アポイント日 <span className="text-slate-400 font-normal">（面談予定日）</span></label>
              <input type="date" value={form.appointmentDate || ''} onChange={e => set('appointmentDate', e.target.value)} className={INPUT} />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">次回架電予定日</label>
              <input type="date" value={form.nextCallDate || ''} onChange={e => set('nextCallDate', e.target.value)} className={INPUT} />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">メール送信ステータス</label>
              <select value={form.emailStatus || '未送信'} onChange={e => set('emailStatus', e.target.value)} className={INPUT}>
                {EMAIL_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-slate-600 mb-1">メールアドレス</label>
              <input type="email" value={form.email || ''} onChange={e => set('email', e.target.value)} className={INPUT} placeholder="info@example.com" />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-slate-600 mb-1">企業URL</label>
              <input type="url" value={form.companyUrl || ''} onChange={e => set('companyUrl', e.target.value)} className={INPUT} placeholder="https://..." />
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

const CALL_CONTENTS = ['worktalk', '人材紹介', 'その他']

/* ───────────────────── 架電記録サイドパネル ───────────────────── */
function CallRecordModal({ onSave, onClose }) {
  const [form, setForm] = useState({
    callContent: '',
    callType: '',
    result: '',
    rejectionReason: '',
    note: '',
    nextCallDate: '',
  })
  const set = (key, value) => setForm(prev => ({ ...prev, [key]: value }))

  const handleSave = () => {
    if (!form.result) return
    onSave({ ...form, date: new Date().toISOString() })
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end" onClick={e => e.stopPropagation()}>
      {/* オーバーレイ */}
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      {/* サイドパネル */}
      <div className="relative w-80 h-full bg-white shadow-2xl flex flex-col animate-slide-right">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
          <h3 className="text-base font-bold text-slate-800">架電結果を記録</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-2xl leading-none">&times;</button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">架電内容</label>
            <select value={form.callContent} onChange={e => set('callContent', e.target.value)} className={INPUT}>
              <option value="">選択してください</option>
              {CALL_CONTENTS.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">架電区分</label>
            <select value={form.callType} onChange={e => set('callType', e.target.value)} className={INPUT}>
              <option value="">選択してください</option>
              {CALL_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">結果</label>
            <select value={form.result} onChange={e => { set('result', e.target.value); if (e.target.value !== '断り') set('rejectionReason', '') }} className={INPUT}>
              <option value="">選択してください</option>
              {CALL_RESULTS.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          {form.result === '断り' && (
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">断り理由</label>
              <select value={form.rejectionReason} onChange={e => set('rejectionReason', e.target.value)} className={INPUT}>
                <option value="">選択してください</option>
                {CALL_REJECTION_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
          )}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">担当者名（先方）</label>
            <input type="text" value={form.contactName || ''} onChange={e => set('contactName', e.target.value)} className={INPUT} placeholder="例：田中 太郎" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">メモ</label>
            <textarea value={form.note} onChange={e => set('note', e.target.value)} rows={4} className={INPUT} placeholder="通話内容のメモ..." />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">次回架電予定日（任意）</label>
            <input type="date" value={form.nextCallDate} onChange={e => set('nextCallDate', e.target.value)} className={INPUT} />
          </div>
        </div>
        <div className="px-5 py-4 border-t border-slate-200 flex gap-3">
          <button onClick={onClose} className="flex-1 py-2.5 text-sm text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200">キャンセル</button>
          <button onClick={handleSave}
            disabled={!form.result}
            className="flex-1 py-2.5 text-sm text-white bg-[#2d6a9e] rounded-lg hover:bg-[#1a5285] disabled:opacity-40">記録する</button>
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
    const { nextCallDate, ...callRecord } = record
    const updated = {
      ...item,
      callHistory: [...(item.callHistory || []), { ...callRecord, caller: currentUser?.name || '', id: crypto.randomUUID() }],
      status: item.status === '未架電' ? '架電済' : item.status,
      ...(nextCallDate ? { nextCallDate } : {}),
    }
    onUpdate(updated)
    setShowCallModal(false)
  }

  const keepActive = isKeepActive(item)
  const isMyKeep = keepActive && item.keptBy === currentUser?.name
  const isOtherKeep = keepActive && item.keptBy && item.keptBy !== currentUser?.name
  const isAppoConfirmed = item.status === 'アポ確定'

  const toggleKeep = () => {
    if (isOtherKeep || isAppoConfirmed) return
    const newKept = !keepActive
    const now = new Date().toISOString()
    const update = {
      ...item,
      isKept: newKept,
      keptBy: newKept ? (currentUser?.name || '') : '',
      keptAt: newKept ? now : '',
      keepHistory: newKept
        ? [...(item.keepHistory || []), { id: crypto.randomUUID(), date: now, by: currentUser?.name || '' }]
        : (item.keepHistory || []),
    }
    onUpdate(update)
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex justify-end" onClick={onClose}>
      <div className="bg-white w-full max-w-lg h-full overflow-y-auto shadow-2xl animate-slide-right" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="sticky top-0 bg-white border-b px-5 py-4 z-10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-lg font-bold text-slate-800">
                <CompanyLink name={item.companyName} />
              </h3>
              <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${TELEAPO_STATUS_COLORS[item.status] || 'bg-slate-100 text-slate-600'}`}>
                {item.status}
              </span>
              {item.emailStatus && item.emailStatus !== '未送信' && (
                <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${EMAIL_STATUS_COLORS[item.emailStatus] || 'bg-slate-100 text-slate-400'}`}>
                  📧 {item.emailStatus}
                </span>
              )}
            </div>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-2xl">&times;</button>
          </div>
          <div className="flex gap-2 mt-3 flex-wrap">
            {isAppoConfirmed ? null : isOtherKeep ? (
              <span className="px-3 py-1.5 text-xs font-medium rounded-md bg-amber-50 border border-amber-300 text-[#b45309]">
                🔒 {item.keptBy}がKeep中
              </span>
            ) : (
              <button onClick={toggleKeep}
                className={`px-3 py-1.5 text-xs font-medium rounded-md border transition-colors ${
                  keepActive
                    ? 'bg-amber-50 border-amber-300 text-[#b45309]'
                    : 'bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100'
                }`}>
                {keepActive ? 'Keep解除' : 'Keep'}
              </button>
            )}
            <button
              onClick={() => setShowCallModal(true)}
              disabled={isOtherKeep}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                isOtherKeep
                  ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                  : 'bg-[#2d6a9e] text-white hover:bg-[#1a5285]'
              }`}>
              架電を記録
            </button>
            <button onClick={() => onEdit(item)}
              className="px-3 py-1.5 text-xs font-medium rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50">
              編集
            </button>
            <button onClick={() => onPromote(item)}
              className="px-3 py-1.5 text-xs font-medium rounded-md bg-[#0f766e] text-white hover:bg-[#0a5c56]">
              アポ確定
            </button>
            <button onClick={() => { if (confirm('削除しますか？')) onDelete(item.id) }}
              className="px-3 py-1.5 text-xs font-medium rounded-md text-[#be123c] border border-rose-200 hover:bg-rose-50 ml-auto">
              削除
            </button>
          </div>
        </div>

        {/* Info */}
        <div className="px-5 py-4 space-y-4">
          {/* 電話番号：採用直通を最優先表示 */}
          {(item.recruitmentPhone || item.phone) && (
            <div className="bg-teal-50 border border-teal-200 rounded-lg px-3 py-3">
              {item.recruitmentPhone && (
                <div className="mb-2">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <p className="text-[10px] text-[#0f766e] font-bold">採用電話番号（直通）</p>
                    <span className="text-[9px] bg-[#0b5cff] text-white rounded px-1 py-0.5 font-bold leading-none">ZOOM</span>
                  </div>
                  <a href={`zoomphonecall://${item.recruitmentPhone}`} onClick={e => e.stopPropagation()} className="text-base font-bold text-[#0f766e] hover:underline">
                    {item.recruitmentPhone}
                  </a>
                </div>
              )}
              {item.phone && (
                <div className={item.recruitmentPhone ? 'border-t border-teal-100 pt-2' : ''}>
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <p className="text-[10px] text-slate-400 font-medium">代表電話番号</p>
                    <span className="text-[9px] bg-[#0b5cff] text-white rounded px-1 py-0.5 font-bold leading-none">ZOOM</span>
                  </div>
                  <a href={`zoomphonecall://${item.phone}`} onClick={e => e.stopPropagation()} className="text-sm text-slate-600 hover:underline">{item.phone}</a>
                </div>
              )}
            </div>
          )}

          {/* 基本情報グリッド */}
          <div className="grid grid-cols-2 gap-3">
            {[
              ['担当者名', item.contactName ? `${item.contactName}${item.contactPosition ? ` / ${item.contactPosition}` : ''}` : null],
              ['業種', item.industry],
              ['従業員規模', item.employeeScale],
              ['エリア', item.prefecture],
              ['売上規模', item.salesScale],
              ['上場区分', item.listingStatus],
              ['採用職種', item.recruitmentJobType],
              ['採用広告費', item.recruitmentAdSpend],
              ['従業員増加数', item.employeeGrowth ? `${item.employeeGrowth}名増` : null],
              ['チャネル', item.channel || '新規（テレアポ）'],
              ['アポイント日', item.appointmentDate ? new Date(item.appointmentDate + 'T00:00:00').toLocaleDateString('ja-JP') : null],
              ['リストソース', item.listSource],
              ['担当営業', item.salesRep],
              ['架電回数', `${callCount}回`],
              ['次回架電予定日', item.nextCallDate ? new Date(item.nextCallDate + 'T00:00:00').toLocaleDateString('ja-JP') : null],
              ['Keep回数', (item.keepHistory || []).length > 0 ? `${(item.keepHistory || []).length}回` : null],
            ].filter(([, val]) => val).map(([label, val]) => (
              <div key={label} className="bg-slate-50 rounded-lg px-3 py-2">
                <p className="text-[10px] text-slate-400 font-medium">{label}</p>
                <p className="text-sm font-medium text-slate-700">{val || '-'}</p>
              </div>
            ))}
          </div>

          {item.companyUrl && (
            <div className="bg-slate-50 rounded-lg px-3 py-2">
              <p className="text-[10px] text-slate-400 font-medium mb-1">企業URL</p>
              <a href={item.companyUrl} target="_blank" rel="noopener noreferrer"
                className="text-sm text-[#2d6a9e] hover:underline break-all">{item.companyUrl}</a>
            </div>
          )}

          {/* メール送信ステータス */}
          {(item.emailStatus || item.emailSentAt || item.emailOpenedAt) && (
            <div className={`rounded-lg px-3 py-2 border ${EMAIL_STATUS_COLORS[item.emailStatus] ? '' : ''}`}
              style={{ background: item.emailStatus === '開封済み' ? '#fffbeb' : item.emailStatus === 'クリック済み' ? '#f0fdfa' : item.emailStatus === '送信済み' ? '#eff6ff' : '#f8fafc' }}>
              <p className="text-[10px] text-slate-400 font-medium mb-1">メール</p>
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${EMAIL_STATUS_COLORS[item.emailStatus || '未送信']}`}>
                  {item.emailStatus || '未送信'}
                </span>
                {item.emailSentAt && (
                  <span className="text-xs text-slate-400">送信: {new Date(item.emailSentAt).toLocaleDateString('ja-JP')}</span>
                )}
                {item.emailOpenedAt && (
                  <span className="text-xs text-amber-600">開封: {new Date(item.emailOpenedAt).toLocaleDateString('ja-JP')}</span>
                )}
              </div>
            </div>
          )}

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
                    {(c.callContent || c.callType) && (
                      <p className="text-xs text-slate-500 mb-0.5">
                        {[c.callContent, c.callType].filter(Boolean).join(' · ')}
                      </p>
                    )}
                    {c.rejectionReason && <p className="text-xs text-rose-500 mb-0.5">断り理由: {c.rejectionReason}</p>}
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
function SearchPage({ filters, setFilters, searchText, setSearchText, onSearch, stats, salesReps, allListSources = [], allPrefectures = [], onAddNew, onCsvImport }) {
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
    filters.emailStatus,
    filters.callResult.length > 0,
    (filters.listSource || []).length > 0,
    filters.nextCallDateUntil,
    (filters.prefecture || []).length > 0,
    filters.hasContact,
    (filters.callType || []).length > 0,
    (filters.callContent || []).length > 0,
    filters.keepHasHistory,
    filters.keepCountMin,
    filters.keepDateFrom,
    filters.keepDateTo,
    (filters.keepBy || []).length > 0,
    searchText.trim()
  ].filter(Boolean).length

  const handleClear = () => {
    setFilters({ status: [], industry: [], salesRep: [], callCount: '', employeeScale: [], kept: '', callDateFrom: '', callDateTo: '', emailStatus: '', callResult: [], listSource: [], nextCallDateUntil: '', prefecture: [], hasContact: '', callType: [], callContent: [], keepHasHistory: '', keepCountMin: '', keepDateFrom: '', keepDateTo: '', keepBy: [] })
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

      {/* キーワード検索 */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 px-5 py-4 mb-3">
        <input
          type="text"
          value={searchText}
          onChange={e => setSearchText(e.target.value)}
          placeholder="企業名・担当者名・電話番号・メモなど..."
          className="w-full border border-slate-300 rounded-lg px-4 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#6e9bbf] focus:border-transparent placeholder:text-slate-400"
        />
      </div>

      {/* カテゴリーカード群 */}
      <div className="grid grid-cols-2 gap-3 mb-4">

        {/* 企業情報 */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-3">企業情報</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">業種</label>
              <MultiSelect selected={filters.industry} onChange={v => setFilter('industry', v)} options={INDUSTRIES} placeholder="すべて" fullWidth />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">従業員規模</label>
              <MultiSelect selected={filters.employeeScale} onChange={v => setFilter('employeeScale', v)} options={EMPLOYEE_SCALES} placeholder="すべて" fullWidth />
            </div>
            {allPrefectures.length > 0 && (
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">都道府県</label>
                <MultiSelect selected={filters.prefecture || []} onChange={v => setFilter('prefecture', v)} options={allPrefectures} placeholder="すべて" fullWidth />
              </div>
            )}
            {allListSources.length > 0 && (
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">リストソース</label>
                <MultiSelect selected={filters.listSource || []} onChange={v => setFilter('listSource', v)} options={allListSources} placeholder="すべて" fullWidth />
              </div>
            )}
          </div>
        </div>

        {/* 営業進捗 */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-3">営業進捗</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">ステータス</label>
              <MultiSelect selected={filters.status} onChange={v => setFilter('status', v)} options={TELEAPO_STATUSES} placeholder="すべて" fullWidth />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">担当営業</label>
              <MultiSelect selected={filters.salesRep} onChange={v => setFilter('salesRep', v)} options={salesReps} placeholder="すべて" fullWidth />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">担当者名（先方）</label>
              <select value={filters.hasContact || ''} onChange={e => setFilter('hasContact', e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#6e9bbf]">
                <option value="">すべて</option>
                <option value="true">あり</option>
                <option value="false">なし</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">メール送信ステータス</label>
              <select value={filters.emailStatus || ''} onChange={e => setFilter('emailStatus', e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#6e9bbf]">
                <option value="">すべて</option>
                {EMAIL_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>
        </div>

        {/* Keep */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-3">Keep</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Keep状態</label>
              <select value={filters.kept} onChange={e => setFilter('kept', e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#6e9bbf]">
                <option value="">すべて</option>
                <option value="true">Keep中のみ</option>
                <option value="false">Keep以外</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Keep履歴</label>
              <select value={filters.keepHasHistory} onChange={e => setFilter('keepHasHistory', e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#6e9bbf]">
                <option value="">すべて</option>
                <option value="true">Keep履歴あり（過去含む）</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Keep回数</label>
              <select value={filters.keepCountMin} onChange={e => setFilter('keepCountMin', e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#6e9bbf]">
                <option value="">すべて</option>
                <option value="1">1回以上</option>
                <option value="2">2回以上</option>
                <option value="3">3回以上</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Keep担当者</label>
              <MultiSelect selected={filters.keepBy || []} onChange={v => setFilter('keepBy', v)} options={salesReps} placeholder="すべて" fullWidth />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-slate-600 mb-1">Keep日付</label>
              <div className="flex items-center gap-2">
                <input type="date" value={filters.keepDateFrom || ''} onChange={e => setFilter('keepDateFrom', e.target.value)}
                  className="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#6e9bbf]" />
                <span className="text-sm text-slate-400">〜</span>
                <input type="date" value={filters.keepDateTo || ''} onChange={e => setFilter('keepDateTo', e.target.value)}
                  className="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#6e9bbf]" />
              </div>
            </div>
          </div>
        </div>

        {/* 架電履歴 */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-3">架電履歴</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">架電回数</label>
              <select value={filters.callCount} onChange={e => setFilter('callCount', e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#6e9bbf]">
                <option value="">すべて</option>
                <option value="0">0回（未架電）</option>
                <option value="1-3">1〜3回</option>
                <option value="4+">4回以上</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">次回架電日（この日まで）</label>
              <input type="date" value={filters.nextCallDateUntil || ''} onChange={e => setFilter('nextCallDateUntil', e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#6e9bbf]" />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-slate-600 mb-1">架電日時</label>
              <div className="flex items-center gap-2">
                <input type="date" value={filters.callDateFrom || ''} onChange={e => setFilter('callDateFrom', e.target.value)}
                  className="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#6e9bbf]" />
                <span className="text-sm text-slate-400">〜</span>
                <input type="date" value={filters.callDateTo || ''} onChange={e => setFilter('callDateTo', e.target.value)}
                  className="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#6e9bbf]" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">架電結果</label>
              <MultiSelect selected={filters.callResult} onChange={v => setFilter('callResult', v)} options={CALL_RESULTS} placeholder="すべて" fullWidth />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">架電区分</label>
              <MultiSelect selected={filters.callType || []} onChange={v => setFilter('callType', v)} options={CALL_TYPES} placeholder="すべて" fullWidth />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-slate-600 mb-1">架電内容</label>
              <MultiSelect selected={filters.callContent || []} onChange={v => setFilter('callContent', v)} options={CALL_CONTENTS} placeholder="すべて" fullWidth />
            </div>
          </div>
        </div>

      </div>

      {/* アクション */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 px-5 py-3 flex items-center justify-between">
        <div className="text-sm text-slate-500">
          {activeCount > 0 ? <span>{activeCount}件の条件を設定中</span> : <span>条件なし（全件表示）</span>}
        </div>
        <div className="flex gap-3">
          {activeCount > 0 && (
            <button onClick={handleClear}
              className="px-4 py-2 text-sm text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors">
              条件クリア
            </button>
          )}
          <button onClick={onSearch}
            className="px-8 py-2 text-sm font-medium text-white bg-[#2d6a9e] rounded-lg hover:bg-[#1a5285] transition-colors shadow-sm">
            検索する
          </button>
        </div>
      </div>
    </div>
  )
}

/* ───────────────────── メール一括送信モーダル ───────────────────── */
function EmailSendModal({ selectedItems, settings, onClose, onSend }) {
  const templates = settings.emailTemplates || []
  const emailSenderName = settings.emailSenderName || ''
  const [templateId, setTemplateId] = useState(templates[0]?.id || '')
  const [previewIndex, setPreviewIndex] = useState(0)

  const template = templates.find(t => t.id === templateId) || null
  const withEmail = selectedItems.filter(i => i.email && i.email.includes('@'))
  const withoutEmail = selectedItems.filter(i => !i.email || !i.email.includes('@'))
  const previewItem = withEmail[previewIndex] || null

  const applyVars = (text, item) => (text || '')
    .replace(/{{会社名}}/g, item.companyName || '')
    .replace(/{{担当者名}}/g, item.contactName || '')
    .replace(/{{送信者名}}/g, emailSenderName)

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b sticky top-0 bg-white z-10">
          <h3 className="text-lg font-bold text-slate-800">メール一括送信</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-2xl leading-none">&times;</button>
        </div>

        <div className="p-5 space-y-5">
          {/* 送信対象サマリ */}
          <div className="flex gap-3">
            <div className="flex-1 bg-sky-50 rounded-lg px-4 py-3 border border-sky-100">
              <p className="text-xs text-slate-500">送信対象</p>
              <p className="text-2xl font-bold text-[#2d6a9e]">{withEmail.length}<span className="text-sm font-normal ml-1">社</span></p>
            </div>
            {withoutEmail.length > 0 && (
              <div className="flex-1 bg-amber-50 rounded-lg px-4 py-3 border border-amber-100">
                <p className="text-xs text-slate-500">メールなし（スキップ）</p>
                <p className="text-2xl font-bold text-amber-600">{withoutEmail.length}<span className="text-sm font-normal ml-1">社</span></p>
              </div>
            )}
          </div>

          {withoutEmail.length > 0 && (
            <p className="text-xs text-amber-600 bg-amber-50 rounded-lg px-3 py-2 border border-amber-100">
              ⚠ {withoutEmail.map(i => i.companyName).join('、')} はメールアドレス未登録のためスキップされます
            </p>
          )}

          {/* テンプレート選択 */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">テンプレート</label>
            {templates.length === 0 ? (
              <p className="text-sm text-slate-400 bg-slate-50 rounded-lg px-3 py-2">テンプレートがありません。設定画面で作成してください。</p>
            ) : (
              <select value={templateId} onChange={e => setTemplateId(e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#6e9bbf]">
                {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            )}
          </div>

          {/* プレビュー */}
          {template && previewItem && (
            <div className="border border-slate-200 rounded-lg overflow-hidden">
              <div className="bg-slate-50 px-4 py-2.5 border-b border-slate-200 flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-600">プレビュー</span>
                {withEmail.length > 1 && (
                  <div className="flex items-center gap-2">
                    <button onClick={() => setPreviewIndex(i => Math.max(0, i - 1))} disabled={previewIndex === 0}
                      className="text-xs text-[#4a82ae] disabled:text-slate-300 px-1">◀</button>
                    <span className="text-xs text-slate-500">{previewIndex + 1} / {withEmail.length}</span>
                    <button onClick={() => setPreviewIndex(i => Math.min(withEmail.length - 1, i + 1))} disabled={previewIndex === withEmail.length - 1}
                      className="text-xs text-[#4a82ae] disabled:text-slate-300 px-1">▶</button>
                  </div>
                )}
              </div>
              <div className="px-4 py-3 space-y-2">
                <div className="flex items-start gap-2">
                  <span className="text-xs text-slate-400 w-10 flex-shrink-0 pt-0.5">宛先</span>
                  <span className="text-xs text-slate-700">{previewItem.email}（{previewItem.companyName}）</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-xs text-slate-400 w-10 flex-shrink-0 pt-0.5">件名</span>
                  <span className="text-xs font-medium text-slate-800">{applyVars(template.subject, previewItem)}</span>
                </div>
                <div className="border-t border-slate-100 pt-2">
                  <p className="text-xs text-slate-400 mb-1.5">本文</p>
                  <pre className="text-xs text-slate-700 whitespace-pre-wrap font-sans leading-relaxed">{applyVars(template.body, previewItem)}</pre>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="flex gap-3 p-5 border-t sticky bottom-0 bg-white">
          <button onClick={onClose} className="flex-1 py-2.5 text-sm text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-50">キャンセル</button>
          <button
            onClick={() => onSend(withEmail, template)}
            disabled={withEmail.length === 0 || !template}
            className="flex-1 py-2.5 text-sm font-semibold text-white bg-[#2d6a9e] rounded-lg hover:bg-[#1a5285] disabled:opacity-40 disabled:cursor-not-allowed">
            {withEmail.length}社に送信する
          </button>
        </div>
      </div>
    </div>
  )
}

/* ───────────────────── 結果一覧画面 ───────────────────── */
function ResultsPage({ filtered, items, filters, setFilters, searchText, setSearchText, onBack, onSelectItem, downloadLeads = [], onUpdateItem, currentUser, salesReps, settings = {}, allListSources = [], onAddNew }) {
  const [callRecordTarget, setCallRecordTarget] = useState(null)
  const [showFilterPanel, setShowFilterPanel] = useState(false)
  const [selectMode, setSelectMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState(new Set())
  const [showEmailModal, setShowEmailModal] = useState(false)
  const [sortKey, setSortKey] = useState('default')

  const sortedFiltered = useMemo(() => {
    if (sortKey === 'nextCallDate') {
      return [...filtered].sort((a, b) => {
        if (!a.nextCallDate && !b.nextCallDate) return 0
        if (!a.nextCallDate) return 1
        if (!b.nextCallDate) return -1
        return a.nextCallDate.localeCompare(b.nextCallDate)
      })
    }
    if (sortKey === 'priority') {
      return [...filtered].sort((a, b) => calcPriorityScore(b, downloadLeads) - calcPriorityScore(a, downloadLeads))
    }
    if (sortKey === 'lastCall') {
      return [...filtered].sort((a, b) => {
        const aLast = (a.callHistory || []).length > 0 ? (a.callHistory[a.callHistory.length - 1].date || '') : ''
        const bLast = (b.callHistory || []).length > 0 ? (b.callHistory[b.callHistory.length - 1].date || '') : ''
        if (!aLast && !bLast) return 0
        if (!aLast) return 1
        if (!bLast) return -1
        return aLast.localeCompare(bLast)
      })
    }
    return filtered
  }, [filtered, sortKey, downloadLeads])

  const toggleSelect = (e, id) => {
    e.stopPropagation()
    setSelectedIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }
  const toggleSelectAll = () => {
    if (selectedIds.size === filtered.length) setSelectedIds(new Set())
    else setSelectedIds(new Set(filtered.map(i => i.id)))
  }
  const exitSelectMode = () => { setSelectMode(false); setSelectedIds(new Set()) }

  const handleSendEmail = (targets, template) => {
    const now = new Date().toISOString()
    targets.forEach(item => {
      onUpdateItem({
        ...item,
        emailStatus: '送信済み',
        emailSentAt: now,
        emailTemplateId: template?.id || '',
        emailTemplateName: template?.name || '',
      })
    })
    setShowEmailModal(false)
    exitSelectMode()
  }

  const setFilter = (key, value) => setFilters(prev => ({ ...prev, [key]: value }))

  const addCallRecord = (item, record) => {
    const { nextCallDate, contactName: newContactName, ...callRecord } = record
    const updated = {
      ...item,
      callHistory: [...(item.callHistory || []), { ...callRecord, caller: currentUser?.name || '', id: crypto.randomUUID() }],
      status: item.status === '未架電' ? '架電済' : item.status,
      ...(nextCallDate ? { nextCallDate } : {}),
      ...(newContactName ? { contactName: newContactName } : {}),
    }
    onUpdateItem(updated)
    setCallRecordTarget(null)
    if (record.result === 'アポ獲得') {
      handlePromote(updated)
    }
  }

  const toggleKeep = (e, item) => {
    e.stopPropagation()
    if (item.status === 'アポ確定') return
    const keepActive = isKeepActive(item)
    if (keepActive && item.keptBy && item.keptBy !== currentUser?.name) return
    const newKept = !keepActive
    const now = new Date().toISOString()
    const updated = {
      ...item,
      isKept: newKept,
      keptBy: newKept ? (currentUser?.name || '') : '',
      keptAt: newKept ? now : '',
      keepHistory: newKept
        ? [...(item.keepHistory || []), { id: crypto.randomUUID(), date: now, by: currentUser?.name || '' }]
        : (item.keepHistory || []),
    }
    onUpdateItem(updated)
  }

  const handleClearAll = () => {
    setFilters({ status: [], industry: [], salesRep: [], callCount: '', employeeScale: [], kept: '', callDateFrom: '', callDateTo: '', emailStatus: '', callResult: [], listSource: [], nextCallDateUntil: '', prefecture: [], hasContact: '', callType: [], callContent: [], keepHasHistory: '', keepCountMin: '', keepDateFrom: '', keepDateTo: '', keepBy: [] })
    setSearchText('')
  }

  // アクティブフィルタ数
  const activeFilterCount = [
    filters.status.length > 0,
    filters.industry.length > 0,
    filters.salesRep.length > 0,
    filters.callCount,
    filters.employeeScale.length > 0,
    filters.kept,
    filters.callDateFrom,
    filters.callDateTo,
    filters.emailStatus,
    filters.callResult.length > 0,
    (filters.listSource || []).length > 0,
    filters.nextCallDateUntil,
    searchText.trim(),
  ].filter(Boolean).length

  // バッジ一覧（個別に解除できるもの）
  const filterBadges = []
  if (filters.status.length) filters.status.forEach(s => filterBadges.push({ label: s, onRemove: () => setFilters(prev => ({ ...prev, status: prev.status.filter(v => v !== s) })) }))
  if (filters.industry.length) filters.industry.forEach(s => filterBadges.push({ label: s, onRemove: () => setFilters(prev => ({ ...prev, industry: prev.industry.filter(v => v !== s) })) }))
  if (filters.salesRep.length) filters.salesRep.forEach(s => filterBadges.push({ label: s, onRemove: () => setFilters(prev => ({ ...prev, salesRep: prev.salesRep.filter(v => v !== s) })) }))
  if (filters.employeeScale.length) filters.employeeScale.forEach(s => filterBadges.push({ label: s, onRemove: () => setFilters(prev => ({ ...prev, employeeScale: prev.employeeScale.filter(v => v !== s) })) }))
  if (filters.callCount) {
    const label = filters.callCount === '0' ? '未架電' : filters.callCount === '1-3' ? '1〜3回' : '4回以上'
    filterBadges.push({ label, onRemove: () => setFilter('callCount', '') })
  }
  if (filters.kept === 'true') filterBadges.push({ label: 'Keep中', onRemove: () => setFilter('kept', '') })
  if (filters.kept === 'false') filterBadges.push({ label: 'Keep以外', onRemove: () => setFilter('kept', '') })
  if (filters.keepHasHistory === 'true') filterBadges.push({ label: 'Keep履歴あり', onRemove: () => setFilter('keepHasHistory', '') })
  if (filters.keepCountMin) filterBadges.push({ label: `Keep${filters.keepCountMin}回以上`, onRemove: () => setFilter('keepCountMin', '') })
  if (filters.keepDateFrom || filters.keepDateTo) filterBadges.push({ label: `Keep日: ${filters.keepDateFrom || '...'} 〜 ${filters.keepDateTo || '...'}`, onRemove: () => setFilters(prev => ({ ...prev, keepDateFrom: '', keepDateTo: '' })) })
  if ((filters.keepBy || []).length) filters.keepBy.forEach(s => filterBadges.push({ label: `Keep担当:${s}`, onRemove: () => setFilters(prev => ({ ...prev, keepBy: prev.keepBy.filter(v => v !== s) })) }))
  if (filters.callDateFrom || filters.callDateTo) {
    filterBadges.push({ label: `架電: ${filters.callDateFrom || '...'} 〜 ${filters.callDateTo || '...'}`, onRemove: () => setFilters(prev => ({ ...prev, callDateFrom: '', callDateTo: '' })) })
  }
  if (filters.emailStatus) filterBadges.push({ label: filters.emailStatus, onRemove: () => setFilter('emailStatus', '') })
  if (filters.callResult.length) filters.callResult.forEach(s => filterBadges.push({ label: `結果:${s}`, onRemove: () => setFilters(prev => ({ ...prev, callResult: prev.callResult.filter(v => v !== s) })) }))
  if ((filters.listSource || []).length) (filters.listSource || []).forEach(s => filterBadges.push({ label: `リスト:${s}`, onRemove: () => setFilters(prev => ({ ...prev, listSource: (prev.listSource || []).filter(v => v !== s) })) }))
  if (filters.nextCallDateUntil) filterBadges.push({ label: `次回〜${filters.nextCallDateUntil}`, onRemove: () => setFilter('nextCallDateUntil', '') })

  return (
    <div>
      {/* ヘッダー */}
      <div className="flex items-center justify-between mb-4">
        {selectMode ? (
          <button onClick={exitSelectMode} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 font-medium transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
            選択解除
          </button>
        ) : (
          <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-[#4a82ae] hover:text-[#2d6a9e] font-medium transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            検索に戻る
          </button>
        )}
        <div className="flex items-center gap-2">
          {selectMode ? (
            <>
              <button onClick={toggleSelectAll} className="text-xs text-[#4a82ae] hover:text-[#2d6a9e] px-2 py-1">
                {selectedIds.size === filtered.length ? '全解除' : '全選択'}
              </button>
              <button
                onClick={() => setShowEmailModal(true)}
                disabled={selectedIds.size === 0}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-[#2d6a9e] rounded-lg hover:bg-[#1a5285] disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75" />
                </svg>
                {selectedIds.size > 0 ? `${selectedIds.size}件に送信` : 'メール送信'}
              </button>
            </>
          ) : (
            <>
              <h2 className="text-base font-bold text-slate-800">
                <span className="text-[#2d6a9e] text-lg">{filtered.length}</span>
                <span className="text-sm font-normal text-slate-500 ml-1">/ 全{items.length}件</span>
              </h2>
              <select value={sortKey} onChange={e => setSortKey(e.target.value)}
                className="text-xs border border-slate-200 rounded-md px-2 py-1.5 text-slate-600 bg-white focus:outline-none">
                <option value="default">登録順</option>
                <option value="nextCallDate">次回架電日順</option>
                <option value="priority">優先度順</option>
                <option value="lastCall">最終架電（古い順）</option>
              </select>
              <button
                onClick={() => setSelectMode(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75" />
                </svg>
                メール送信
              </button>
            </>
          )}
        </div>
      </div>

      {/* 検索 + 絞り込みパネル */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm mb-4">
        {/* キーワード + 絞り込みトグル */}
        <div className="flex items-center gap-2 px-3 py-3">
          <div className="relative flex-1">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              value={searchText}
              onChange={e => setSearchText(e.target.value)}
              placeholder="企業名・担当者名・電話番号・メモ..."
              className="w-full border border-slate-200 rounded-lg pl-9 pr-3 py-2 text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-[#6e9bbf] focus:bg-white placeholder:text-slate-400"
            />
            {searchText && (
              <button onClick={() => setSearchText('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
          <button
            onClick={() => setShowFilterPanel(v => !v)}
            className={`flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg border transition-colors whitespace-nowrap ${
              showFilterPanel
                ? 'bg-[#2d6a9e] text-white border-[#2d6a9e]'
                : activeFilterCount > 0
                  ? 'bg-sky-50 text-[#2d6a9e] border-[#6e9bbf]'
                  : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'
            }`}>
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L13 13.414V19a1 1 0 01-.553.894l-4 2A1 1 0 017 21v-7.586L3.293 6.707A1 1 0 013 6V4z" />
            </svg>
            絞り込み
            {activeFilterCount > 0 && (
              <span className={`text-xs px-1.5 py-0.5 rounded-full font-bold ${showFilterPanel ? 'bg-white text-[#2d6a9e]' : 'bg-[#2d6a9e] text-white'}`}>
                {activeFilterCount}
              </span>
            )}
          </button>
          {activeFilterCount > 0 && (
            <button onClick={handleClearAll}
              className="text-xs text-slate-400 hover:text-slate-600 whitespace-nowrap px-1">
              クリア
            </button>
          )}
        </div>

        {/* アクティブフィルタバッジ */}
        {filterBadges.length > 0 && !showFilterPanel && (
          <div className="flex flex-wrap gap-1.5 px-3 pb-3">
            {filterBadges.map((b, i) => (
              <span key={i}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-sky-50 text-[#2d6a9e] border border-sky-200">
                {b.label}
                <button onClick={b.onRemove} className="hover:text-[#1a5285] leading-none">&times;</button>
              </span>
            ))}
          </div>
        )}

        {/* 折りたたみフィルターパネル */}
        {showFilterPanel && (
          <div className="border-t border-slate-100 px-3 pb-4 pt-3">
            <div className="grid grid-cols-3 gap-3 mb-3">
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">ステータス</label>
                <MultiSelect selected={filters.status} onChange={v => setFilter('status', v)} options={TELEAPO_STATUSES} placeholder="すべて" fullWidth />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">業種</label>
                <MultiSelect selected={filters.industry} onChange={v => setFilter('industry', v)} options={INDUSTRIES} placeholder="すべて" fullWidth />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">担当営業</label>
                <MultiSelect selected={filters.salesRep} onChange={v => setFilter('salesRep', v)} options={salesReps} placeholder="すべて" fullWidth />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">架電回数</label>
                <select value={filters.callCount} onChange={e => setFilter('callCount', e.target.value)}
                  className="w-full border border-slate-300 rounded-lg px-2.5 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#6e9bbf]">
                  <option value="">すべて</option>
                  <option value="0">0回（未架電）</option>
                  <option value="1-3">1〜3回</option>
                  <option value="4+">4回以上</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">従業員規模</label>
                <MultiSelect selected={filters.employeeScale} onChange={v => setFilter('employeeScale', v)} options={EMPLOYEE_SCALES} placeholder="すべて" fullWidth />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Keep状態</label>
                <select value={filters.kept} onChange={e => setFilter('kept', e.target.value)}
                  className="w-full border border-slate-300 rounded-lg px-2.5 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#6e9bbf]">
                  <option value="">すべて</option>
                  <option value="true">Keep中のみ</option>
                  <option value="false">Keep以外</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Keep履歴</label>
                <select value={filters.keepHasHistory} onChange={e => setFilter('keepHasHistory', e.target.value)}
                  className="w-full border border-slate-300 rounded-lg px-2.5 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#6e9bbf]">
                  <option value="">すべて</option>
                  <option value="true">Keep履歴あり（過去含む）</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Keep回数</label>
                <select value={filters.keepCountMin} onChange={e => setFilter('keepCountMin', e.target.value)}
                  className="w-full border border-slate-300 rounded-lg px-2.5 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#6e9bbf]">
                  <option value="">すべて</option>
                  <option value="1">1回以上</option>
                  <option value="2">2回以上</option>
                  <option value="3">3回以上</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Keep担当者</label>
                <MultiSelect selected={filters.keepBy || []} onChange={v => setFilter('keepBy', v)} options={salesReps} placeholder="すべて" fullWidth />
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-medium text-slate-500 mb-1">Keep日付</label>
                <div className="flex items-center gap-2">
                  <input type="date" value={filters.keepDateFrom || ''} onChange={e => setFilter('keepDateFrom', e.target.value)}
                    className="flex-1 border border-slate-300 rounded-lg px-2.5 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#6e9bbf]" />
                  <span className="text-xs text-slate-400">〜</span>
                  <input type="date" value={filters.keepDateTo || ''} onChange={e => setFilter('keepDateTo', e.target.value)}
                    className="flex-1 border border-slate-300 rounded-lg px-2.5 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#6e9bbf]" />
                </div>
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-medium text-slate-500 mb-1">架電日時</label>
                <div className="flex items-center gap-2">
                  <input type="date" value={filters.callDateFrom || ''} onChange={e => setFilter('callDateFrom', e.target.value)}
                    className="flex-1 border border-slate-300 rounded-lg px-2.5 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#6e9bbf]" />
                  <span className="text-xs text-slate-400">〜</span>
                  <input type="date" value={filters.callDateTo || ''} onChange={e => setFilter('callDateTo', e.target.value)}
                    className="flex-1 border border-slate-300 rounded-lg px-2.5 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#6e9bbf]" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">メール送信ステータス</label>
                <select value={filters.emailStatus || ''} onChange={e => setFilter('emailStatus', e.target.value)}
                  className="w-full border border-slate-300 rounded-lg px-2.5 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#6e9bbf]">
                  <option value="">すべて</option>
                  {EMAIL_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-medium text-slate-500 mb-1">架電結果（累積履歴に含む）</label>
                <MultiSelect selected={filters.callResult} onChange={v => setFilter('callResult', v)} options={CALL_RESULTS} placeholder="すべて" fullWidth />
              </div>
              {allListSources.length > 0 && (
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">リストソース</label>
                  <MultiSelect selected={filters.listSource || []} onChange={v => setFilter('listSource', v)} options={allListSources} placeholder="すべて" fullWidth />
                </div>
              )}
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">次回架電日（この日まで）</label>
                <input type="date" value={filters.nextCallDateUntil || ''} onChange={e => setFilter('nextCallDateUntil', e.target.value)}
                  className="w-full border border-slate-300 rounded-lg px-2.5 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#6e9bbf]" />
              </div>
            </div>
            {activeFilterCount > 0 && (
              <button onClick={handleClearAll}
                className="text-xs text-slate-500 hover:text-slate-700 underline">
                すべての条件をクリア
              </button>
            )}
          </div>
        )}
      </div>

      {/* カードリスト */}
      <div className="space-y-3">
        {sortedFiltered.length === 0 ? (
          <div className="text-center py-16 text-slate-400">
            <p className="text-base mb-1">該当する企業がありません</p>
            <p className="text-xs mb-5">検索条件を変更してお試しください</p>
            {searchText.trim() && onAddNew && (
              <button
                onClick={() => onAddNew(searchText.trim())}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#2d6a9e] text-white text-sm rounded-lg hover:bg-[#1a5285] transition-colors"
              >
                <span className="text-lg leading-none">+</span>
                「{searchText.trim()}」を新規追加
              </button>
            )}
          </div>
        ) : sortedFiltered.map(item => {
          const history = item.callHistory || []
          const lastCall = history.length > 0 ? history[history.length - 1] : null
          const priority = calcPriorityScore(item, downloadLeads)
          const keepActive = isKeepActive(item)
          const isOtherKeep = keepActive && item.keptBy && item.keptBy !== currentUser?.name
          const isAppoConfirmed = item.status === 'アポ確定'
          const appoDate = isAppoConfirmed
            ? (item.appoDate || history.find(c => c.result === 'アポ獲得')?.date || null)
            : null
          const phone = item.recruitmentPhone || item.phone

          const isSelected = selectedIds.has(item.id)
          const today = new Date().toISOString().slice(0, 10)
          return (
            <div key={item.id}
              onClick={() => selectMode ? toggleSelect({ stopPropagation: () => {} }, item.id) : onSelectItem(item)}
              className={`bg-white rounded-xl border shadow-sm cursor-pointer transition-all hover:shadow-md ${
                isSelected ? 'border-[#2d6a9e] ring-1 ring-[#2d6a9e]' :
                isAppoConfirmed ? 'border-teal-400 border-2' :
                isOtherKeep ? 'opacity-60 border-slate-200' :
                keepActive ? 'border-amber-400 border-2' :
                'border-slate-200 hover:border-slate-300'
              }`}>

              {/* Row 1: 企業名 + バッジ + Keep */}
              <div className="px-4 pt-4 pb-3 flex items-start gap-2 flex-wrap">
                {selectMode && (
                  <input type="checkbox" checked={isSelected} onChange={e => toggleSelect(e, item.id)}
                    onClick={e => e.stopPropagation()}
                    className="mt-0.5 w-4 h-4 rounded border-slate-300 text-[#2d6a9e] focus:ring-[#6e9bbf] flex-shrink-0 cursor-pointer" />
                )}
                <span className="text-[15px] font-semibold text-slate-800">
                  <CompanyLink name={item.companyName} />
                </span>
                {/* 社名がGoogle検索リンクになったため、詳細パネルの入口を明示する。
                    カード下半分は元から伝播を止めており、押せるのはこの行だけ。 */}
                <button
                  onClick={e => { e.stopPropagation(); onSelectItem(item) }}
                  title="この企業の詳細を開く"
                  className="mr-1 px-2 py-0.5 rounded-md text-xs font-medium text-[#2d6a9e] bg-[#2d6a9e]/10 hover:bg-[#2d6a9e]/20 transition-colors flex-shrink-0"
                >
                  詳細
                </button>
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${TELEAPO_STATUS_COLORS[item.status] || 'bg-slate-100 text-slate-600'}`}>
                  {item.status}
                </span>
                {priority > 0 && (
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${PRIORITY_COLORS[priority]}`}>
                    優先 {PRIORITY_LABELS[priority]}
                  </span>
                )}
                {item.emailStatus && item.emailStatus !== '未送信' && (
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${EMAIL_STATUS_COLORS[item.emailStatus]}`}>
                    {item.emailStatus}
                  </span>
                )}
                <div className="ml-auto flex-shrink-0">
                  {isAppoConfirmed ? null : isOtherKeep ? (
                    <span className="px-3 py-1 rounded-full text-xs font-medium bg-amber-50 border border-amber-200 text-amber-700">
                      🔒 {item.keptBy}がKeep中
                    </span>
                  ) : (
                    <button onClick={(e) => toggleKeep(e, item)}
                      className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                        keepActive
                          ? 'bg-amber-50 border-amber-300 text-amber-700'
                          : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'
                      }`}>
                      {keepActive ? 'Keep解除' : 'Keep'}
                    </button>
                  )}
                </div>
              </div>

              {/* メインボディ: 左=会社情報 / 右=電話・架電記録 */}
              <div className="mx-4 mb-4 grid grid-cols-[5fr_7fr] gap-2" onClick={e => e.stopPropagation()}>

                {/* 左カラム: 業種・規模・メタ情報 */}
                <div className="bg-slate-50 rounded-xl px-3 py-2.5">
                  {item.industry && (
                    <p className="text-base font-bold text-slate-700 leading-tight">{item.industry}</p>
                  )}
                  {item.employeeScale && (
                    <p className="text-sm font-semibold text-slate-500 mt-0.5">{item.employeeScale}</p>
                  )}
                  {item.contactName && (
                    <div className="mt-2 flex items-center gap-1.5">
                      <span className="text-[10px] text-slate-400 font-bold">担当者</span>
                      <span className="text-sm font-semibold text-[#2d6a9e]">{item.contactName}</span>
                    </div>
                  )}
                  <div className="mt-2 space-y-1 text-sm text-slate-500">
                    {item.prefecture && <p>{item.prefecture}</p>}
                    {keepActive && item.keptBy
                      ? <p>Keep: {item.keptBy}</p>
                      : isAppoConfirmed && item.salesRep && item.salesRep !== '未確定' && <p>担当: {item.salesRep}</p>
                    }
                    {appoDate && (
                      <p className="text-teal-600 font-medium">
                        アポ獲得日: {new Date(appoDate).toLocaleDateString('ja-JP', { year: 'numeric', month: 'numeric', day: 'numeric' })}
                      </p>
                    )}
                    {item.appointmentDate && (
                      <p className="text-indigo-600 font-medium">
                        アポイント日: {new Date(item.appointmentDate + 'T00:00:00').toLocaleDateString('ja-JP', { year: 'numeric', month: 'numeric', day: 'numeric' })}
                      </p>
                    )}
                    {item.nextCallDate && (
                      <p className={item.nextCallDate < today ? 'text-rose-500 font-medium' : item.nextCallDate === today ? 'text-amber-500 font-medium' : 'text-sky-500'}>
                        次回: {new Date(item.nextCallDate + 'T00:00:00').toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' })}
                      </p>
                    )}
                    {item.listSource && <p className="text-slate-400">{item.listSource}</p>}
                  </div>
                  <div className="mt-2 pt-2 border-t border-slate-200 text-sm text-slate-500">
                    架電 <span className="font-bold text-slate-700">{history.length}回</span>
                    {(item.keepHistory || []).length > 0 && (
                      <> · Keep <span className="font-bold text-slate-700">{(item.keepHistory || []).length}回</span></>
                    )}
                  </div>
                </div>

                {/* 右カラム: 電話番号 + 直近架電 + ボタン */}
                <div className="flex flex-col gap-1.5">

                  {/* 電話番号 + 架電ボタン */}
                  <div className="bg-slate-50 rounded-xl px-3 py-2 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      {item.recruitmentPhone && (
                        <div className={item.phone ? 'mb-1' : ''}>
                          <p className="text-[10px] text-teal-600 font-bold mb-0.5">採用直通</p>
                          <a href={`zoomphonecall://${item.recruitmentPhone}`} onClick={e => e.stopPropagation()} className="text-sm font-bold text-teal-700 hover:underline">
                            {item.recruitmentPhone}
                          </a>
                        </div>
                      )}
                      {item.phone && (
                        <div className={item.recruitmentPhone ? 'border-t border-slate-200 pt-1' : ''}>
                          {item.recruitmentPhone && <p className="text-[10px] text-slate-400 font-medium mb-0.5">代表</p>}
                          <a href={`zoomphonecall://${item.phone}`} onClick={e => e.stopPropagation()} className="text-sm font-medium text-slate-700 hover:underline">
                            {item.phone}
                          </a>
                        </div>
                      )}
                      {!phone && <p className="text-xs text-slate-400">電話番号未登録</p>}
                    </div>
                    {!isAppoConfirmed && !isOtherKeep && phone && (
                      <a
                        href={`zoomphonecall://${phone}`}
                        onClick={e => e.stopPropagation()}
                        className="flex-shrink-0 px-4 py-1.5 rounded-lg bg-[#2d6a9e] text-white text-xs font-medium hover:bg-[#1a5285] transition-colors">
                        架電
                      </a>
                    )}
                  </div>

                  {/* 直近架電 */}
                  <div className="bg-slate-50 rounded-xl px-3 py-2 flex-1">
                    <p className="text-[10px] text-slate-400 font-bold mb-1">直近架電</p>
                    {lastCall ? (() => {
                      const resultColor =
                        lastCall.result === 'アポ獲得' ? 'bg-teal-100 text-[#0f766e]' :
                        lastCall.result === '断り' ? 'bg-rose-100 text-[#be123c]' :
                        lastCall.result === '折り返し依頼' ? 'bg-amber-100 text-amber-700' :
                        'bg-sky-100 text-[#2d6a9e]'
                      const callDate = lastCall.date
                        ? new Date(lastCall.date).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
                        : ''
                      return (
                        <>
                          <div className="flex items-center gap-2 flex-wrap mb-1.5">
                            <span className={`text-sm font-bold px-2.5 py-0.5 rounded-md ${resultColor}`}>
                              {lastCall.result}
                            </span>
                            {callDate && <span className="text-sm text-slate-400">{callDate}</span>}
                          </div>
                          <div className="flex flex-wrap gap-x-4 gap-y-0.5">
                            {lastCall.callContent && <p className="text-sm text-slate-600"><span className="text-slate-400">内容</span> {lastCall.callContent}</p>}
                            {lastCall.callType && <p className="text-sm text-slate-600"><span className="text-slate-400">区分</span> {lastCall.callType}</p>}
                            {lastCall.rejectionReason && <p className="text-sm text-rose-500"><span className="text-slate-400 font-normal">断り</span> {lastCall.rejectionReason}</p>}
                            {lastCall.note && <p className="text-sm text-slate-600 w-full"><span className="text-slate-400">メモ</span> {lastCall.note}</p>}
                          </div>
                        </>
                      )
                    })() : (
                      <p className="text-xs text-slate-400">まだ記録がありません</p>
                    )}
                  </div>

                  {/* 架電を記録ボタン */}
                  {!isAppoConfirmed && (
                    <div className="flex justify-end">
                      {isOtherKeep ? (
                        <span className="text-xs text-slate-400 py-1.5">Keep中</span>
                      ) : (
                        <button
                          onClick={() => setCallRecordTarget(item)}
                          className="px-3 py-1.5 text-xs font-medium rounded-lg bg-[#2d6a9e] text-white hover:bg-[#1a5285] transition-colors">
                          架電を記録
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {callRecordTarget && (
        <CallRecordModal
          onSave={(record) => addCallRecord(callRecordTarget, record)}
          onClose={() => setCallRecordTarget(null)}
        />
      )}

      {showEmailModal && (
        <EmailSendModal
          selectedItems={filtered.filter(i => selectedIds.has(i.id))}
          settings={settings}
          onClose={() => setShowEmailModal(false)}
          onSend={handleSendEmail}
        />
      )}
    </div>
  )
}

/* ───────────────────── ダウンロードリード画面 ───────────────────── */
function DownloadLeads({ leads = [], teleapoItems = [], proposedNames = new Set(), onAddToList }) {
  const [search, setSearch] = useState('')
  const [showUncalledOnly, setShowUncalledOnly] = useState(false)

  // テレアポリストの会社名セット（照合用）
  const teleapoNames = useMemo(() =>
    new Set(teleapoItems.map(i => (i.companyName || '').trim().toLowerCase()))
  , [teleapoItems])

  const filtered = useMemo(() => {
    let list = [...leads].sort((a, b) => {
      // 未リスト企業を優先表示
      const aInList = teleapoNames.has((a.companyName || '').trim().toLowerCase())
      const bInList = teleapoNames.has((b.companyName || '').trim().toLowerCase())
      if (aInList !== bInList) return aInList ? 1 : -1
      // 次に日付降順
      return new Date(b.date || 0) - new Date(a.date || 0)
    })
    if (showUncalledOnly) {
      list = list.filter(l => !teleapoNames.has((l.companyName || '').trim().toLowerCase()))
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      list = list.filter(l =>
        [l.companyName, l.name, l.email, l.tel].filter(Boolean).join(' ').toLowerCase().includes(q)
      )
    }
    return list
  }, [leads, teleapoNames, showUncalledOnly, search])

  if (leads.length === 0) {
    return (
      <div className="text-center py-20 text-slate-400">
        <p className="text-lg mb-1">ダウンロード履歴がありません</p>
        <p className="text-sm">CF7 Webhook連携が完了するとここに表示されます</p>
      </div>
    )
  }

  return (
    <div>
      {/* ヘッダー */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h2 className="text-lg font-bold text-slate-800">
            ダウンロードリード <span className="text-[#2d6a9e]">{filtered.length}</span>
            <span className="text-sm font-normal text-slate-500 ml-1">/ 全{leads.length}件</span>
          </h2>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 text-sm text-slate-600 cursor-pointer">
            <input type="checkbox" checked={showUncalledOnly} onChange={e => setShowUncalledOnly(e.target.checked)}
              className="rounded border-slate-300" />
            未リストのみ表示
          </label>
          <input
            type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="会社名・メール・電話で検索..."
            className="border border-slate-300 rounded-md px-3 py-1.5 text-sm w-56 focus:outline-none focus:ring-2 focus:ring-[#6e9bbf]"
          />
        </div>
      </div>

      {/* テーブル */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 sticky top-0">
              <tr>
                <th className="px-3 py-2.5 text-left text-xs font-medium text-slate-500">DL日時</th>
                <th className="px-3 py-2.5 text-left text-xs font-medium text-slate-500">会社名</th>
                <th className="px-3 py-2.5 text-left text-xs font-medium text-slate-500">担当者名</th>
                <th className="px-3 py-2.5 text-left text-xs font-medium text-slate-500">メール</th>
                <th className="px-3 py-2.5 text-left text-xs font-medium text-slate-500">電話番号</th>
                <th className="px-3 py-2.5 text-left text-xs font-medium text-slate-500">テレアポ</th>
                <th className="px-3 py-2.5 text-left text-xs font-medium text-slate-500">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((lead, i) => {
                const name = (lead.companyName || '').trim().toLowerCase()
                const inList = teleapoNames.has(name)
                const isProposed = proposedNames.has(name)
                return (
                  <tr key={i} className={`hover:bg-sky-50/50 transition-colors ${!inList && !isProposed ? 'bg-amber-50/30' : ''}`}>
                    <td className="px-3 py-2.5 whitespace-nowrap text-xs text-slate-500">
                      {lead.date ? new Date(lead.date).toLocaleDateString('ja-JP') : '-'}
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <span className="font-medium text-slate-800">{lead.companyName || '-'}</span>
                      {!inList && !isProposed && (
                        <span className="ml-1.5 text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full font-medium">未リスト</span>
                      )}
                      {inList && (
                        <span className="ml-1.5 text-xs bg-teal-50 text-teal-700 px-1.5 py-0.5 rounded-full">リスト済</span>
                      )}
                      {isProposed && (
                        <span className="ml-1.5 text-xs bg-rose-50 text-rose-600 px-1.5 py-0.5 rounded-full font-medium">提案済</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap text-slate-600 text-xs">{lead.name || '-'}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap text-slate-500 text-xs">
                      <a href={`mailto:${lead.email}`} className="hover:text-[#2d6a9e] hover:underline">{lead.email || '-'}</a>
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap text-slate-600 text-xs font-medium">
                      {lead.tel
                        ? <a href={`tel:${lead.tel}`} className="text-[#2d6a9e] hover:underline">{lead.tel}</a>
                        : '-'
                      }
                    </td>
                    <td className="px-3 py-2.5 text-xs text-slate-400">
                      {inList ? 'あり' : '−'}
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      {!inList && !isProposed && (
                        <button
                          onClick={() => onAddToList(lead)}
                          className="px-2.5 py-1 text-xs bg-[#2d6a9e] text-white rounded hover:bg-[#1a5285] transition-colors">
                          リストに追加
                        </button>
                      )}
                      {isProposed && (
                        <span className="text-xs text-rose-400">追加不可</span>
                      )}
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
export default function TeleapoList({ items, setItems, onPromote, proposals = [], currentUser, users = [], downloadLeads = [], settings = {}, initialFilter, onFilterConsumed }) {
  const [subTab, setSubTab] = useState('list') // 'list' | 'downloads'
  const [page, setPage] = useState('search') // 'search' | 'results'
  const [showModal, setShowModal] = useState(false)

  // 日付をまたいだKeepを起動時に自動解除
  useEffect(() => {
    setItems(prev => {
      let changed = false
      const next = prev.map(item => {
        if (item.isKept && !isKeepActive(item)) {
          changed = true
          return { ...item, isKept: false, keptBy: '', keptAt: '' }
        }
        return item
      })
      return changed ? next : prev
    })
  }, [])
  const [showCsvImport, setShowCsvImport] = useState(false)
  const [editItem, setEditItem] = useState(null)
  const [initialCompanyName, setInitialCompanyName] = useState('')
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
    emailStatus: '',
    callResult: [],
    listSource: [],
    nextCallDateUntil: '',
    prefecture: [],
    hasContact: '',
    callType: [],
    callContent: [],
    keepHasHistory: '',
    keepCountMin: '',
    keepDateFrom: '',
    keepDateTo: '',
    keepBy: [],
  })

  // ダッシュボードからのフィルタ適用
  useEffect(() => {
    if (initialFilter) {
      const tf = initialFilter._teleapoRepFilter || []
      const toArr = v => !v ? [] : Array.isArray(v) ? v : [v]
      setFilters({
        status: toArr(initialFilter.status),
        industry: toArr(initialFilter.industry),
        salesRep: initialFilter.salesRep ? toArr(initialFilter.salesRep) : tf,
        callCount: '',
        employeeScale: toArr(initialFilter.employeeScale),
        kept: '',
        callDateFrom: initialFilter.callDateFrom || '',
        callDateTo: initialFilter.callDateTo || '',
        emailStatus: '',
        callResult: [],
        listSource: [],
        nextCallDateUntil: '',
        keepHasHistory: '',
        keepCountMin: '',
        keepDateFrom: '',
        keepDateTo: '',
        keepBy: [],
      })
      setSearchText('')
      setPage('results')
      onFilterConsumed?.()
    }
  }, [initialFilter])

  // 登録ユーザー + 既存データから営業担当を統合
  const salesReps = useMemo(() => {
    const set = new Set(users.map(u => u.name))
    items.forEach(i => { if (i.salesRep) set.add(i.salesRep) })
    proposals.forEach(p => { if (p.salesRep) set.add(p.salesRep) })
    const sorted = [...set].filter(r => r !== '未確定').sort()
    return ['未確定', ...sorted]
  }, [items, proposals, users])

  const allListSources = useMemo(() => {
    const set = new Set()
    items.forEach(i => { if (i.listSource) set.add(i.listSource) })
    return [...set].sort()
  }, [items])

  const allPrefectures = useMemo(() => {
    const set = new Set()
    items.forEach(i => { if (i.prefecture) set.add(i.prefecture) })
    return [...set].sort()
  }, [items])

  const proposedNames = useMemo(() => {
    return new Set(proposals.map(p => (p.companyName || '').trim().toLowerCase()).filter(Boolean))
  }, [proposals])

  const filtered = useMemo(() => {
    const q = searchText.trim().toLowerCase()
    return items.filter(item => {
      if (filters.status.length && !filters.status.includes(item.status)) return false
      if (filters.industry.length && !filters.industry.includes(item.industry)) return false
      if (filters.salesRep.length && !filters.salesRep.includes(item.salesRep)) return false
      if (filters.employeeScale.length && !filters.employeeScale.includes(item.employeeScale)) return false
      if (filters.kept === 'true' && !isKeepActive(item)) return false
      if (filters.kept === 'false' && isKeepActive(item)) return false
      // Keep履歴フィルター
      const kh = item.keepHistory || []
      if (filters.keepHasHistory === 'true' && kh.length === 0 && !isKeepActive(item)) return false
      if (filters.keepCountMin) {
        const totalKeeps = kh.length + (isKeepActive(item) ? 1 : 0)
        if (totalKeeps < parseInt(filters.keepCountMin)) return false
      }
      if (filters.keepDateFrom || filters.keepDateTo) {
        const from = filters.keepDateFrom ? new Date(filters.keepDateFrom + 'T00:00:00') : null
        const to = filters.keepDateTo ? new Date(filters.keepDateTo + 'T23:59:59') : null
        const allKeeps = [...kh, ...(isKeepActive(item) && item.keptAt ? [{ date: item.keptAt }] : [])]
        if (!allKeeps.some(k => {
          if (!k.date) return false
          const d = new Date(k.date)
          if (from && d < from) return false
          if (to && d > to) return false
          return true
        })) return false
      }
      if ((filters.keepBy || []).length) {
        const allKeepers = [...kh.map(k => k.by), ...(isKeepActive(item) && item.keptBy ? [item.keptBy] : [])]
        if (!allKeepers.some(b => filters.keepBy.includes(b))) return false
      }
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
      if (filters.emailStatus) {
        const status = item.emailStatus || '未送信'
        if (status !== filters.emailStatus) return false
      }
      if (filters.callResult.length) {
        const history = item.callHistory || []
        if (!history.some(c => filters.callResult.includes(c.result))) return false
      }
      if ((filters.listSource || []).length && !filters.listSource.includes(item.listSource || '')) return false
      if (filters.nextCallDateUntil && (!item.nextCallDate || item.nextCallDate > filters.nextCallDateUntil)) return false
      if ((filters.prefecture || []).length && !filters.prefecture.includes(item.prefecture || '')) return false
      if (filters.hasContact === 'true' && !item.contactName) return false
      if (filters.hasContact === 'false' && item.contactName) return false
      if ((filters.callType || []).length) {
        const history = item.callHistory || []
        if (!history.some(c => filters.callType.includes(c.callType))) return false
      }
      if ((filters.callContent || []).length) {
        const history = item.callHistory || []
        if (!history.some(c => filters.callContent.includes(c.callContent))) return false
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
    if (item.status === 'アポ確定' && !item.salesRep) {
      alert('アポ確定の場合は担当営業を設定してください。')
      return
    }
    const isNew = !items.some(i => i.id === item.id)
    if (isNew) {
      const name = (item.companyName || '').trim().toLowerCase()
      if (name) {
        const existingNames = new Set(items.map(i => (i.companyName || '').trim().toLowerCase()))
        if (existingNames.has(name)) {
          const ok = window.confirm(`「${item.companyName}」はすでにテレアポリストに登録されています。\n重複して追加しますか？`)
          if (!ok) return
        } else if (proposedNames.has(name)) {
          const ok = window.confirm(`「${item.companyName}」はすでに提案リストに登録されています。\nテレアポリストにも追加しますか？`)
          if (!ok) return
        }
      }
    }
    if (!isNew && item.status === 'アポ確定') {
      const prev = items.find(i => i.id === item.id)
      if (!prev || prev.status !== 'アポ確定') {
        const promoted = {
          ...item,
          isKept: false,
          keptBy: '',
          keptAt: '',
          ...(!item.salesRep || item.salesRep === '未確定') && currentUser?.name ? { salesRep: currentUser.name } : {},
        }
        setItems(prev => prev.map(i => i.id === promoted.id ? promoted : i))
        onPromote(promoted)
        setShowModal(false)
        setEditItem(null)
        return
      }
    }
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
    const updated = {
      ...item,
      status: 'アポ確定',
      isKept: false,
      keptBy: '',
      keptAt: '',
      ...(!item.salesRep || item.salesRep === '未確定') && currentUser?.name ? { salesRep: currentUser.name } : {},
    }
    setItems(prev => prev.map(i => i.id === updated.id ? updated : i))
    onPromote(updated)
    setSelectedItem(null)
  }

  const handleEdit = (item) => {
    setEditItem(item)
    setShowModal(true)
    setSelectedItem(null)
  }

  const handleCsvImport = (imported, skippedProposed) => {
    setItems(prev => [...prev, ...imported])
    setShowCsvImport(false)
    if (skippedProposed > 0) {
      alert(`${skippedProposed}件は提案リストに登録済みのためスキップされました。`)
    }
  }

  const handleUpdateItems = (updates) => {
    setItems(prev => prev.map(item => {
      const upd = updates.find(u => u.id === item.id)
      return upd ? { ...item, ...upd } : item
    }))
  }

  const stats = useMemo(() => {
    const total = items.length
    const kept = items.filter(i => isKeepActive(i)).length
    const called = items.filter(i => (i.callHistory || []).length > 0).length
    const appo = items.filter(i => i.status === 'アポ確定').length
    return { total, kept, called, appo }
  }, [items])

  // ダウンロードリードをテレアポリストに追加（提案済みはUIで弾くが念のため二重チェック）
  const handleAddDownloadToList = (lead) => {
    const name = (lead.companyName || '').trim().toLowerCase()
    if (name && proposedNames.has(name)) return
    const newItem = {
      id: crypto.randomUUID(),
      companyName: lead.companyName || '',
      phone: lead.tel || '',
      contactName: lead.name || '',
      email: lead.email || '',
      industry: '',
      employeeScale: '',
      salesRep: '未確定',
      status: '未架電',
      isKept: false,
      memo: `資料DL: ${lead.date ? new Date(lead.date).toLocaleDateString('ja-JP') : ''}`,
      callHistory: [],
      keepHistory: [],
    }
    setItems(prev => [...prev, newItem])
    setSubTab('list')
  }

  return (
    <div>
      {/* サブタブ切り替え */}
      <div className="flex gap-1 mb-5 border-b border-slate-200">
        {[
          { id: 'list', label: 'テレアポリスト', count: items.length },
          { id: 'downloads', label: 'ダウンロードリード', count: downloadLeads.length, badge: downloadLeads.filter(l => !new Set(items.map(i => (i.companyName||'').trim().toLowerCase())).has((l.companyName||'').trim().toLowerCase())).length },
        ].map(tab => (
          <button key={tab.id} onClick={() => setSubTab(tab.id)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-1.5 ${
              subTab === tab.id
                ? 'border-[#2d6a9e] text-[#2d6a9e]'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}>
            {tab.label}
            <span className={`text-xs px-1.5 py-0.5 rounded-full ${subTab === tab.id ? 'bg-[#e8f0f8] text-[#2d6a9e]' : 'bg-slate-100 text-slate-500'}`}>
              {tab.count}
            </span>
            {tab.badge > 0 && (
              <span className="text-xs px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium">
                未{tab.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ダウンロードリードタブ */}
      {subTab === 'downloads' && (
        <DownloadLeads
          leads={downloadLeads}
          teleapoItems={items}
          proposedNames={proposedNames}
          onAddToList={handleAddDownloadToList}
        />
      )}

      {/* テレアポリストタブ */}
      {subTab === 'list' && page === 'search' && (
        <SearchPage
          filters={filters}
          setFilters={setFilters}
          searchText={searchText}
          setSearchText={setSearchText}
          onSearch={() => setPage('results')}
          stats={stats}
          salesReps={salesReps}
          allListSources={allListSources}
          allPrefectures={allPrefectures}
          onAddNew={() => { setEditItem(null); setShowModal(true) }}
          onCsvImport={() => setShowCsvImport(true)}
        />
      )}

      {subTab === 'list' && page === 'results' && (
        <ResultsPage
          filtered={filtered}
          items={items}
          filters={filters}
          setFilters={setFilters}
          searchText={searchText}
          setSearchText={setSearchText}
          onBack={() => setPage('search')}
          onSelectItem={setSelectedItem}
          downloadLeads={downloadLeads}
          onUpdateItem={updated => setItems(prev => prev.map(i => i.id === updated.id ? updated : i))}
          currentUser={currentUser}
          salesReps={salesReps}
          settings={settings}
          allListSources={allListSources}
          onAddNew={name => { setInitialCompanyName(name); setEditItem(null); setShowModal(true) }}
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
          initialCompanyName={initialCompanyName}
          onSave={handleSave}
          onClose={() => { setShowModal(false); setEditItem(null); setInitialCompanyName('') }}
        />
      )}

      {/* CSV Import Modal */}
      {showCsvImport && (
        <TeleapoCsvImport
          onImport={handleCsvImport}
          onClose={() => setShowCsvImport(false)}
          existingItems={items}
          proposedItems={proposals}
          salesReps={salesReps}
          settings={settings}
          onUpdateItems={handleUpdateItems}
        />
      )}
    </div>
  )
}
