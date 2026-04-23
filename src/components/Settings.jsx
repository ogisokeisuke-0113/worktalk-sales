import { useState } from 'react'

export default function Settings({ settings, setSettings, users, setUsers, currentUser }) {
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

  return (
    <div className="max-w-2xl space-y-6">
      <h2 className="text-xl font-bold text-slate-800">設定</h2>

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
