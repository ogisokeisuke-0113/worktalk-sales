import { createContext, useContext, useState, useCallback } from 'react'

/**
 * Toast 通知システム
 * - 画面右下にスタック表示、デフォルト3秒で自動消去
 * - タイプ: 'success' | 'error' | 'info' | 'warning'
 * - 使い方: const { showToast } = useToast(); showToast('保存しました', 'success')
 */

const ToastContext = createContext(null)

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])

  const removeToast = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  const showToast = useCallback((message, type = 'info', duration = 3000) => {
    const id = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : String(Date.now() + Math.random())
    setToasts(prev => [...prev, { id, message, type }])
    if (duration > 0) {
      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== id))
      }, duration)
    }
    return id
  }, [])

  return (
    <ToastContext.Provider value={{ showToast, removeToast }}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={removeToast} />
    </ToastContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components -- Provider と一体運用のため同一ファイルで公開
export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) {
    // Provider未配置時のフォールバック（テスト等）: noop
    return { showToast: () => {}, removeToast: () => {} }
  }
  return ctx
}

function ToastViewport({ toasts, onDismiss }) {
  return (
    <div
      className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none"
      style={{ maxWidth: 'calc(100vw - 2rem)' }}
      aria-live="polite"
      aria-atomic="true"
    >
      {toasts.map(t => (
        <ToastItem key={t.id} toast={t} onDismiss={() => onDismiss(t.id)} />
      ))}
    </div>
  )
}

const STYLE_MAP = {
  success: { border: 'border-l-[#0f766e]', icon: '✓', iconColor: 'text-[#0f766e]' },
  error:   { border: 'border-l-[#be123c]', icon: '✕', iconColor: 'text-[#be123c]' },
  warning: { border: 'border-l-amber-500', icon: '⚠', iconColor: 'text-amber-600' },
  info:    { border: 'border-l-[#2d6a9e]', icon: 'ℹ', iconColor: 'text-[#2d6a9e]' },
}

function ToastItem({ toast, onDismiss }) {
  const s = STYLE_MAP[toast.type] || STYLE_MAP.info
  return (
    <div
      className={`pointer-events-auto flex items-start gap-2.5 px-4 py-3 rounded-lg shadow-lg bg-white border border-slate-200 border-l-4 ${s.border} animate-slide-right`}
      role="status"
    >
      <span className={`text-lg leading-none mt-0.5 shrink-0 font-bold ${s.iconColor}`} aria-hidden="true">{s.icon}</span>
      <p className="text-sm font-medium flex-1 text-slate-800 whitespace-pre-line break-words min-w-0" style={{ maxWidth: '20rem' }}>{toast.message}</p>
      <button
        onClick={onDismiss}
        className="text-slate-400 hover:text-slate-600 text-lg leading-none shrink-0"
        aria-label="閉じる"
      >
        ×
      </button>
    </div>
  )
}
