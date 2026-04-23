import { useState } from 'react'

export default function LoginScreen({ users, onLogin, onRegister }) {
  const [mode, setMode] = useState(users.length === 0 ? 'register' : 'login')
  const [selectedUser, setSelectedUser] = useState('')
  const [password, setPassword] = useState('')
  const [newName, setNewName] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [error, setError] = useState('')

  const handleLogin = (e) => {
    e.preventDefault()
    setError('')
    if (!selectedUser) {
      setError('ユーザーを選択してください')
      return
    }
    const user = users.find(u => u.name === selectedUser)
    if (!user) {
      setError('ユーザーが見つかりません')
      return
    }
    if (user.password && user.password !== password) {
      setError('パスワードが正しくありません')
      return
    }
    if (!user.password && password) {
      setError('パスワードが正しくありません')
      return
    }
    onLogin(user)
  }

  const handleRegister = (e) => {
    e.preventDefault()
    setError('')
    const trimmed = newName.trim()
    if (!trimmed) {
      setError('名前を入力してください')
      return
    }
    if (users.some(u => u.name === trimmed)) {
      setError('この名前は既に使用されています')
      return
    }
    const user = {
      id: crypto.randomUUID(),
      name: trimmed,
      password: newPassword || '',
      createdAt: new Date().toISOString(),
    }
    onRegister(user)
    onLogin(user)
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#2d6a9e] to-[#1a5285] flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">Sales Board</h1>
          <p className="text-white/60 text-sm">営業管理システム</p>
        </div>

        <div className="bg-white rounded-xl shadow-2xl p-6">
          {/* Mode toggle */}
          {users.length > 0 && (
            <div className="flex mb-6 bg-slate-100 rounded-lg p-1">
              <button
                onClick={() => { setMode('login'); setError('') }}
                className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${
                  mode === 'login' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'
                }`}
              >
                ログイン
              </button>
              <button
                onClick={() => { setMode('register'); setError('') }}
                className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${
                  mode === 'register' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'
                }`}
              >
                新規登録
              </button>
            </div>
          )}

          {mode === 'login' ? (
            <form onSubmit={handleLogin}>
              <div className="mb-4">
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  ユーザー
                </label>
                <select
                  value={selectedUser}
                  onChange={e => setSelectedUser(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#2d6a9e] focus:border-transparent bg-white"
                >
                  <option value="">選択してください</option>
                  {users.map(u => (
                    <option key={u.id} value={u.name}>{u.name}</option>
                  ))}
                </select>
              </div>
              <div className="mb-5">
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  パスワード
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="パスワードを入力"
                  className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#2d6a9e] focus:border-transparent"
                />
                <p className="text-xs text-slate-400 mt-1">未設定の場合は空欄でOK</p>
              </div>
              {error && <p className="text-sm text-red-500 mb-3">{error}</p>}
              <button
                type="submit"
                className="w-full py-2.5 bg-[#2d6a9e] text-white text-sm font-medium rounded-lg hover:bg-[#1a5285] transition-colors"
              >
                ログイン
              </button>
            </form>
          ) : (
            <form onSubmit={handleRegister}>
              {users.length === 0 && (
                <p className="text-sm text-slate-600 mb-4 bg-blue-50 p-3 rounded-lg">
                  初めてのご利用ですね。まずはユーザーを登録してください。
                </p>
              )}
              <div className="mb-4">
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  名前（担当者名）
                </label>
                <input
                  type="text"
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  placeholder="例：田中太郎"
                  className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#2d6a9e] focus:border-transparent"
                />
              </div>
              <div className="mb-5">
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  パスワード（任意）
                </label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  placeholder="設定しない場合は空欄"
                  className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#2d6a9e] focus:border-transparent"
                />
              </div>
              {error && <p className="text-sm text-red-500 mb-3">{error}</p>}
              <button
                type="submit"
                className="w-full py-2.5 bg-[#2d6a9e] text-white text-sm font-medium rounded-lg hover:bg-[#1a5285] transition-colors"
              >
                登録してはじめる
              </button>
            </form>
          )}
        </div>

        <p className="text-center text-white/40 text-xs mt-6">
          &copy; Sales Board
        </p>
      </div>
    </div>
  )
}
