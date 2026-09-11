import { useEffect, useState } from 'react'

/**
 * 保存状態の表示。
 *
 * これが無かったとき、upsert の失敗は console.warn だけで、
 * 成功も失敗も画面上はまったく同じに見えていた。
 * そのせいで「たまに記録が消える」が誰にも検知できず、447件失われるまで気づけなかった。
 */
export default function SaveIndicator() {
  const [state, setState] = useState(null)

  useEffect(() => {
    let hideTimer = null
    const onSave = ev => {
      const d = ev.detail || {}
      clearTimeout(hideTimer)
      if (d.state === 'saving') {
        setState({ kind: 'saving', n: d.n || 0 })
      } else if (d.state === 'saved') {
        if (!d.n) return
        setState({ kind: 'saved', n: d.n })
        hideTimer = setTimeout(() => setState(null), 2200)
      } else if (d.state === 'error') {
        setState({ kind: 'error', n: d.n || 0, msg: d.msg })
      } else if (d.state === 'authError') {
        setState({ kind: 'authError', n: d.n || 0, msg: d.msg })
      } else if (d.state === 'staleDelete') {
        // 保存の失敗表示が出ているときは、そちらを優先して隠さない
        setState(prev => (prev && (prev.kind === 'error' || prev.kind === 'authError')) ? prev : { kind: 'staleDelete' })
        hideTimer = setTimeout(() => setState(null), 8000)
      }
    }
    window.addEventListener('wt-save', onSave)
    return () => { window.removeEventListener('wt-save', onSave); clearTimeout(hideTimer) }
  }, [])

  if (!state) return null

  const retryNow = () => {
    const g = globalThis.__wtQueues
    if (g) Object.values(g).forEach(q => q.flush && q.flush())
  }

  // 保存中/保存済みはただの通知なのでクリックを透過させる。
  // 透過させないと右下に重なったボタンが押せなくなる。
  const style = {
    saving: 'bg-slate-100 text-slate-700 pointer-events-none',
    saved: 'bg-emerald-50 text-emerald-800 pointer-events-none',
    error: 'bg-rose-50 text-rose-800 cursor-pointer',
    authError: 'bg-amber-50 text-amber-900 cursor-pointer ring-2 ring-amber-400',
    staleDelete: 'bg-sky-50 text-sky-900 cursor-pointer',
  }[state.kind]

  return (
    <div
      role="status"
      onClick={
        state.kind === 'error' ? retryNow
        : (state.kind === 'authError' || state.kind === 'staleDelete') ? () => window.location.reload()
        : undefined
      }
      className={`fixed right-4 bottom-4 z-[9999] flex items-center gap-2 px-4 py-2.5 rounded-lg shadow-lg text-sm font-medium max-w-[82vw] ${style}`}
    >
      {state.kind === 'saving' && <span>保存中… {state.n}件</span>}
      {state.kind === 'saved' && <span>保存しました {state.n}件</span>}
      {state.kind === 'error' && (
        <span>⚠ 保存できていません（未送信 {state.n}件・再試行中）タップで即時再送</span>
      )}
      {state.kind === 'staleDelete' && (
        <span>他の人が企業を削除しました。タップして再読み込みすると反映されます</span>
      )}
      {state.kind === 'authError' && (
        <span>⚠ ログインが必要です（未送信 {state.n}件）タップして再読み込み → ログインしてください</span>
      )}
    </div>
  )
}
