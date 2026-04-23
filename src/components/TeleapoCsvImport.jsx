import { useState, useCallback } from 'react'
import { INDUSTRIES, EMPLOYEE_SCALES } from '../constants'

const TELEAPO_FIELDS = [
  { key: 'companyName', label: '企業名', type: 'text', required: true },
  { key: 'phone', label: '電話番号', type: 'text', required: true },
  { key: 'industry', label: '業種', type: 'select', options: INDUSTRIES, required: true },
  { key: 'employeeScale', label: '従業員規模', type: 'select', options: EMPLOYEE_SCALES, required: true },
  { key: 'contactName', label: '担当者名', type: 'text' },
  { key: 'salesRep', label: '担当営業', type: 'text' },
  { key: 'memo', label: 'メモ', type: 'text' },
]

const REQUIRED_KEYS = TELEAPO_FIELDS.filter(f => f.required).map(f => f.key)

function autoMap(csvHeaders) {
  const mapping = {}
  const labelToKey = {}
  TELEAPO_FIELDS.forEach(f => {
    labelToKey[f.label] = f.key
    labelToKey[f.key] = f.key
  })
  const aliases = {
    '会社名': 'companyName', '社名': 'companyName', '企業': 'companyName', '法人名': 'companyName',
    'TEL': 'phone', 'tel': 'phone', '電話': 'phone', 'TEL番号': 'phone', '連絡先': 'phone',
    '規模': 'employeeScale', '社員数': 'employeeScale', '従業員数': 'employeeScale', '人数': 'employeeScale',
    '担当': 'contactName', '担当者': 'contactName', '窓口': 'contactName', '先方担当': 'contactName',
    '営業': 'salesRep', '営業担当': 'salesRep', '営業担当者': 'salesRep', 'アポインター': 'salesRep',
    '備考': 'memo', 'メモ': 'memo', 'コメント': 'memo', 'ノート': 'memo',
  }

  csvHeaders.forEach((header, idx) => {
    const trimmed = header.trim()
    if (labelToKey[trimmed]) {
      mapping[idx] = labelToKey[trimmed]
    } else if (aliases[trimmed]) {
      mapping[idx] = aliases[trimmed]
    } else {
      for (const f of TELEAPO_FIELDS) {
        if (trimmed.includes(f.label) || f.label.includes(trimmed)) {
          mapping[idx] = f.key
          break
        }
      }
    }
  })
  return mapping
}

function parseCSV(text) {
  const lines = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (ch === '"') {
      if (inQuotes && text[i + 1] === '"') {
        current += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
    } else if (ch === ',' && !inQuotes) {
      lines.push(current)
      current = ''
    } else if ((ch === '\n' || ch === '\r') && !inQuotes) {
      if (ch === '\r' && text[i + 1] === '\n') i++
      lines.push(current)
      current = ''
      lines.push('\n')
    } else {
      current += ch
    }
  }
  if (current) lines.push(current)

  const rows = []
  let row = []
  for (const token of lines) {
    if (token === '\n') {
      if (row.length > 0) rows.push(row)
      row = []
    } else {
      row.push(token)
    }
  }
  if (row.length > 0) rows.push(row)
  return rows
}

function findHeaderRow(rows) {
  const knownHeaders = ['企業名', '会社名', '社名', '電話番号', 'TEL', '業種', '従業員', '規模', '担当']
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    const row = rows[i]
    const matchCount = row.filter(cell => {
      const trimmed = cell.trim()
      if (!trimmed) return false
      return knownHeaders.some(h => trimmed === h || trimmed.includes(h) || h.includes(trimmed))
    }).length
    if (matchCount >= 2) return i
  }
  return 0
}

// 電話番号の正規化（ハイフン除去して比較用キーを作る）
function normalizePhone(phone) {
  if (!phone) return ''
  return phone.replace(/[\s\-−ー()（）]/g, '')
}

