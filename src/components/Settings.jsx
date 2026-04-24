import { useState } from 'react'

export default function Settings({ settings, setSettings, users, setUsers, currentUser, syncStatus, onSync }) {
  const [newUserName, setNewUserName] = useState('')
  const [newUserPassword, setNewUserPassword] = useState('')
  const [userError, setUserError] = useState('')
  const [userSuccess, setUserSuccess] = useState('')

  const handleAddUser = () => {
    setUserError('')
    setUserSuccess('')
    const trimmed = newUserName.trim()
    if (!trimmed) {
      setUserError('名前を入力してください')
      return
    }
    if (users.some(u => u.name === trimmed)) {
      setUserError('この名前は既に登録されています')
      return
    }
    const user = {
      id: crypto.randomUUID(),
      name: trimmed,
      password: newUserPassword || '',
      createdAt: new Date().toISOString(),
    }
    setUsers(prev => [...prev, user])
    setNewUserName('')
    setNewUserPassword('')
    setUserSuccess(`${trimmed} を追加しました`)
    setTimeout(() => setUserSuccess(''), 2000)
  }

  const handleDeleteUser = (userId) => {
    if (userId === currentUser?.id) return
    const user = users.find(u => u.id === userId)
    if (confirm(`${user.name} を削除しますか？`)) {
      setUsers(prev => prev.filter(u => u.id !== userId))
    }
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

        {/* URL input */}
        <div className="space-y-2 mb-4">
          <label className="text-sm font-medium text-slate-600">Apps Script Web App URL</label>
          <div className="flex gap-2">
            <input
              type="text"
              value={urlInput}
              onChange={e => setUrlInput(e.target.value)}
              placeholder="https://script.google.com/macros/s/..."
              className="flex-1 border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              onClick={handleSaveUrl}
              className="px-4 py-2 bg-[#2d6a9e] text-white text-sm rounded-md hover:bg-[#1a5285] transition-colors whitespace-nowrap"
            >
              {urlSaved ? '保存済み ✓' : '保存'}
            </button>
          </div>
        </div>

        {/* Manual sync button */}
        <div className="flex items-center gap-3">
          <button
            onClick={onSync}
            disabled={!settings.sheetSyncUrl || syncStatus?.status === 'loading'}
            className="px-4 py-2 bg-emerald-600 text-white text-sm rounded-md hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
            </svg>
            今すぐ同期
          </button>
          {statusInfo && <span className={`text-sm ${statusInfo.color}`}>{statusInfo.text}</span>}
        </div>

        {/* Setup instructions */}
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

      {/* User Management */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-base font-semibold text-slate-700 mb-4 flex items-center gap-2">
          <svg className="w-5 h-5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" />
          </svg>
          ユーザー管理
        </h3>

        {/* User list */}
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
                <button
                  onClick={() => handleDeleteUser(u.id)}
                  className="text-xs text-red-400 hover:text-red-600 transition-colors"
                >
                  削除
                </button>
              )}
            </div>
          ))}
        </div>

        {/* Add new user */}
        <div className="border-t border-slate-100 pt-4">
          <p className="text-sm font-medium text-slate-600 mb-2">ユーザーを追加</p>
          <div className="flex gap-2">
            <input
              type="text"
              value={newUserName}
              onChange={e => setNewUserName(e.target.value)}
              placeholder="名前"
              className="flex-1 border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <input
              type="password"
              value={newUserPassword}
              onChange={e => setNewUserPassword(e.target.value)}
              placeholder="パスワード（任意）"
              className="flex-1 border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <button
              onClick={handleAddUser}
              className="px-4 py-2 bg-[#2d6a9e] text-white text-sm rounded-md hover:bg-[#1a5285] transition-colors whitespace-nowrap"
            >
              追加
            </button>
          </div>
          {userError && <p className="text-sm text-red-500 mt-2">{userError}</p>}
          {userSuccess && <p className="text-sm text-green-600 mt-2">{userSuccess}</p>}
        </div>
      </div>

    </div>
  )
}
