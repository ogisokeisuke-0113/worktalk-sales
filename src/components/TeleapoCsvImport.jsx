import { useState, useCallback } from 'react'
import { INDUSTRIES, EMPLOYEE_SCALES } from '../constants'

// ── 業種変換（CSV大業界・小業界 → Sales Board業種） ──────────────
const CSV_HOUSING_MINOR = new Set(['注文住宅建築', '住居リフォーム', 'マンション建築', '分譲型住宅建築'])
const CSV_INDUSTRY_MAP = {
  'IT': 'IT・SaaS', 'ゲーム': 'IT・SaaS', '通信・PC': 'IT・SaaS',
  '人材': '人材',
  '不動産': '不動産',
  '建設・工事・土木': '建設',
  '医療・製薬・福祉': '医療・福祉',
  '教育': '教育',
  '化学': 'メーカー', '食品': 'メーカー', '製造': 'メーカー',
  '生活用品': 'メーカー', '電気製品': 'メーカー', '機械系': 'メーカー',
  '車・乗り物': 'メーカー', '美容・服飾': 'メーカー',
  'コンサル': 'コンサル・士業',
  '広告': '広告・マーケ', 'マスコミ': '広告・マーケ',
  '金融': '保険・金融',
  '商社': '商社',
  '小売・販売': 'サービス・その他', '外食': 'サービス・その他',
  'エンタメ': 'サービス・その他', '運送・物流・輸送': 'サービス・その他',
  'エネルギー': 'サービス・その他', 'その他サービス': 'サービス・その他',
  'その他業界': 'サービス・その他',
}

function convertCsvIndustry(major, minor) {
  if (!major) return ''
  if (major === '建設・工事・土木' && CSV_HOUSING_MINOR.has(minor)) return '住宅'
  return CSV_INDUSTRY_MAP[major] || ''
}

// ── 従業員数（数値）→ 規模レンジ変換 ────────────────────────────
function convertEmployeeCount(val) {
  const n = parseInt(String(val).replace(/[,，\s]/g, ''), 10)
  if (isNaN(n)) return val
  if (n <= 30) return '1〜30名'
  if (n <= 100) return '31〜100名'
  if (n <= 300) return '101〜300名'
  if (n <= 500) return '301〜500名'
  if (n <= 1000) return '501〜1000名'
  if (n <= 3000) return '1001〜3000名'
  return '3001名〜'
}

