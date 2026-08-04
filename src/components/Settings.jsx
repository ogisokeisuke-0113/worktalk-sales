import { useState } from 'react'
import { useToast } from './Toast'
import { useConfirm } from './ConfirmDialog'

const INPUT = 'w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent'

function TemplateEditor({ template, onSave, onCancel }) {
  const [form, setForm] = useState({ ...template })
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }))
  return (
    <div className="space-y-3 bg-slate-50 rounded-lg p-4 border border-slate-200">
      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1">テンプレート名</label>
        <input type="text" value={form.name} onChange={e => set('name', e.target.value)} className={INPUT} placeholder="例：アプローチメール" />
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1">件名</label>
        <input type="text" value={form.subject} onChange={e => set('subject', e.target.value)} className={INPUT} placeholder="例：【WorkTalk】ご挨拶のご連絡" />
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1">本文</label>
        <textarea value={form.body} onChange={e => set('body', e.target.value)} rows={8} className={INPUT + ' resize-y font-mono text-xs'} placeholder="{{会社名}} 御中&#10;&#10;突然のご連絡失礼いたします..." />
        <p className="text-[11px] text-slate-400 mt-1">差し込み変数：<code className="bg-slate-100 px-1 rounded">{'{{会社名}}'}</code>　<code className="bg-slate-100 px-1 rounded">{'{{担当者名}}'}</code>　<code className="bg-slate-100 px-1 rounded">{'{{送信者名}}'}</code></p>
      </div>
      <div className="flex gap-2 justify-end">
        <button onClick={onCancel} className="px-3 py-1.5 text-sm text-slate-600 border border-slate-300 rounded-md hover:bg-slate-50">キャンセル</button>
        <button onClick={() => onSave(form)} disabled={!form.name.trim() || !form.subject.trim()} className="px-3 py-1.5 text-sm text-white bg-[#2d6a9e] rounded-md hover:bg-[#1a5285] disabled:opacity-40">保存</button>
      </div>
    </div>
  )
}

