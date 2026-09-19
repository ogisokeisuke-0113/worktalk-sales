/**
 * 差分同期
 *
 * Realtime は「つながっている間」の変更しか届かない。
 * スリープ・Wi-Fi切替・タブ放置で接続が切れると、その間の変更は二度と来ず、
 * 再読み込みするまで古いままになる。
 *
 * ここでは updated_at を頼りに「前回以降に変わった行」だけを取りに行って埋める。
 * 全件(9,646行)を取り直さないので、通常は数件〜数十件で済む。
 *
 * 取りこぼしを埋めるだけで、送信側には触れない。
 * 未送信の変更を持っている行は queue.applyRemote が弾くので、上書きの心配はない。
 */

const INTERVAL = 60 * 1000

export function startLiveSync({ api, queue, setItems, since, onApplied }) {
  if (!api?.fetchSince) return () => {}
  let cursor = since || null
  let running = false
  let stopped = false

  async function pull(reason) {
    if (stopped || running) return
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return
    running = true
    try {
      const res = await api.fetchSince(cursor)
      if (!res) return
      const { rows, cursor: next } = res
      if (next) cursor = next
      if (!rows.length) return
      let applied = 0
      for (const row of rows) {
        if (!row?.id || !row?.data) continue
        // 自分が編集中・未送信の行は queue 側で弾かれる
        const before = queue.state?.latest?.find(x => x.id === row.id)
        if (before && JSON.stringify(before) === JSON.stringify(row.data)) continue
        queue.applyRemote(setItems, row)
        applied++
      }
      if (applied) {
        console.info(`[livesync] ${applied}件を反映しました (${reason})`)
        onApplied?.(applied)
      }
    } catch (e) {
      console.warn('[livesync] 差分取得に失敗:', e && e.message)
    } finally {
      running = false
    }
  }

  const timer = setInterval(() => pull('定期'), INTERVAL)
  // 画面に戻った直後がいちばん古い。待たずに取りに行く。
  const onVisible = () => { if (document.visibilityState === 'visible') pull('画面復帰') }
  const onOnline = () => pull('通信復帰')
  document.addEventListener('visibilitychange', onVisible)
  window.addEventListener('online', onOnline)

  return () => {
    stopped = true
    clearInterval(timer)
    document.removeEventListener('visibilitychange', onVisible)
    window.removeEventListener('online', onOnline)
  }
}