const TELEAPO_FIELDS = [
  { key: 'companyName', label: '企業名', type: 'text', required: true },
  { key: 'phone', label: '代表電話番号', type: 'text', required: true },
  { key: 'recruitmentPhone', label: '採用電話番号', type: 'text' },
  { key: 'industry', label: '業種', type: 'select', options: INDUSTRIES, required: true },
  { key: 'employeeScale', label: '従業員規模', type: 'select', options: EMPLOYEE_SCALES, required: true },
  { key: 'contactName', label: '担当者名', type: 'text' },
  { key: 'contactPosition', label: '役職・部署', type: 'text' },
  { key: 'email', label: 'メールアドレス', type: 'text' },
  { key: 'prefecture', label: '都道府県', type: 'text' },
  { key: 'companyUrl', label: '企業URL', type: 'text' },
  { key: 'salesScale', label: '売上規模', type: 'text' },
  { key: 'listingStatus', label: '上場区分', type: 'text' },
  { key: 'recruitmentJobType', label: '採用職種', type: 'text' },
  { key: 'recruitmentAdSpend', label: '採用広告費', type: 'text' },
  { key: 'employeeGrowth', label: '従業員増加数', type: 'text' },
  { key: 'listSource', label: 'リストソース', type: 'text' },
  { key: 'salesRep', label: '担当営業', type: 'text' },
  { key: 'memo', label: 'メモ', type: 'text' },
  { key: '_industryMinor', label: '業界小分類（変換用）', type: 'text', hidden: true },
  { key: '_employeeCount', label: '従業員数（数値→変換）', type: 'text', hidden: true },
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
    '代表TEL': 'phone', '代表電話': 'phone', '代表番号': 'phone',
    '採用TEL': 'recruitmentPhone', '採用電話': 'recruitmentPhone', '採用番号': 'recruitmentPhone',
    '採用担当TEL': 'recruitmentPhone', '採用担当電話': 'recruitmentPhone',
    '規模': 'employeeScale', '社員数': 'employeeScale', '人数': 'employeeScale',
    '担当': 'contactName', '担当者': 'contactName', '窓口': 'contactName', '先方担当': 'contactName',
    '役職': 'contactPosition', '部署': 'contactPosition', '役職・部署': 'contactPosition',
    '営業': 'salesRep', '営業担当': 'salesRep', '営業担当者': 'salesRep', 'アポインター': 'salesRep',
    '備考': 'memo', 'メモ': 'memo', 'コメント': 'memo', 'ノート': 'memo',
    'mail': 'email', 'Mail': 'email', 'EMAIL': 'email', 'e-mail': 'email', 'E-mail': 'email',
    'メール': 'email', 'メアド': 'email',
    '大業界': 'industry', '業界1': 'industry', '業界': 'industry',
    '小業界': '_industryMinor', '業界2': '_industryMinor',
    '従業員数': '_employeeCount', '社員数（数値）': '_employeeCount',
    '都道府県': 'prefecture', '所在地': 'prefecture', '地域': 'prefecture',
    'URL': 'companyUrl', 'HP': 'companyUrl', 'Webサイト': 'companyUrl', '企業サイト': 'companyUrl',
    '売上': 'salesScale', '売上高': 'salesScale', '年商': 'salesScale',
    '上場': 'listingStatus', '上場区分': 'listingStatus', '上場種別': 'listingStatus',
    '採用職種': 'recruitmentJobType', 'メイン職種': 'recruitmentJobType', '主要職種': 'recruitmentJobType',
    'メイン職種（β）': 'recruitmentJobType',
    '採用広告費': 'recruitmentAdSpend', '合計出稿金額': 'recruitmentAdSpend', '広告費': 'recruitmentAdSpend',
    '合計出稿金額（掲載課金型媒体）': 'recruitmentAdSpend',
    '従業員増加数': 'employeeGrowth', '増加数': 'employeeGrowth', '増員数': 'employeeGrowth',
    'リストソース': 'listSource', 'リスト名': 'listSource', '出所': 'listSource',
    // 業種1/2/3 はセールスブレインCSVでは求人職種（業界分類ではない）→ 最初のみ小分類として利用、残りは無視
    '業種1': '_industryMinor',
  }
  // 部分一致でスキップすべき列名（業種1に引きずられて業種2/3が誤マッピングされないよう除外）
  const skipCols = new Set(['業種2', '業種3', 'サブ職種（β）'])

  csvHeaders.forEach((header, idx) => {
    const trimmed = header.trim()
    if (skipCols.has(trimmed)) return
    if (labelToKey[trimmed]) {
      mapping[idx] = labelToKey[trimmed]
    } else if (aliases[trimmed]) {
      mapping[idx] = aliases[trimmed]
    } else {
      // エイリアスキーが列名に含まれているか確認（括弧付き列名の対応）
      for (const [aliasKey, aliasVal] of Object.entries(aliases)) {
        if (trimmed.includes(aliasKey) && aliasKey.length >= 4) {
          mapping[idx] = aliasVal
          return
        }
      }
      for (const f of TELEAPO_FIELDS) {
        // 部分一致は label が4文字以上の場合のみ許可（短い label による誤マッチを防止）
        if (f.label.length >= 4 && (trimmed.includes(f.label) || f.label.includes(trimmed))) {
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

export default function TeleapoCsvImport({ onImport, onClose, existingItems = [], proposedItems = [], salesReps = [], settings = {}, onUpdateItems }) {
  const [step, setStep] = useState('upload')
  const [csvHeaders, setCsvHeaders] = useState([])
  const [csvRows, setCsvRows] = useState([])
  const [mapping, setMapping] = useState({})
  const [defaultSalesRep, setDefaultSalesRep] = useState('未確定')
  const [listSourceInput, setListSourceInput] = useState('')
  const [previewData, setPreviewData] = useState([])
  const [duplicates, setDuplicates] = useState([])
  const [proposedSkipped, setProposedSkipped] = useState([])
  const [validationErrors, setValidationErrors] = useState([])
  const [error, setError] = useState('')
  const [skippedRows, setSkippedRows] = useState(0)
  const [emailResult, setEmailResult] = useState(null) // { sent, failed, skipped }
  const [emailSending, setEmailSending] = useState(false)

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
      // リストソースがCSVで指定されていない場合は一括指定値を使用
      if (!obj.listSource && listSourceInput.trim()) obj.listSource = listSourceInput.trim()

      // 業種変換: 大業界値（CSV）→ Sales Board業種
      // セールスブレインCSVは「大業界 > 小業界」形式で1列に入っている
      if (obj.industry && !INDUSTRIES.includes(obj.industry)) {
        let major = obj.industry
        let minor = obj._industryMinor || ''
        if (obj.industry.includes(' > ')) {
          const parts = obj.industry.split(' > ')
          major = parts[0].trim()
          if (!minor) minor = parts[1]?.trim() || ''
        }
        const converted = convertCsvIndustry(major, minor)
        if (converted) obj.industry = converted
      }
      delete obj._industryMinor

      // 従業員数変換: 数値 → 規模レンジ
      if (obj._employeeCount) {
        const converted = convertEmployeeCount(obj._employeeCount)
        if (converted && EMPLOYEE_SCALES.includes(converted)) {
          obj.employeeScale = converted
        }
      }
      delete obj._employeeCount

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

    // 重複チェック: 既存テレアポデータとの照合
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

    // 提案済みチェック: 提案リストに同名企業があるものを除外
    const proposedSet = new Set(proposedItems.map(p => (p.companyName || '').trim().toLowerCase()).filter(Boolean))
    const proposed = []
    const notProposed = unique.filter(item => {
      const name = (item.companyName || '').trim().toLowerCase()
      if (name && proposedSet.has(name)) {
        proposed.push(item)
        return false
      }
      return true
    })

    setValidationErrors(errors)
    setDuplicates(dupes)
    setProposedSkipped(proposed)
    setPreviewData(notProposed)
    setStep('preview')
  }

  const executeImport = async () => {
    // まず emailStatus='未送信' でインポート
    const importData = previewData.map(item => ({ ...item, emailStatus: '未送信' }))
    onImport(importData, proposedSkipped.length)
    setStep('done')

    // メールアドレスがあるものを抽出してSendGrid送信
    const withEmail = importData.filter(item => item.email && item.email.includes('@'))
    if (withEmail.length === 0 || !settings.sheetSyncUrl) {
      setEmailResult({ sent: 0, failed: 0, skipped: previewData.length })
      return
    }

    setEmailSending(true)
    try {
      const res = await fetch(settings.sheetSyncUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          action: 'sendEmails',
          recipients: withEmail.map(item => ({
            email: item.email,
            companyName: item.companyName,
          })),
          template: {
            subject: settings.emailSubject || '【WorkTalk】ご挨拶のご連絡',
            body: settings.emailBody || '',
            from: settings.emailFrom || 'noreply@work-talk.jp',
            senderName: settings.emailSenderName || 'WorkTalk営業チーム',
          },
        }),
      })
      const data = await res.json()
      const sentCount = data.sent || 0
      setEmailResult({
        sent: sentCount,
        failed: data.failed || 0,
        skipped: previewData.length - withEmail.length,
      })
      // 送信成功した企業のemailStatusを'送信済み'に更新
      if (sentCount > 0 && onUpdateItems) {
        const sentEmails = new Set(data.sentEmails || withEmail.map(i => i.email))
        const now = new Date().toISOString()
        onUpdateItems(
          withEmail
            .filter(i => sentEmails.has(i.email))
            .map(i => ({ id: i.id, emailStatus: '送信済み', emailSentAt: now }))
        )
      }
    } catch (err) {
      setEmailResult({ sent: 0, failed: withEmail.length, skipped: previewData.length - withEmail.length, error: err.message })
    } finally {
      setEmailSending(false)
    }
  }

  const mappedFieldKeys = Object.values(mapping)
  // employeeScale は _employeeCount があれば変換で代替可能
  // phone は recruitmentPhone があれば代替可能
  const requiredMapped = REQUIRED_KEYS.every(k => {
    if (k === 'employeeScale') return mappedFieldKeys.includes('employeeScale') || mappedFieldKeys.includes('_employeeCount')
    if (k === 'phone') return mappedFieldKeys.includes('phone') || mappedFieldKeys.includes('recruitmentPhone')
    return mappedFieldKeys.includes(k)
  })

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
                            {TELEAPO_FIELDS.filter(f => !f.hidden).map(f => (
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

              {/* リストソースの一括指定 */}
              <div className="mb-4 p-4 bg-slate-50 rounded-lg">
                <label className="block text-sm font-medium text-slate-700 mb-1.5">リストソース（任意）</label>
                <p className="text-xs text-slate-500 mb-2">CSVにリストソース列がない場合、全件にこの値を設定します</p>
                <input type="text" value={listSourceInput} onChange={e => setListSourceInput(e.target.value)}
                  placeholder="セールスブレインなど"
                  className="border border-slate-300 rounded-md px-3 py-2 text-sm bg-white w-full sm:w-64 focus:outline-none focus:ring-2 focus:ring-[#6e9bbf]" />
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
                {proposedSkipped.length > 0 && (
                  <div className="bg-rose-50 border border-rose-200 rounded-lg px-4 py-3">
                    <p className="text-xs text-rose-600 font-medium">提案済み（除外）</p>
                    <p className="text-2xl font-bold text-[#be123c]">{proposedSkipped.length}<span className="text-sm ml-0.5">件</span></p>
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
                        <th className="px-2 py-1.5 text-left">メールアドレス</th>
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
                          <td className="px-2 py-1">
                            {row.email
                              ? <span className="text-[#0f766e] text-xs">✓ {row.email}</span>
                              : <span className="text-slate-300 text-xs">−</span>
                            }
                          </td>
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
              {proposedSkipped.length > 0 && (
                <p className="text-sm text-rose-500 mb-1">
                  提案済み企業 {proposedSkipped.length}件 はスキップされました
                </p>
              )}
              {validationErrors.length > 0 && (
                <p className="text-sm text-rose-500 mb-1">
                  不備データ {validationErrors.length}件 はスキップされました
                </p>
              )}

              {/* メール送信結果 */}
              <div className="mt-5 mb-4 mx-auto max-w-xs">
                {emailSending && (
                  <div className="flex items-center justify-center gap-2 text-[#2d6a9e] text-sm bg-blue-50 rounded-lg p-3">
                    <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                    </svg>
                    メール送信中...
                  </div>
                )}
                {!emailSending && emailResult && (
                  <div className="bg-slate-50 rounded-lg p-4 text-left space-y-1.5 text-sm">
                    <p className="font-semibold text-slate-700 mb-2">📧 メール送信結果</p>
                    {emailResult.sent > 0 && (
                      <p className="text-[#0f766e]">✓ 送信成功：{emailResult.sent}件</p>
                    )}
                    {emailResult.failed > 0 && (
                      <p className="text-rose-500">✗ 送信失敗：{emailResult.failed}件</p>
                    )}
                    {emailResult.skipped > 0 && (
                      <p className="text-slate-400">− メールなし：{emailResult.skipped}件</p>
                    )}
                    {emailResult.error && (
                      <p className="text-xs text-rose-400 mt-1">{emailResult.error}</p>
                    )}
                    {!settings.sheetSyncUrl && (
                      <p className="text-amber-500 text-xs">※ GAS URLが未設定のためメール送信をスキップしました</p>
                    )}
                  </div>
                )}
              </div>

              <p className="text-sm text-slate-500 mb-6">テレアポリストで確認してください</p>
              <button onClick={onClose}
                disabled={emailSending}
                className="px-6 py-2 text-sm text-white bg-[#2d6a9e] rounded-md hover:bg-[#1a5285] disabled:opacity-40">
                閉じる
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
