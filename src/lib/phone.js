/**
 * 電話番号の取り出し
 *
 * 登録されている値は salesbrain からの取り込みなどで、
 * 前後に空白が入っていたり、注記が混ざっていたりする。
 *
 *   " 03-5730-0660"
 *   "03- 5431-7750"
 *   "（大代表） 03-5462-9611"
 *   "052-586-1166 （FAX:052-586-1167）"
 *   "06-6352-3573（本部）\n06-6354-0023　（大阪拠点）"
 *
 * そのままでは発信できないので、発信するときだけ番号を取り出して使う。
 * 表示は登録されたままにする（注記も営業には意味がある情報なので消さない）。
 */

// 市外局番から始まる日本の固定・携帯・IP電話。区切りは半角/全角ハイフン・空白いずれも許す。
// 区切りは「-」「‐」「－」「空白」「全角空白」。"03- 5431-7750" のように
// 2つ続くこともあるので {0,2} まで許す（無制限にすると改行をまたいで
// 別の番号とつながってしまう）。
const PHONE = /0\d{1,4}[-‐-－\s　]{0,2}\d{1,4}[-‐-－\s　]{0,2}\d{3,4}/g
// FAX番号は発信対象から外す。間違えてFAXにかけると相手にも迷惑がかかる。
const FAX = /(fax|ｆａｘ|ＦＡＸ|ファックス|ファクス|ＦＡＸ番号)/i

const toDigits = s => String(s || '').replace(/[^\d]/g, '')

/**
 * 文字列から発信できる番号を取り出す。
 * @returns {{raw:string, digits:string, label:string}[]}
 */
export function parsePhones(text) {
  const src = String(text || '')
  if (!src.trim()) return []
  const out = []
  const seen = new Set()

  for (const m of src.matchAll(PHONE)) {
    const raw = m[0]
    const digits = toDigits(raw)
    // 10桁(固定)・11桁(携帯/IP)以外は番号として扱わない。
    // 途中で切れたFAX番号などを誤って拾わないため。
    if (digits.length !== 10 && digits.length !== 11) continue

    // 直前30文字に FAX の表記があれば飛ばす
    const before = src.slice(Math.max(0, m.index - 30), m.index)
    if (FAX.test(before)) continue

    if (seen.has(digits)) continue
    seen.add(digits)

    // 番号の直後にある括弧書きを見出しにする（本部 / 大阪拠点 / 新卒 など）
    const after = src.slice(m.index + raw.length, m.index + raw.length + 24)
    const note = after.match(/^[\s　]*[（(]([^）)]{1,12})[）)]/)
    // 番号の直前にある括弧書きも拾う（（大代表） 03-... の形）
    const preNote = before.match(/[（(]([^）)]{1,12})[）)][\s　]*$/)
    out.push({ raw, digits, label: (note && note[1]) || (preNote && preNote[1]) || '' })
  }
  return out
}

/** 発信用のURL。取り出せなければ null（リンクにしない） */
export function dialHref(textOrDigits) {
  const d = typeof textOrDigits === 'string' && /^\d{10,11}$/.test(textOrDigits)
    ? textOrDigits
    : (parsePhones(textOrDigits)[0] || {}).digits
  return d ? `zoomphonecall://${d}` : null
}
