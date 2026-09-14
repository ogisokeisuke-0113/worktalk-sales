import { parsePhones } from '../lib/phone'

/**
 * 電話番号の表示と発信リンク
 *
 * 登録値は取り込み元の都合で空白や注記が混ざっていることがある。
 *   "（大代表） 03-5462-9611" / "03- 5431-7750" / " 03-5730-0660"
 * 表示は登録されたままにして（注記も営業には意味がある）、
 * 発信するときだけ番号を取り出す。
 *
 * 1つの欄に複数の番号が入っている場合（本部/大阪拠点、新卒/中途など）は
 * それぞれを選んでかけられるようにする。
 */
export default function PhoneLinks({ value, className = '', linkClassName = '' }) {
  const raw = String(value || '')
  if (!raw.trim()) return null
  const phones = parsePhones(raw)

  // 番号として取り出せない値（「記載なし」、先頭0が欠けた数字など）は
  // リンクにせず、登録内容をそのまま見せる。誤った番号にかけないため。
  if (phones.length === 0) {
    return (
      <span className={`${className} text-slate-500`} title="この値からは発信できません">
        {raw}
      </span>
    )
  }

  if (phones.length === 1) {
    return (
      <a
        href={`zoomphonecall://${phones[0].digits}`}
        onClick={e => e.stopPropagation()}
        className={`${className} ${linkClassName} hover:underline`}
        title={`Zoom Phone で ${phones[0].digits} に発信`}
      >
        {raw}
      </a>
    )
  }

  return (
    <span className={className}>
      {phones.map(p => (
        <span key={p.digits} className="block">
          <a
            href={`zoomphonecall://${p.digits}`}
            onClick={e => e.stopPropagation()}
            className={`${linkClassName} hover:underline`}
            title={`Zoom Phone で ${p.digits} に発信`}
          >
            {p.raw}
          </a>
          {p.label && <span className="ml-1 text-xs text-slate-400">（{p.label}）</span>}
        </span>
      ))}
    </span>
  )
}
