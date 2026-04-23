import { useState, useCallback } from 'react'
import { INDUSTRIES, EMPLOYEE_SCALES, PROPOSAL_STATUSES, RELATIONSHIPS, LOSS_REASONS } from '../constants'

const APP_FIELDS = [
  { key: 'initialDate', label: '初回提案日時', type: 'date' },
  { key: 'companyName', label: '企業名', type: 'text' },
  { key: 'salesRep', label: '営業担当', type: 'text' },
  { key: 'contactName', label: '担当者', type: 'text' },
  { key: 'industry', label: '業種', type: 'select', options: INDUSTRIES },
  { key: 'employeeScale', label: '従業員規模', type: 'select', options: EMPLOYEE_SCALES },
  { key: 'priorityFlag', label: '優先フラグ', type: 'boolean' },
  { key: 'other', label: 'その他', type: 'text' },
  { key: 'position', label: '役職', type: 'text' },
  { key: 'status', label: '提案状況', type: 'select', options: PROPOSAL_STATUSES },
  { key: 'decisionMakerDate', label: '決裁者アポ日', type: 'date' },
  { key: 'conclusionDate', label: '結論日', type: 'date' },
  { key: 'relationship', label: '関係性', type: 'select', options: RELATIONSHIPS },
  { key: 'lossReason', label: '失注理由', type: 'select', options: LOSS_REASONS },
  { key: 'lossReasonDetail', label: '失注理由詳細', type: 'text' },
  { key: 'notes', label: '備考', type: 'text' },
  { key: 'expectedAmount', label: '見込み金額', type: 'number' },
  { key: 'actualAmount', label: '受注金額', type: 'number' },
]