// 重複チェックキー: 企業名 + 電話番号（正規化済み）
function makeDedupKey(item) {
  return [
    (item.companyName || '').trim().toLowerCase(),
    normalizePhone(item.phone),
  ].join('|')
}

export default function TeleapoCsvImport({ onImport, onClose, existingItems = [], salesReps = [] }) {
  const [step, setStep] = useState('upload')
  const [csvHeaders, setCsvHeaders] = useState([])
  const [csvRows, setCsvRows] = useState([])
  const [mapping, setMapping] = useState({})
  const [defaultSalesRep, setDefaultSalesRep] = useState('未確定')
  const [previewData, setPreviewData] = useState([])
  const [duplicates, setDuplicates] = useState([])
  const [validationErrors, setValidationErrors] = useState([])
  const [error, setError] = useState('')
  const [skippedRows, setSkippedRows] = useState(0)

  const handleFile = useCallback((e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setError('')

    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const text = ev.target.result
        const rows = parseCSV(text)
        if (rows.length < 2) {
          setError('データが不足しています。ヘッダー行とデータ行が必要です。')
          return
        }
        const headerIdx = findHeaderRow(rows)
        const headers = rows[headerIdx]
        const data = rows.slice(headerIdx + 1).filter(r => r.some(cell => cell.trim()))

        setSkippedRows(headerIdx)
        setCsvHeaders(headers)
        setCsvRows(data)
        setMapping(autoMap(headers))
        setStep('mapping')
      } catch (err) {
        setError(`CSVの解析に失敗しました: ${err.message}`)
      }
    }
    reader.readAsText(file, 'UTF-8')
  }, [])

  const handleDrop = useCallback((e) => {
    e.preventDefault()
    const file = e.dataTransfer.files?.[0]
    if (file) {
      const dt = new DataTransfer()
      dt.items.add(file)
      handleFile({ target: { files: dt.files } })
    }
  }, [handleFile])

  const updateMapping = (csvIndex, appFieldKey) => {
    setMapping(prev => {
      const next = { ...prev }
      if (appFieldKey === '') {
        delete next[csvIndex]
      } else {
        Object.keys(next).forEach(k => {
          if (next[k] === appFieldKey) delete next[k]
        })
        next[csvIndex] = appFieldKey
      }
      return next
    })
  }

  const buildPreview = () => {
    const errors = []
    const converted = csvRows.map((row, rowIdx) => {
      const obj = {
        id: crypto.randomUUID(),
        companyName: '',
        phone: '',
        contactName: '',
        industry: '',
        employeeScale: '',
        salesRep: defaultSalesRep,
        status: '未架電',
        isKept: false,
        memo: '',
        callHistory: [],
      }

      Object.entries(mapping).forEach(([csvIdx, fieldKey]) => {
        const val = row[parseInt(csvIdx)]?.trim() || ''
        const field = TELEAPO_FIELDS.find(f => f.key === fieldKey)
        if (!field) return

        if (field.type === 'select') {
          if (field.options.includes(val)) {
            obj[fieldKey] = val
          } else {
            const match = field.options.find(o => o === val) ||
              field.options.find(o => {
                const ov = o.replace(/[・／/\s]/g, '')
                const vv = val.replace(/[・／/\s]/g, '')
                return ov === vv
              }) ||
              field.options.find(o => {
                const segments = o.split(/[・／/]/)
                return segments.some(s => s === val)
              })
            obj[fieldKey] = match || val
          }
        } else {
          obj[fieldKey] = val
        }
      })

      // 担当営業がCSVで指定されていたらそちらを優先
      if (!obj.salesRep) obj.salesRep = defaultSalesRep

      // バリデーション: 必須フィールドチェック
      const missing = []
      if (!obj.companyName) missing.push('企業名')
      if (!obj.phone) missing.push('電話番号')
      if (!obj.industry) missing.push('業種')
      if (!obj.employeeScale) missing.push('従業員規模')

      if (missing.length > 0) {
        errors.push({ row: rowIdx + 1, company: obj.companyName || '(空)', missing })
      }

      return obj
    })

    // 必須フィールドが揃っているもののみ
    const valid = converted.filter(obj =>
      obj.companyName && obj.phone && obj.industry && obj.employeeScale
    )

    // 重複チェック: 既存データとの照合
    const existingKeys = new Set(existingItems.map(makeDedupKey))
    const dupes = []
    const unique = valid.filter(item => {
      const key = makeDedupKey(item)
      if (existingKeys.has(key)) {
        dupes.push(item)
        return false
      }
      // CSV内の重複も除外
      existingKeys.add(key)
      return true
    })

    setValidationErrors(errors)
    setDuplicates(dupes)
    setPreviewData(unique)
    setStep('preview')
  }

  const executeImport = () => {
    onImport(previewData)
    setStep('done')
  }

  const mappedFieldKeys = Object.values(mapping)
  const requiredMapped = REQUIRED_KEYS.every(k => mappedFieldKeys.includes(k))

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b">
          <h3 className="text-lg font-bold text-slate-800">
            テレアポCSVインポート
            {step === 'mapping' && ' - カラムマッピング'}
            {step === 'preview' && ' - プレビュー'}
            {step === 'done' && ' - 完了'}
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-2xl leading-none">&times;</button>
        </div>

        <div className="p-4">
          {error && (
            <div className="mb-4 p-3 bg-rose-50 text-[#be123c] rounded-md text-sm">{error}</div>
          )}

          {/* ===== STEP 1: アップロード ===== */}
          {step === 'upload' && (
            <div>
              <div className="mb-4 p-4 bg-sky-50 rounded-md text-sm text-[#2d6a9e]">
                <p className="font-medium mb-2">CSVインポートの注意事項：</p>
                <ul className="list-disc list-inside space-y-1">
                  <li><span className="font-bold">必須カラム</span>：企業名、電話番号、業種、従業員規模</li>
                  <li>担当営業は省略可（一括で指定できます）</li>
                  <li>電話番号＋企業名で重複チェックを行います</li>
                  <li>UTF-8のCSVファイルに対応</li>
                </ul>
              </div>
              <div
                className="border-2 border-dashed border-slate-300 rounded-lg p-8 text-center hover:border-[#4a82ae] transition-colors"
                onDragOver={e => e.preventDefault()}
                onDrop={handleDrop}
              >
                <p className="text-slate-500 mb-3">CSVファイルをドラッグ＆ドロップ</p>
                <p className="text-slate-400 text-sm mb-4">または</p>
                <label className="px-4 py-2 bg-[#2d6a9e] text-white text-sm rounded-md hover:bg-[#1a5285] cursor-pointer transition-colors">
                  ファイルを選択
                  <input type="file" accept=".csv,.tsv,.txt" onChange={handleFile} className="hidden" />
                </label>
              </div>
            </div>
          )}

          {/* ===== STEP 2: マッピング ===== */}
          {step === 'mapping' && (
            <div>
              <p className="text-sm text-slate-600 mb-2">
                CSVのカラムをフィールドに対応付けてください。<span className="text-[#be123c]">*</span>は必須です。
              </p>
              {skippedRows > 0 && (
                <p className="text-xs text-[#4a82ae] mb-3">
                  ※ 先頭{skippedRows}行の空行をスキップしてヘッダーを検出しました
                </p>
              )}

              <div className="overflow-x-auto mb-4">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-medium text-slate-500">CSVカラム</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-slate-500">サンプルデータ</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-slate-500">→ フィールド</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {csvHeaders.map((header, idx) => (
                      <tr key={idx} className={mapping[idx] ? 'bg-teal-50' : ''}>
                        <td className="px-3 py-2 font-medium text-slate-700">{header}</td>
                        <td className="px-3 py-2 text-slate-500 max-w-[200px] truncate">
                          {csvRows[0]?.[idx] || '(空)'}
                        </td>
                        <td className="px-3 py-2">
                          <select
                            value={mapping[idx] || ''}
                            onChange={e => updateMapping(idx, e.target.value)}
                            className={`border rounded-md px-2 py-1 text-sm w-full ${
                              mapping[idx] ? 'border-green-400 bg-teal-50' : 'border-slate-300'
                            }`}
                          >
                            <option value="">（スキップ）</option>
                            {TELEAPO_FIELDS.map(f => (
                              <option
                                key={f.key}
                                value={f.key}
                                disabled={mappedFieldKeys.includes(f.key) && mapping[idx] !== f.key}
                              >
                                {f.label}{f.required ? ' *' : ''}
                              </option>
                            ))}
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* 担当営業の一括指定 */}
              <div className="mb-4 p-4 bg-slate-50 rounded-lg">
                <label className="block text-sm font-medium text-slate-700 mb-1.5">担当営業（一括指定）</label>
                <p className="text-xs text-slate-500 mb-2">CSVに担当営業がない場合、全件にこの値を設定します</p>
                <select value={defaultSalesRep} onChange={e => setDefaultSalesRep(e.target.value)}
                  className="border border-slate-300 rounded-md px-3 py-2 text-sm bg-white w-full sm:w-64">
                  <option value="未確定">未確定</option>
                  {salesReps.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>

              {!requiredMapped && (
                <div className="mb-4 p-3 bg-amber-50 text-amber-700 rounded-md text-sm">
                  必須フィールド（企業名・電話番号・業種・従業員規模）をすべてマッピングしてください。
                </div>
              )}

              <div className="flex justify-between">
                <button onClick={() => setStep('upload')}
                  className="px-4 py-2 text-sm text-slate-600 bg-slate-100 rounded-md hover:bg-slate-200">
                  戻る
                </button>
                <button
                  onClick={buildPreview}
                  disabled={!requiredMapped}
                  className="px-4 py-2 text-sm text-white bg-[#2d6a9e] rounded-md hover:bg-[#1a5285] disabled:opacity-40"
                >
                  プレビュー →
                </button>
              </div>
            </div>
          )}

          {/* ===== STEP 3: プレビュー ===== */}
          {step === 'preview' && (
            <div>
              {/* サマリー */}
              <div className="flex flex-wrap gap-4 mb-4">
                <div className="bg-teal-50 border border-teal-200 rounded-lg px-4 py-3">
                  <p className="text-xs text-teal-600 font-medium">インポート対象</p>
                  <p className="text-2xl font-bold text-[#0f766e]">{previewData.length}<span className="text-sm ml-0.5">件</span></p>
                </div>
                {duplicates.length > 0 && (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
                    <p className="text-xs text-amber-600 font-medium">重複（除外）</p>
                    <p className="text-2xl font-bold text-[#b45309]">{duplicates.length}<span className="text-sm ml-0.5">件</span></p>
                  </div>
                )}
                {validationErrors.length > 0 && (
                  <div className="bg-rose-50 border border-rose-200 rounded-lg px-4 py-3">
                    <p className="text-xs text-rose-600 font-medium">不備（除外）</p>
                    <p className="text-2xl font-bold text-[#be123c]">{validationErrors.length}<span className="text-sm ml-0.5">件</span></p>
                  </div>
                )}
              </div>

              {/* 重複詳細 */}
              {duplicates.length > 0 && (
                <details className="mb-3">
                  <summary className="text-xs text-amber-600 cursor-pointer hover:underline font-medium">
                    重複データの詳細を表示 ({duplicates.length}件)
                  </summary>
                  <div className="mt-2 max-h-32 overflow-y-auto border border-amber-100 rounded-md">
                    <table className="w-full text-xs">
                      <tbody className="divide-y divide-amber-50">
                        {duplicates.map((d, i) => (
                          <tr key={i} className="bg-amber-50/50">
                            <td className="px-2 py-1 font-medium">{d.companyName}</td>
                            <td className="px-2 py-1 text-slate-500">{d.phone}</td>
                            <td className="px-2 py-1 text-slate-500">{d.industry}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </details>
              )}

              {/* バリデーションエラー詳細 */}
              {validationErrors.length > 0 && (
                <details className="mb-3">
                  <summary className="text-xs text-rose-600 cursor-pointer hover:underline font-medium">
                    不備データの詳細を表示 ({validationErrors.length}件)
                  </summary>
                  <div className="mt-2 max-h-32 overflow-y-auto border border-rose-100 rounded-md text-xs">
                    {validationErrors.slice(0, 20).map((e, i) => (
                      <div key={i} className="px-2 py-1 border-b border-rose-50 bg-rose-50/50">
                        行{e.row}: {e.company} — <span className="text-rose-600">不足: {e.missing.join(', ')}</span>
                      </div>
                    ))}
                    {validationErrors.length > 20 && <div className="px-2 py-1 text-slate-400">...他 {validationErrors.length - 20} 件</div>}
                  </div>
                </details>
              )}

              {/* プレビューテーブル */}
              {previewData.length > 0 ? (
                <div className="overflow-x-auto mb-4 max-h-[350px] overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-50 sticky top-0">
                      <tr>
                        <th className="px-2 py-1.5 text-left">#</th>
                        <th className="px-2 py-1.5 text-left">企業名</th>
                        <th className="px-2 py-1.5 text-left">電話番号</th>
                        <th className="px-2 py-1.5 text-left">業種</th>
                        <th className="px-2 py-1.5 text-left">従業員規模</th>
                        <th className="px-2 py-1.5 text-left">担当営業</th>
                        <th className="px-2 py-1.5 text-left">担当者名</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {previewData.slice(0, 50).map((row, i) => (
                        <tr key={i} className="hover:bg-slate-50">
                          <td className="px-2 py-1 text-slate-400">{i + 1}</td>
                          <td className="px-2 py-1 font-medium">{row.companyName}</td>
                          <td className="px-2 py-1">{row.phone}</td>
                          <td className="px-2 py-1">{row.industry}</td>
                          <td className="px-2 py-1">{row.employeeScale}</td>
                          <td className="px-2 py-1">
                            <span className={row.salesRep === '未確定' ? 'text-amber-500 font-medium' : ''}>
                              {row.salesRep}
                            </span>
                          </td>
                          <td className="px-2 py-1">{row.contactName}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {previewData.length > 50 && (
                    <p className="text-xs text-slate-400 p-2">...他 {previewData.length - 50} 件</p>
                  )}
                </div>
              ) : (
                <div className="text-center py-8 text-slate-400 text-sm mb-4">
                  インポート可能なデータがありません
                </div>
              )}

              <div className="flex justify-between">
                <button onClick={() => setStep('mapping')}
                  className="px-4 py-2 text-sm text-slate-600 bg-slate-100 rounded-md hover:bg-slate-200">
                  戻る
                </button>
                <button onClick={executeImport}
                  disabled={previewData.length === 0}
                  className="px-4 py-2 text-sm text-white bg-[#0f766e] rounded-md hover:bg-[#0a5c56] disabled:opacity-40">
                  インポート実行（{previewData.length}件）
                </button>
              </div>
            </div>
          )}

          {/* ===== STEP 4: 完了 ===== */}
          {step === 'done' && (
            <div className="text-center py-8">
              <div className="text-5xl mb-4 text-[#0f766e]">&#10003;</div>
              <p className="text-lg font-bold text-slate-800 mb-2">
                {previewData.length}件のデータをインポートしました
              </p>
              {duplicates.length > 0 && (
                <p className="text-sm text-amber-600 mb-1">
                  重複データ {duplicates.length}件 はスキップされました
                </p>
              )}
              {validationErrors.length > 0 && (
                <p className="text-sm text-rose-500 mb-1">
                  不備データ {validationErrors.length}件 はスキップされました
                </p>
              )}
              <p className="text-sm text-slate-500 mb-6">テレアポリストで確認してください</p>
              <button onClick={onClose}
                className="px-6 py-2 text-sm text-white bg-[#2d6a9e] rounded-md hover:bg-[#1a5285]">
                閉じる
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
