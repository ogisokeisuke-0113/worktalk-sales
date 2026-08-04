/**
 * 空状態（Empty State）
 * - データが0件のときに白紙にならないようメッセージ + アクションを表示
 * - variant: 'inbox' | 'chart' | 'search' | 'calls' | 'list' | 'filter'
 *   何も渡さなければ 'inbox' のイラスト
 */

const ICONS = {
  inbox: (
    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.4}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 13.5h3.86a2.25 2.25 0 012.012 1.244l.256.512a2.25 2.25 0 002.013 1.244h3.218a2.25 2.25 0 002.013-1.244l.256-.512a2.25 2.25 0 012.013-1.244h3.859m-19.5.338V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18v-4.162c0-.224-.034-.447-.1-.661L19.24 5.338a2.25 2.25 0 00-2.15-1.588H6.911a2.25 2.25 0 00-2.15 1.588L2.35 13.177a2.25 2.25 0 00-.1.661z" />
    </svg>
  ),
  chart: (
    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.4}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
    </svg>
  ),
  search: (
    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.4}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
    </svg>
  ),
  calls: (
    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.4}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" />
    </svg>
  ),
  list: (
    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.4}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
    </svg>
  ),
  filter: (
    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.4}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 3c2.755 0 5.455.232 8.083.678.533.09.917.556.917 1.096v1.044a2.25 2.25 0 01-.659 1.591l-5.432 5.432a2.25 2.25 0 00-.659 1.591v2.927a2.25 2.25 0 01-1.244 2.013L9.75 21v-6.568a2.25 2.25 0 00-.659-1.591L3.659 7.409A2.25 2.25 0 013 5.818V4.774c0-.54.384-1.006.917-1.096A48.32 48.32 0 0112 3z" />
    </svg>
  ),
}

export default function EmptyState({ icon, variant = 'inbox', title, message, action, className = '', compact = false }) {
  const iconNode = icon || ICONS[variant] || ICONS.inbox
  return (
    <div
      className={`flex flex-col items-center justify-center text-center ${compact ? 'py-8 px-4' : 'py-16 px-4'} ${className}`}
      role="status"
    >
      <div className={`${compact ? 'w-14 h-14' : 'w-20 h-20'} rounded-full bg-slate-100 flex items-center justify-center mb-4 text-slate-400`} aria-hidden="true">
        <div className={compact ? 'w-7 h-7' : 'w-10 h-10'}>
          {iconNode}
        </div>
      </div>
      <h3 className={`${compact ? 'text-sm' : 'text-base'} font-bold text-slate-700 mb-1`}>{title}</h3>
      {message && (
        <p className={`${compact ? 'text-xs' : 'text-sm'} text-slate-500 max-w-sm whitespace-pre-line`}>
          {message}
        </p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}
