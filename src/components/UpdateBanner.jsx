import { useEffect, useRef, useState } from 'react'
import { watchAppUpdate, markReloadTarget, canAutoReload, clearReloadGuard } from '../lib/appUpdate'

/* 予告してから再読み込みするまでの秒数 */
const GRACE_SEC = 30
/* 入力中でも、これだけ経ったら更新する */
const MAX_WAIT_MS = 5 * 60 * 1000

/* 入力途中かどうか。モーダルが開いている／文字を打ち込んだ入力欄がある場合は待つ。
   ここで待たずに再読み込みすると、書きかけのメモが消える。 */
function isEditing() {
  try {
    if (document.querySelector('div.fixed.inset-0')) return true
    const el = document.activeElement
    if (el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) && String(el.value || '').trim()) return true
    return false
  } catch {
    return false
  }
}

/* 未送信ぶんを送り切る。送れなければ端末に預ける。
   戻り値 true = 送信済みなので再読み込みして安全。 */
async function settleQueues() {
  const queues = Object.values(globalThis.__wtQueues || {})
  if (!queues.length) return true
  for (const q of queues) {
    try { await q.flush() } catch { /* 下で判定する */ }
  }
  const pending = queues.filter(q => {
    try { return q.isPending && q.isPending() } catch { return false }
  })
  if (!pending.length) return true
  // 送れなかった分は預けておく。新しいコードが起動時に送り直す。
  for (const q of pending) {
    try { await q.saveOutbox() } catch { /* noop */ }
  }
  return false
}

export default function UpdateBanner() {
  const [available, setAvailable] = useState(false)
  const [left, setLeft] = useState(GRACE_SEC)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')
  const [manualOnly, setManualOnly] = useState(false)
  const since = useRef(0)
  const target = useRef(null)

  useEffect(() => {
    clearReloadGuard()
    return watchAppUpdate(next => {
      since.current = Date.now()
      target.current = next
      // 同じ版を狙って何度も再読み込みしている＝配信が追いついていない。
      // それ以上は自動で往復せず、本人の操作に委ねる。
      if (!canAutoReload(next)) setManualOnly(true)
      setAvailable(true)
    })
  }, [])

  const reload = async () => {
    if (busy) return
    setBusy(true)
    setNote('保存中の内容を送信しています…')
    const clean = await settleQueues()
    setNote(clean ? '更新しています…' : '未送信の内容を保存しました。更新後に送信します…')
    if (target.current) markReloadTarget(target.current)
    setTimeout(() => window.location.reload(), clean ? 200 : 900)
  }

  useEffect(() => {
    if (!available || busy || manualOnly) return
    const t = setInterval(() => {
      setLeft(prev => {
        const next = prev - 1
        if (next > 0) return next
        // 入力中は待つ。ただし待ちすぎないよう上限を設ける。
        if (isEditing() && Date.now() - since.current < MAX_WAIT_MS) return 5
        reload()
        return 0
      })
    }, 1000)
    return () => clearInterval(t)
  }, [available, busy, manualOnly])

  if (!available) return null

  return (
    <div role="status" className="fixed top-0 inset-x-0 z-[60] bg-[#1a5285] text-white shadow-lg">
      <div className="max-w-5xl mx-auto px-4 py-2.5 flex items-center gap-3 text-sm">
        <span className="font-bold">新しい版があります</span>
        <span className="text-white/80">
          {busy ? note : manualOnly
            ? '「今すぐ更新」を押してください'
            : isEditing()
              ? '入力が終わったら自動で更新します'
              : `${left}秒後に自動で更新します`}
        </span>
        <button
          onClick={reload}
          disabled={busy}
          className="ml-auto px-3 py-1 rounded-md bg-white text-[#1a5285] text-xs font-bold hover:bg-slate-100 disabled:opacity-60">
          {busy ? '更新中…' : '今すぐ更新'}
        </button>
      </div>
    </div>
  )
}
