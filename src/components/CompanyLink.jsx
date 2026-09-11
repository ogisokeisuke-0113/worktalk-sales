/**
 * 社名をクリックすると、その会社名でのGoogle検索結果を別タブで開く。
 *
 * テレアポ一覧はカード全体をクリックすると詳細パネルが開く作りなので、
 * stopPropagation を入れないと「Google検索 + 詳細パネル」が同時に起きる。
 */
export default function CompanyLink({ name, className = '', title }) {
  if (!name) return null
  const href = `https://www.google.com/search?q=${encodeURIComponent(name)}`
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={e => e.stopPropagation()}
      title={title || `「${name}」をGoogleで検索`}
      className={`hover:underline decoration-dotted underline-offset-2 cursor-pointer ${className}`}
    >
      {name}
    </a>
  )
}
