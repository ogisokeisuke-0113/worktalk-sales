import { useState } from 'react'

export default function Settings({ settings, setSettings }) {
  const [key, setKey] = useState(settings.apiKey)
  const [saved, setSaved] = useState(false)

  const handleSave = () => {
    setSettings({ ...settings, apiKey: key })
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="max-w-xl">
      <h2 className="text-xl font-bold text-slate-800 mb-6">設定</h2>
      <div className="bg-white rounded-lg shadow p-6">
        <label className="block text-sm font-medium text-slate-700 mb-2">
          Anthropic APIキー
        </label>
        <p className="text-xs text-slate-500 mb-3">
          AI自動判定機能（企業名から業種・従業員規模を推定）に使用します。
        </p>
        <input
          type="password"
          value={key}
          onChange={e => setKey(e.target.value)}
          placeholder="sk-ant-..."
          className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
        <div className="mt-4 flex items-center gap-3">
          <button
            onClick={handleSave}
            className="px-4 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 transition-colors"
          >
            保存
          </button>
          {saved && (
            <span className="text-sm text-green-600">保存しました</span>
          )}
        </div>
      </div>
    </div>
  )
}