export default function Settings({ settings, setSettings, users, setUsers, currentUser, syncStatus, onSync }) {
  const { showToast } = useToast()
  const confirm = useConfirm()
  const [newUserName, setNewUserName] = useState('')
  const [newUserPassword, setNewUserPassword] = useState('')
  const [userError, setUserError] = useState('')
  const [userSuccess, setUserSuccess] = useState('')

  const handleAddUser = () => {
    setUserError('')
    setUserSuccess('')
    const trimmed = newUserName.trim()
    if (!trimmed) { setUserError('名前を入力してください'); return }
    if (users.some(u => u.name === trimmed)) { setUserError('この名前は既に登録されています'); return }
    const user = { id: crypto.randomUUID(), name: trimmed, password: newUserPassword || '', createdAt: new Date().toISOString() }
    setUsers(prev => [...prev, user])
    setNewUserName('')
    setNewUserPassword('')
    setUserSuccess(`${trimmed} を追加しました`)
    setTimeout(() => setUserSuccess(''), 2000)
  }

  const handleDeleteUser = async (userId) => {
    if (userId === currentUser?.id) return
    const user = users.find(u => u.id === userId)
    if (!user) return
    const ok = await confirm({
      title: 'ユーザーを削除',
      message: `${user.name} を削除します。よろしいですか？`,
      confirmText: '削除',
      cancelText: 'キャンセル',
      variant: 'danger',
    })
    if (!ok) return
    setUsers(prev => prev.filter(u => u.id !== userId))
    showToast(`${user.name} を削除しました`, 'success')
  }

  const [urlInput, setUrlInput] = useState(settings.sheetSyncUrl || '')
  const [urlSaved, setUrlSaved] = useState(false)
  const handleSaveUrl = () => {
    setSettings(prev => ({ ...prev, sheetSyncUrl: urlInput.trim() }))
    setUrlSaved(true)
    setTimeout(() => setUrlSaved(false), 2000)
  }

  const syncStatusText = () => {
    if (!syncStatus) return null
    if (syncStatus.status === 'loading') return { color: 'text-blue-600', text: '同期中...' }
    if (syncStatus.status === 'ok') return { color: 'text-green-600', text: `✓ ${syncStatus.count}件を同期しました（${syncStatus.time.toLocaleTimeString()}）` }
    if (syncStatus.status === 'error') return { color: 'text-red-500', text: `✗ エラー: ${syncStatus.message}` }
    return null
  }
  const statusInfo = syncStatusText()

  // メール送信設定
  const [fromInput, setFromInput] = useState(settings.emailFrom || 'noreply@work-talk.jp')
  const [senderNameInput, setSenderNameInput] = useState(settings.emailSenderName || 'WorkTalk営業チーム')
  const [emailSettingSaved, setEmailSettingSaved] = useState(false)
  const handleSaveEmailSettings = () => {
    setSettings(prev => ({ ...prev, emailFrom: fromInput.trim(), emailSenderName: senderNameInput.trim() }))
    setEmailSettingSaved(true)
    setTimeout(() => setEmailSettingSaved(false), 2000)
  }

  // テンプレート管理
  const templates = settings.emailTemplates || []
  const [editingTemplate, setEditingTemplate] = useState(null) // null | 'new' | { id, name, subject, body }
  const handleSaveTemplate = (form) => {
    const isNew = !templates.find(t => t.id === form.id)
    const updated = isNew
      ? [...templates, { ...form, id: crypto.randomUUID() }]
      : templates.map(t => t.id === form.id ? form : t)
    setSettings(prev => ({ ...prev, emailTemplates: updated }))
    setEditingTemplate(null)
    showToast(isNew ? 'テンプレートを追加しました' : 'テンプレートを更新しました', 'success')
  }
  const handleDeleteTemplate = async (id) => {
    const target = templates.find(t => t.id === id)
    const ok = await confirm({
      title: 'テンプレートを削除',
      message: target?.name
        ? `「${target.name}」を削除します。よろしいですか？`
        : 'このテンプレートを削除します。よろしいですか？',
      confirmText: '削除',
      cancelText: 'キャンセル',
      variant: 'danger',
    })
    if (!ok) return
    setSettings(prev => ({ ...prev, emailTemplates: (prev.emailTemplates || []).filter(t => t.id !== id) }))
    showToast('テンプレートを削除しました', 'success')
  }

  return (
    <div className="max-w-2xl space-y-6">
      <h2 className="text-xl font-bold text-slate-800">設定</h2>

      {/* Sheet Sync */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-base font-semibold text-slate-700 mb-1 flex items-center gap-2">
          <svg className="w-5 h-5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.375 19.5h17.25m-17.25 0a1.125 1.125 0 0 1-1.125-1.125M3.375 19.5h1.5C5.496 19.5 6 18.996 6 18.375m-3.75.125v-15.375A1.125 1.125 0 0 1 3.375 3h13.5a1.125 1.125 0 0 1 1.125 1.125v15.75M6 18.375V6.75m0 11.625h12.75M6 18.375h12.75M18.75 18.375V6.75M6 6.75h12.75" />
          </svg>
          スプレッドシート連携
        </h3>
        <p className="text-xs text-slate-400 mb-4">Googleスプレッドシートのデータを起動時に自動で読み込みます</p>
        <div className="space-y-2 mb-4">
          <label className="text-sm font-medium text-slate-600">Apps Script Web App URL</label>
          <div className="flex gap-2">
            <input type="text" value={urlInput} onChange={e => setUrlInput(e.target.value)} placeholder="https://script.google.com/macros/s/..."
              className="flex-1 border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            <button onClick={handleSaveUrl} className="px-4 py-2 bg-[#2d6a9e] text-white text-sm rounded-md hover:bg-[#1a5285] transition-colors whitespace-nowrap">
              {urlSaved ? '保存済み ✓' : '保存'}
            </button>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={onSync} disabled={!settings.sheetSyncUrl || syncStatus?.status === 'loading'}
            className="px-4 py-2 bg-emerald-600 text-white text-sm rounded-md hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
            </svg>
            今すぐ同期
          </button>
          {statusInfo && <span className={`text-sm ${statusInfo.color}`}>{statusInfo.text}</span>}
        </div>
        <details className="mt-5 text-sm text-slate-500">
          <summary className="cursor-pointer font-medium text-slate-600 hover:text-slate-800">設定手順を見る</summary>
          <ol className="mt-3 space-y-2 list-decimal list-inside text-xs leading-relaxed">
            <li>スプレッドシートを開き、メニューから <strong>「拡張機能」→「Apps Script」</strong> を選択</li>
            <li>エディタに下記のコードを貼り付けて保存</li>
            <li><strong>「デプロイ」→「新しいデプロイ」</strong> をクリック</li>
            <li>種類: <strong>「ウェブアプリ」</strong>、アクセス: <strong>「全員」</strong> に設定してデプロイ</li>
            <li>発行されたURLをコピーして上の欄に貼り付けて保存</li>
          </ol>
          <pre className="mt-3 bg-slate-100 rounded p-3 text-xs overflow-x-auto whitespace-pre">{`function doGet() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  var data = sheet.getDataRange().getValues();
  var headers = data[0];
  var rows = data.slice(1).map(function(row, i) {
    var obj = { _rowIndex: i + 2 };
    headers.forEach(function(h, j) {
      var val = row[j];
      if (val instanceof Date) {
        val = Utilities.formatDate(val, 'Asia/Tokyo', 'yyyy-MM-dd');
      }
      obj[h] = val;
    });
    return obj;
  });
  return ContentService
    .createTextOutput(JSON.stringify(rows))
    .setMimeType(ContentService.MimeType.JSON);
}`}</pre>
        </details>
      </div>

      {/* メール送信設定 */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-base font-semibold text-slate-700 mb-4 flex items-center gap-2">
          <svg className="w-5 h-5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75" />
          </svg>
          メール送信設定
        </h3>

        {/* 送信元設定 */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">送信元メールアドレス</label>
            <input type="email" value={fromInput} onChange={e => setFromInput(e.target.value)} className={INPUT} placeholder="noreply@work-talk.jp" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">送信者名</label>
            <input type="text" value={senderNameInput} onChange={e => setSenderNameInput(e.target.value)} className={INPUT} placeholder="WorkTalk営業チーム" />
          </div>
        </div>
        <div className="flex justify-end mb-6">
          <button onClick={handleSaveEmailSettings} className="px-4 py-2 bg-[#2d6a9e] text-white text-sm rounded-md hover:bg-[#1a5285] transition-colors">
            {emailSettingSaved ? '保存済み ✓' : '保存'}
          </button>
        </div>

        {/* テンプレート一覧 */}
        <div className="border-t border-slate-100 pt-4">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-semibold text-slate-700">メールテンプレート</h4>
            {editingTemplate === null && (
              <button onClick={() => setEditingTemplate({ id: '', name: '', subject: '', body: '' })}
                className="px-3 py-1.5 text-xs text-[#2d6a9e] border border-[#2d6a9e] rounded-md hover:bg-sky-50 transition-colors flex items-center gap-1">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
                新規追加
              </button>
            )}
          </div>

          <div className="space-y-2">
            {templates.map(t => (
              <div key={t.id}>
                {editingTemplate?.id === t.id ? (
                  <TemplateEditor template={editingTemplate} onSave={handleSaveTemplate} onCancel={() => setEditingTemplate(null)} />
                ) : (
                  <div className="flex items-start justify-between py-3 px-3 bg-slate-50 rounded-lg border border-slate-200">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-700">{t.name}</p>
                      <p className="text-xs text-slate-400 truncate mt-0.5">{t.subject}</p>
                    </div>
                    <div className="flex gap-2 ml-3 flex-shrink-0">
                      <button onClick={() => setEditingTemplate(t)} className="text-xs text-[#4a82ae] hover:text-[#2d6a9e]">編集</button>
                      <button onClick={() => handleDeleteTemplate(t.id)} className="text-xs text-red-400 hover:text-red-600">削除</button>
                    </div>
                  </div>
                )}
              </div>
            ))}
            {templates.length === 0 && editingTemplate === null && (
              <p className="text-sm text-slate-400 text-center py-4">テンプレートがありません</p>
            )}
            {editingTemplate !== null && editingTemplate.id === '' && (
              <TemplateEditor template={editingTemplate} onSave={handleSaveTemplate} onCancel={() => setEditingTemplate(null)} />
            )}
          </div>
        </div>
      </div>

      {/* User Management */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-base font-semibold text-slate-700 mb-4 flex items-center gap-2">
          <svg className="w-5 h-5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" />
          </svg>
          ユーザー管理
        </h3>
        <div className="space-y-2 mb-4">
          {users.map(u => (
            <div key={u.id} className="flex items-center justify-between py-2 px-3 bg-slate-50 rounded-lg">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-[#2d6a9e] flex items-center justify-center text-xs font-bold text-white">
                  {u.name.charAt(0)}
                </div>
                <div>
                  <span className="text-sm font-medium text-slate-700">{u.name}</span>
                  {u.id === currentUser?.id && (
                    <span className="ml-2 text-xs bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded">自分</span>
                  )}
                </div>
              </div>
              {u.id !== currentUser?.id && (
                <button onClick={() => handleDeleteUser(u.id)} className="text-xs text-red-400 hover:text-red-600 transition-colors">削除</button>
              )}
            </div>
          ))}
        </div>
        <div className="border-t border-slate-100 pt-4">
          <p className="text-sm font-medium text-slate-600 mb-2">ユーザーを追加</p>
          <div className="flex gap-2">
            <input type="text" value={newUserName} onChange={e => setNewUserName(e.target.value)} placeholder="名前"
              className="flex-1 border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
            <input type="password" value={newUserPassword} onChange={e => setNewUserPassword(e.target.value)} placeholder="パスワード（任意）"
              className="flex-1 border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
            <button onClick={handleAddUser} className="px-4 py-2 bg-[#2d6a9e] text-white text-sm rounded-md hover:bg-[#1a5285] transition-colors whitespace-nowrap">追加</button>
          </div>
          {userError && <p className="text-sm text-red-500 mt-2">{userError}</p>}
          {userSuccess && <p className="text-sm text-green-600 mt-2">{userSuccess}</p>}
        </div>
      </div>
    </div>
  )
}