// Auto-mapping: try to match CSV headers to app fields
function autoMap(csvHeaders) {
  const mapping = {}
  const labelToKey = {}
  APP_FIELDS.forEach(f => {
    labelToKey[f.label] = f.key
    labelToKey[f.key] = f.key
  })
  // Aliases
  const aliases = {
    '会社名': 'companyName', '社名': 'companyName', '企業': 'companyName',
    '日付': 'initialDate', '提案日': 'initialDate', '初回提案日': 'initialDate',
    'ステータス': 'status', '状況': 'status', '進捗': 'status',
    '規模': 'employeeScale', '社員数': 'employeeScale', '従業員数': 'employeeScale',
    '優先': 'priorityFlag', 'フラグ': 'priorityFlag',
    '決裁者アポ': 'decisionMakerDate', '再訪日': 'decisionMakerDate',
    '結論': 'conclusionDate',
    'メモ': 'notes', 'コメント': 'notes',
    '理由': 'lossReason',
    '担当': 'contactName', '担当者名': 'contactName',
    '営業': 'salesRep', '営業担当者': 'salesRep',
    '失注詳細': 'lossReasonDetail', '失注理由（詳細）': 'lossReasonDetail',
    '見込み': 'expectedAmount', '読み': 'expectedAmount', '読み金額': 'expectedAmount', '見込金額': 'expectedAmount',
    '受注額': 'actualAmount', '金額': 'actualAmount', '受注金額': 'actualAmount',
  }

  csvHeaders.forEach((header, idx) => {
    const trimmed = header.trim()
    if (labelToKey[trimmed]) {
      mapping[idx] = labelToKey[trimmed]
    } else if (aliases[trimmed]) {
      mapping[idx] = aliases[trimmed]
    } else {
      // Partial match
      for (const f of APP_FIELDS) {
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

// Find the header row by looking for a row with recognizable column names
function findHeaderRow(rows) {
  const knownHeaders = ['企業名', '会社名', '提案状況', '初回提案日時', '関係性', '営業担当', '担当者', '役職']
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

function normalizeDate(val) {
  if (!val) return ''
  const s = val.trim()
  // YYYY/MM/DD or YYYY-MM-DD
  let m = s.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/)
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`
  // MM/DD/YYYY
  m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/)
  if (m) return `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`
  return s
}

function normalizeBoolean(val) {
  if (!val) return false
  const s = val.toString().trim().toLowerCase()
  return ['true', '1', 'yes', 'はい', 'あり', 'o', '○', '◯', '◎', 'on'].includes(s)
}

function makeDedupKey(p) {
  return [p.companyName, p.salesRep, p.initialDate].map(v => (v || '').trim().toLowerCase()).join('|')
}

export default function CsvImportModal({ onImport, onClose, existingProposals = [] }) {
  const [step, setStep] = useState('upload')
  const [csvHeaders, setCsvHeaders] = useState([])
  const [csvRows, setCsvRows] = useState([])
  const [mapping, setMapping] = useState({})
  const [importMode, setImportMode] = useState('append')
  const [previewData, setPreviewData] = useState([])
  const [duplicateCount, setDuplicateCount] = useState(0)
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

        // Auto-detect header row (skip empty leading rows)
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
    const converted = csvRows.map(row => {
      const obj = {
        id: crypto.randomUUID(),
        initialDate: '',
        companyName: '',
        salesRep: '',
        contactName: '',
        industry: '',
        employeeScale: '',
        priorityFlag: false,
        other: '',
        position: '',
        status: 'アポ確定',
        decisionMakerDate: '',
        conclusionDate: '',
        relationship: '新規',
        lossReason: '',
        lossReasonDetail: '',
        notes: '',
        expectedAmount: 0,
        actualAmount: 0,
        activityLog: [],
      }

      Object.entries(mapping).forEach(([csvIdx, fieldKey]) => {
        const val = row[parseInt(csvIdx)]?.trim() || ''
        const field = APP_FIELDS.find(f => f.key === fieldKey)
        if (!field) return

        if (field.type === 'date') {
          obj[fieldKey] = normalizeDate(val)
        } else if (field.type === 'boolean') {
          obj[fieldKey] = normalizeBoolean(val)
        } else if (field.type === 'number') {
          const num = parseInt(val.replace(/[,，円¥\s]/g, ''), 10)
          obj[fieldKey] = isNaN(num) ? 0 : num
        } else if (field.type === 'select') {
          if (field.options.includes(val)) {
            obj[fieldKey] = val
          } else {
            // Exact match first, then try normalized matching
            const match = field.options.find(o => o === val) ||
              field.options.find(o => {
                const ov = o.replace(/[・／/\s]/g, '')
                const vv = val.replace(/[・／/\s]/g, '')
                return ov === vv
              }) ||
              field.options.find(o => {
                // Only match if the value equals one of the segments (split by ・/)
                const segments = o.split(/[・／/]/)
                return segments.some(s => s === val)
              })
            obj[fieldKey] = match || val
          }
        } else {
          obj[fieldKey] = val
        }
      })
      return obj
    }).filter(obj => obj.companyName && obj.status !== '未提案')

    // Dedup: remove rows that already exist in current data
    const existingKeys = new Set(existingProposals.map(makeDedupKey))
    const unique = converted.filter(p => !existingKeys.has(makeDedupKey(p)))
    setDuplicateCount(converted.length - unique.length)
    setPreviewData(unique)
    setStep('preview')
  }

  const executeImport = () => {
    onImport(previewData, importMode)
    setStep('done')
  }

  const mappedFieldKeys = Object.values(mapping)

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b">
          <h3 className="text-lg font-bold text-slate-800">
            CSVインポート
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

          {step === 'upload' && (
            <div>
              <div className="mb-4 p-4 bg-sky-50 rounded-md text-sm text-[#2d6a9e]">
                <p className="font-medium mb-2">Googleスプレッドシートからのインポート手順：</p>
                <ol className="list-decimal list-inside space-y-1">
                  <li>Googleスプレッドシートを開く</li>
                  <li>メニュー「ファイル」→「ダウンロード」→「カンマ区切り値(.csv)」</li>
                  <li>ダウンロードしたCSVファイルを下にアップロード</li>
                </ol>
              </div>
              <div
                className="border-2 border-dashed border-slate-300 rounded-lg p-8 text-center hover:border-blue-400 transition-colors"
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

          {step === 'mapping' && (
            <div>
              <p className="text-sm text-slate-600 mb-2">
                CSVの各カラムをアプリのフィールドに対応付けてください。自動マッピング済みのものは変更可能です。
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
                      <th className="px-3 py-2 text-left text-xs font-medium text-slate-500">→ アプリフィールド</th>
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
                            {APP_FIELDS.map(f => (
                              <option
                                key={f.key}
                                value={f.key}
                                disabled={mappedFieldKeys.includes(f.key) && mapping[idx] !== f.key}
                              >
                                {f.label}
                              </option>
                            ))}
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {!mappedFieldKeys.includes('companyName') && (
                <div className="mb-4 p-3 bg-yellow-50 text-yellow-700 rounded-md text-sm">
                  「企業名」のマッピングは必須です。
                </div>
              )}

              <div className="flex justify-between">
                <button onClick={() => setStep('upload')}
                  className="px-4 py-2 text-sm text-slate-600 bg-slate-100 rounded-md hover:bg-slate-200">
                  戻る
                </button>
                <button
                  onClick={buildPreview}
                  disabled={!mappedFieldKeys.includes('companyName')}
                  className="px-4 py-2 text-sm text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50"
                >
                  プレビュー →
                </button>
              </div>
            </div>
          )}

          {step === 'preview' && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="text-sm text-slate-600">
                  <span className="font-bold text-lg text-slate-800">{previewData.length}件</span>のデータをインポートします
                  {duplicateCount > 0 && (
                    <span className="ml-2 text-amber-600 text-xs font-medium bg-amber-50 px-2 py-0.5 rounded">
                      重複 {duplicateCount}件 除外済み
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-2 text-sm">
                    <input type="radio" name="mode" value="append"
                      checked={importMode === 'append'} onChange={() => setImportMode('append')} />
                    既存データに追加
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="radio" name="mode" value="replace"
                      checked={importMode === 'replace'} onChange={() => setImportMode('replace')} />
                    既存データを置換
                  </label>
                </div>
              </div>

              <div className="overflow-x-auto mb-4 max-h-[400px] overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 sticky top-0">
                    <tr>
                      <th className="px-2 py-1 text-left">#</th>
                      <th className="px-2 py-1 text-left">企業名</th>
                      <th className="px-2 py-1 text-left">営業担当</th>
                      <th className="px-2 py-1 text-left">担当者</th>
                      <th className="px-2 py-1 text-left">状況</th>
                      <th className="px-2 py-1 text-left">関係性</th>
                      <th className="px-2 py-1 text-left">日付</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {previewData.slice(0, 50).map((row, i) => (
                      <tr key={i} className="hover:bg-slate-50">
                        <td className="px-2 py-1 text-slate-400">{i + 1}</td>
                        <td className="px-2 py-1 font-medium">{row.companyName}</td>
                        <td className="px-2 py-1">{row.salesRep}</td>
                        <td className="px-2 py-1">{row.contactName}</td>
                        <td className="px-2 py-1">{row.status}</td>
                        <td className="px-2 py-1">{row.relationship}</td>
                        <td className="px-2 py-1">{row.initialDate}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {previewData.length > 50 && (
                  <p className="text-xs text-slate-400 p-2">...他 {previewData.length - 50} 件</p>
                )}
              </div>

              <div className="flex justify-between">
                <button onClick={() => setStep('mapping')}
                  className="px-4 py-2 text-sm text-slate-600 bg-slate-100 rounded-md hover:bg-slate-200">
                  戻る
                </button>
                <button onClick={executeImport}
                  className="px-4 py-2 text-sm text-white bg-[#0f766e] rounded-md hover:bg-[#0a5c56]">
                  インポート実行（{previewData.length}件）
                </button>
              </div>
            </div>
          )}

          {step === 'done' && (
            <div className="text-center py-8">
              <div className="text-5xl mb-4">&#10003;</div>
              <p className="text-lg font-bold text-slate-800 mb-2">
                {previewData.length}件のデータをインポートしました
              </p>
              {duplicateCount > 0 && (
                <p className="text-sm text-amber-600 mb-2">
                  重複データ {duplicateCount}件 はスキップされました
                </p>
              )}
              <p className="text-sm text-slate-500 mb-6">提案リストで確認してください</p>
              <button onClick={onClose}
                className="px-6 py-2 text-sm text-white bg-blue-600 rounded-md hover:bg-blue-700">
                閉じる
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
