import { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react'

/**
 * カスタム確認ダイアログ
 * - window.confirm() の代替。Tailwindで統一デザイン
 * - Promise ベース: `const ok = await confirm({ title, message, variant: 'danger' })`
 * - ESC=キャンセル, Enter=OK
 */

const ConfirmContext = createContext(null)

export function ConfirmProvider({ children }) {
  const [state, setState] = useState(null)
  const resolverRef = useRef(null)

  const confirm = useCallback((opts = {}) => {
    return new Promise((resolve) => {
      resolverRef.current = resolve
      setState({
        title: opts.title || '確認',
        message: opts.message || 'この操作を実行しますか？',
        confirmText: opts.confirmText || 'OK',
        cancelText: opts.cancelText || 'キャンセル',
        variant: opts.variant || 'default',
      })
    })
  }, [])

  const close = useCallback((result) => {
    setState(null)
    const resolver = resolverRef.current
    resolverRef.current = null
    if (resolver) resolver(result)
  }, [])

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {state && (
        <ConfirmDialog
          {...state}
          onConfirm={() => close(true)}
          onCancel={() => close(false)}
        />
      )}
    </ConfirmContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components -- Provider と一体運用のため同一ファイルで公開
export function useConfirm() {
  const ctx = useContext(ConfirmContext)
  if (!ctx) {
    // Provider未配置時のフォールバック
    return async () => window.confirm('操作を実行しますか？')
  }
  return ctx
}

function ConfirmDialog({ title, message, confirmText, cancelText, variant, onConfirm, onCancel }) {
  // ESC = cancel / Enter = confirm
  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); onCancel() }
      else if (e.key === 'Enter') { e.preventDefault(); onConfirm() }
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onConfirm, onCancel])

  const isDanger = variant === 'danger'
  const confirmBtnClass = isDanger
    ? 'bg-red-500 hover:bg-red-600 focus:ring-red-400'
    : 'bg-[#2d6a9e] hover:bg-[#1a5285] focus:ring-[#6e9bbf]'
  const iconWrap = isDanger
    ? 'bg-rose-100 text-[#be123c]'
    : 'bg-sky-100 text-[#2d6a9e]'
  const iconSvg = isDanger ? (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
    </svg>
  ) : (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z" />
    </svg>
  )

  return (
    <div
      className="fixed inset-0 bg-black/50 z-[110] flex items-center justify-center p-4 animate-fade-in"
      onClick={onCancel}
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
    >
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-sm animate-slide-up"
        onClick={e => e.stopPropagation()}
      >
        <div className="p-5">
          <div className="flex items-start gap-3">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${iconWrap}`} aria-hidden="true">
              {iconSvg}
            </div>
            <div className="flex-1 min-w-0">
              <h3 id="confirm-dialog-title" className="text-base font-bold text-slate-800 mb-1.5">{title}</h3>
              <p className="text-sm text-slate-600 whitespace-pre-line break-words">{message}</p>
            </div>
          </div>
        </div>
        <div className="flex gap-2 px-5 py-3 border-t border-slate-100 bg-slate-50 rounded-b-xl">
          <button
            onClick={onCancel}
            className="flex-1 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-300"
          >
            {cancelText}
          </button>
          <button
            onClick={onConfirm}
            autoFocus
            className={`flex-1 py-2 text-sm font-semibold text-white rounded-md focus:outline-none focus:ring-2 focus:ring-offset-1 ${confirmBtnClass}`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  )
}
