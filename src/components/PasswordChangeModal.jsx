import { useState } from 'react'
import { supabase } from '../lib/supabase'

/**
 * パスワード変更
 *
 * 最初は window.prompt で済ませていたが、
 * prompt はテキスト入力なので打っているパスワードが画面に丸見えになる。
 * 肩越しに見られる場面のほうが多い営業現場では使えない。
 */
export default function PasswordChangeModal({ onClose }) {
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  const submit = async e => {
    e.preventDefault()
    setError('')
    if (pw.length < 8) { setError('8文字以上にしてください'); return }
    if (pw !== pw2) { setError('確認用と一致しません'); return }
    setBusy(true)
    try {
      const { error } = await supabase.auth.updateUser({ password: pw })
      if (error) setError(`変更できませんでした: ${error.message}`)
      else setDone(true)
    } finally {
      setBusy(false)
    }
  }

  const INPUT = 'w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#2d6a9e] focus:border-transparent'

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-xl w-full max-w-sm" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <h3 className="text-base font-bold text-slate-800">パスワードを変更</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-2xl leading-none">×</button>
        </div>

        {done ? (
          <div className="px-5 py-6">
            <p className="text-sm text-emerald-700 bg-emerald-50 rounded-lg px-3 py-3 mb-4">
              パスワードを変更しました。次回からは新しいパスワードでログインしてください。
            </p>
            <button onClick={onClose} className="w-full py-2.5 bg-[#2d6a9e] text-white text-sm font-medium rounded-lg hover:bg-[#1a5285]">
              閉じる
            </button>
          </div>
        ) : (
          <form onSubmit={submit} className="px-5 py-4">
            <div className="mb-3">
              <label className="block text-sm font-medium text-slate-700 mb-1.5">新しいパスワード</label>
              <input
                type={show ? 'text' : 'password'} value={pw} onChange={e => setPw(e.target.value)}
                autoComplete="new-password" placeholder="8文字以上" className={INPUT}
              />
            </div>
            <div className="mb-2">
              <label className="block text-sm font-medium text-slate-700 mb-1.5">確認のためもう一度</label>
              <input
                type={show ? 'text' : 'password'} value={pw2} onChange={e => setPw2(e.target.value)}
                autoComplete="new-password" placeholder="同じものを入力" className={INPUT}
              />
            </div>
            <label className="flex items-center gap-2 text-xs text-slate-500 mb-4 cursor-pointer">
              <input type="checkbox" checked={show} onChange={e => setShow(e.target.checked)} />
              入力内容を表示する
            </label>
            {error && <p className="text-sm text-red-600 mb-3">{error}</p>}
            <div className="flex gap-2">
              <button type="button" onClick={onClose} className="flex-1 py-2.5 text-sm text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200">
                キャンセル
              </button>
              <button
                type="submit" disabled={busy || !pw || !pw2}
                className="flex-1 py-2.5 text-sm text-white bg-[#2d6a9e] rounded-lg hover:bg-[#1a5285] disabled:opacity-40"
              >
                {busy ? '変更中…' : '変更する'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
