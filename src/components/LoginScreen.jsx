import { useState } from 'react'
import { supabase } from '../lib/supabase'

/**
 * ログイン画面（Supabase Auth）
 *
 * 以前はユーザー名を選ぶだけで入れた。
 * users テーブルの password は全員空文字だったうえ、そのテーブル自体が
 * 匿名キーで誰でも読めたため、URLさえ知っていれば誰にでもなりすませた。
 * Supabase Auth に移し、DB 側の RLS を authenticated 限定にすることで塞ぐ。
 */
export default function LoginScreen({ onAuthed }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [mode, setMode] = useState('login')   // login | reset
  const [notice, setNotice] = useState('')

  const handleLogin = async e => {
    e.preventDefault()
    setError(''); setNotice(''); setBusy(true)
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      })
      if (error) {
        // Supabase の英語メッセージのままだと営業メンバーに伝わらない
        setError(
          error.message.includes('Invalid login credentials')
            ? 'メールアドレスかパスワードが違います'
            : `ログインできませんでした: ${error.message}`
        )
        return
      }
      onAuthed(data.session)
    } catch (e) {
      setError(`ログインできませんでした: ${e.message}`)
    } finally {
      setBusy(false)
    }
  }

  const handleReset = async e => {
    e.preventDefault()
    setError(''); setNotice(''); setBusy(true)
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: window.location.origin + window.location.pathname,
      })
      if (error) setError(`送信できませんでした: ${error.message}`)
      else setNotice('再設定用のメールを送りました。届かない場合は管理者に連絡してください。')
    } finally {
      setBusy(false)
    }
  }

  const INPUT = 'w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#2d6a9e] focus:border-transparent'

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#2d6a9e] to-[#1a5285] flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">Sales Board</h1>
          <p className="text-white/60 text-sm">営業管理システム</p>
        </div>

        <div className="bg-white rounded-xl shadow-2xl p-6">
          {mode === 'login' ? (
            <form onSubmit={handleLogin}>
              <div className="mb-4">
                <label className="block text-sm font-medium text-slate-700 mb-1.5">メールアドレス</label>
                <input
                  type="email" value={email} onChange={e => setEmail(e.target.value)}
                  autoComplete="username" placeholder="name@my-career.co.jp" className={INPUT}
                />
              </div>
              <div className="mb-5">
                <label className="block text-sm font-medium text-slate-700 mb-1.5">パスワード</label>
                <input
                  type="password" value={password} onChange={e => setPassword(e.target.value)}
                  autoComplete="current-password" placeholder="パスワード" className={INPUT}
                />
              </div>
              {error && <p className="text-sm text-red-600 mb-3">{error}</p>}
              <button
                type="submit" disabled={busy || !email || !password}
                className="w-full py-2.5 bg-[#2d6a9e] text-white text-sm font-medium rounded-lg hover:bg-[#1a5285] transition-colors disabled:opacity-40"
              >
                {busy ? 'ログイン中…' : 'ログイン'}
              </button>
              <button
                type="button" onClick={() => { setMode('reset'); setError(''); setNotice('') }}
                className="w-full mt-3 text-xs text-slate-500 hover:text-slate-700"
              >
                パスワードを忘れた
              </button>
            </form>
          ) : (
            <form onSubmit={handleReset}>
              <p className="text-sm text-slate-600 mb-4 bg-blue-50 p-3 rounded-lg">
                登録しているメールアドレスに、再設定用のリンクを送ります。
              </p>
              <div className="mb-5">
                <label className="block text-sm font-medium text-slate-700 mb-1.5">メールアドレス</label>
                <input
                  type="email" value={email} onChange={e => setEmail(e.target.value)}
                  placeholder="name@my-career.co.jp" className={INPUT}
                />
              </div>
              {error && <p className="text-sm text-red-600 mb-3">{error}</p>}
              {notice && <p className="text-sm text-emerald-700 mb-3">{notice}</p>}
              <button
                type="submit" disabled={busy || !email}
                className="w-full py-2.5 bg-[#2d6a9e] text-white text-sm font-medium rounded-lg hover:bg-[#1a5285] transition-colors disabled:opacity-40"
              >
                {busy ? '送信中…' : '再設定メールを送る'}
              </button>
              <button
                type="button" onClick={() => { setMode('login'); setError(''); setNotice('') }}
                className="w-full mt-3 text-xs text-slate-500 hover:text-slate-700"
              >
                ログインに戻る
              </button>
            </form>
          )}
        </div>

        <p className="text-center text-white/40 text-xs mt-6">&copy; Sales Board</p>
      </div>
    </div>
  )
}
