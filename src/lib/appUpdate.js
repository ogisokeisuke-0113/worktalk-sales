/**
 * 配信中のアプリが新しい版に入れ替わったかを見張る。
 *
 * 配信ファイル名にはビルドごとのハッシュが入る（index-S6colGv5.js）。
 * 読み込み中のファイル名と、いま配信されている index.html のファイル名を
 * 比べるだけで判定できるので、版数を書いたファイルを別に置く必要はない。
 *
 * 古いコードのまま使い続けると、直したはずの不具合が本人だけ残る。
 * 実際、修正を配った後も再読み込みするまで直らない状態が続いていた。
 */

const CHECK_INTERVAL = 3 * 60 * 1000   // 3分おき

/** いま読み込んでいるエントリのファイル名 */
function currentAsset() {
  try {
    const el = document.querySelector('script[type="module"][src*="/assets/index-"]')
    const src = el?.getAttribute('src') || ''
    return src.split('/').pop() || null
  } catch {
    return null
  }
}

/** 配信中の index.html を見て、エントリのファイル名を取る */
async function deployedAsset() {
  const res = await fetch(`${import.meta.env.BASE_URL}?v=${Date.now()}`, { cache: 'no-store' })
  if (!res.ok) throw new Error(`index.html を取得できません (${res.status})`)
  const html = await res.text()
  const m = html.match(/assets\/(index-[A-Za-z0-9_-]+\.js)/)
  return m ? m[1] : null
}

/**
 * 新しい版が出たら onUpdate(次のファイル名) を一度だけ呼ぶ。
 * 戻り値を呼ぶと見張りを止める。
 */
export function watchAppUpdate(onUpdate, { interval = CHECK_INTERVAL } = {}) {
  const mine = currentAsset()
  if (!mine) return () => {}   // 開発サーバーなど、ハッシュ付きでない場合は何もしない
  let stopped = false

  const check = async () => {
    if (stopped || document.visibilityState === 'hidden') return
    try {
      const next = await deployedAsset()
      if (!next || next === mine) return
      stopped = true
      onUpdate(next)
    } catch { /* 通信できないときは次回に回す */ }
  }

  const timer = setInterval(check, interval)
  // 画面に戻ったときは、待たずに見に行く（スリープ明けが一番古い）
  const onVisible = () => { if (document.visibilityState === 'visible') check() }
  document.addEventListener('visibilitychange', onVisible)
  setTimeout(check, 10000)

  return () => {
    stopped = true
    clearInterval(timer)
    document.removeEventListener('visibilitychange', onVisible)
  }
}

/* 再読み込みの歯止め。
   GitHub Pages は配信元ごとにキャッシュ(最大10分)を持つため、更新直後は
   「新しい index.html を見たのに、読み込むと古いまま」が起こりうる。
   歯止めが無いと、そのたびに再読み込みして無限に往復する。 */
const TARGET_KEY = 'wt-update-target'
const TRIES_KEY = 'wt-update-tries'
const MAX_TRIES = 2

export function markReloadTarget(next) {
  try {
    const prev = sessionStorage.getItem(TARGET_KEY)
    const tries = prev === next ? Number(sessionStorage.getItem(TRIES_KEY) || 0) : 0
    sessionStorage.setItem(TARGET_KEY, next)
    sessionStorage.setItem(TRIES_KEY, String(tries + 1))
  } catch { /* noop */ }
}

/** 自動で再読み込みしてよいか。同じ版を狙って2回失敗したら手動だけにする。 */
export function canAutoReload(next) {
  try {
    if (sessionStorage.getItem(TARGET_KEY) !== next) return true
    return Number(sessionStorage.getItem(TRIES_KEY) || 0) < MAX_TRIES
  } catch {
    return true
  }
}

/** 新しい版で起動できたら歯止めを解除する */
export function clearReloadGuard() {
  try {
    const mine = currentAsset()
    if (mine && sessionStorage.getItem(TARGET_KEY) === mine) {
      sessionStorage.removeItem(TARGET_KEY)
      sessionStorage.removeItem(TRIES_KEY)
    }
  } catch { /* noop */ }
}
