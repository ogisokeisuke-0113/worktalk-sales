import { useState, useMemo, useRef } from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import MultiSelect from './MultiSelect'

const WON_STATUSES = ['受注', '決裁者合意']

function formatNum(n) {
  if (n == null) return '-'
  return n.toLocaleString()
}

function pct(num, den) {
  if (!den || den === 0) return null
  return (num / den) * 100
}

function fmtPct(v) {
  if (v == null) return '-'
  return `${v.toFixed(1)}%`
}

// CSV parser (simple, handles quoted values)
function parseCsv(text) {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter(l => l.trim())
  if (lines.length < 2) return []
  const parseLine = (line) => {
    const result = []
    let cur = ''
    let inQuote = false
    for (let i = 0; i < line.length; i++) {
      const c = line[i]
      if (c === '"') {
        if (inQuote && line[i + 1] === '"') { cur += '"'; i++ } else { inQuote = !inQuote }
      } else if (c === ',' && !inQuote) {
        result.push(cur); cur = ''
      } else { cur += c }
    }
    result.push(cur)
    return result
  }
  const headers = parseLine(lines[0]).map(h => h.trim())
  return lines.slice(1).map(line => {
    const values = parseLine(line)
    const obj = {}
    headers.forEach((h, i) => { obj[h] = (values[i] || '').trim() })
    return obj
  })
}

function downloadTemplate() {
  const headers = ['企業名', '月', '動画起動数', '動画視聴数', '応募フォームクリック数', '応募フォームPV数', '応募フォームUU', '応募数']
  const sample = ['A社', '2025-04', '2400', '1560', '240', '220', '180', '22']
  const csv = '\uFEFF' + headers.join(',') + '\n' + sample.join(',') + '\n'
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'performance_template.csv'
  a.click()
  URL.revokeObjectURL(url)
}

export default function PerformanceAnalysis({ proposals, performance, setPerformance }) {
  const [importResult, setImportResult] = useState(null)
  const [crossTab, setCrossTab] = useState('industry') // 'industry' | 'scale' | 'relationship' | 'monthly'
  const [selectedCompany, setSelectedCompany] = useState([])
  const [selectedIndustry, setSelectedIndustry] = useState([])
  const [selectedScale, setSelectedScale] = useState([])
  const [selectedRelationship, setSelectedRelationship] = useState([])
  const [monthFrom, setMonthFrom] = useState('')
  const [monthTo, setMonthTo] = useState('')
  const [sortKey, setSortKey] = useState('totalCvr')
  const fileInputRef = useRef(null)

  // 受注企業マップ（企業名 → 提案）
  const wonCompanyMap = useMemo(() => {
    const map = new Map()
    proposals.forEach(p => {
      if (WON_STATUSES.includes(p.status) && p.companyName) {
        // 同じ企業名で複数受注がある場合は最新の受注日を採用
        const existing = map.get(p.companyName)
        if (!existing || (p.conclusionDate || '') > (existing.conclusionDate || '')) {
          map.set(p.companyName, p)
        }
      }
    })
    return map
  }, [proposals])

  const wonCompanies = useMemo(() => [...wonCompanyMap.keys()].sort(), [wonCompanyMap])

  // 受注企業に紐づく成果データのみ抽出
  const validPerformance = useMemo(() => {
    return performance.filter(d => wonCompanyMap.has(d.companyName))
  }, [performance, wonCompanyMap])

  // フィルタオプション
  const allIndustries = useMemo(() => {
    const set = new Set()
    wonCompanyMap.forEach(p => { if (p.industry) set.add(p.industry) })
    return [...set].sort()
  }, [wonCompanyMap])

  const allScales = useMemo(() => {
    const set = new Set()
    wonCompanyMap.forEach(p => { if (p.employeeScale) set.add(p.employeeScale) })
    return [...set].sort()
  }, [wonCompanyMap])

  const allRelationships = useMemo(() => {
    const set = new Set()
    wonCompanyMap.forEach(p => { if (p.relationship) set.add(p.relationship) })
    return [...set].sort()
  }, [wonCompanyMap])

  // フィルタ適用後の成果データ
  const filtered = useMemo(() => {
    return validPerformance.filter(d => {
      const proposal = wonCompanyMap.get(d.companyName)
      if (!proposal) return false
      if (selectedCompany.length && !selectedCompany.includes(d.companyName)) return false
      if (selectedIndustry.length && !selectedIndustry.includes(proposal.industry)) return false
      if (selectedScale.length && !selectedScale.includes(proposal.employeeScale)) return false
      if (selectedRelationship.length && !selectedRelationship.includes(proposal.relationship)) return false
      if (monthFrom && d.month < monthFrom) return false
      if (monthTo && d.month > monthTo) return false
      return true
    })
  }, [validPerformance, wonCompanyMap, selectedCompany, selectedIndustry, selectedScale, selectedRelationship, monthFrom, monthTo])

  const hasActiveFilter = selectedCompany.length > 0 || selectedIndustry.length > 0 || selectedScale.length > 0 || selectedRelationship.length > 0 || monthFrom || monthTo

  // KPI集計
  const kpi = useMemo(() => {
    const sum = filtered.reduce((acc, d) => {
      acc.videoStarts += d.videoStarts || 0
      acc.videoViews += d.videoViews || 0
      acc.formClicks += d.formClicks || 0
      acc.formPV += d.formPV || 0
      acc.formUU += d.formUU || 0
      acc.applications += d.applications || 0
      return acc
    }, { videoStarts: 0, videoViews: 0, formClicks: 0, formPV: 0, formUU: 0, applications: 0 })

    const uniqueCompanies = new Set(filtered.map(d => d.companyName)).size
    const monthsCovered = new Set(filtered.map(d => d.month)).size

    const avg = uniqueCompanies > 0 ? {
      videoStarts: Math.round(sum.videoStarts / uniqueCompanies),
      videoViews: Math.round(sum.videoViews / uniqueCompanies),
      formClicks: Math.round(sum.formClicks / uniqueCompanies),
      formPV: Math.round(sum.formPV / uniqueCompanies),
      formUU: Math.round(sum.formUU / uniqueCompanies),
      applications: Math.round(sum.applications / uniqueCompanies),
    } : { videoStarts: 0, videoViews: 0, formClicks: 0, formPV: 0, formUU: 0, applications: 0 }

    return { sum, avg, uniqueCompanies, monthsCovered }
  }, [filtered])

  // ファネル歩留まり計算
  const funnel = useMemo(() => {
    const s = kpi.sum
    return {
      vtr: pct(s.videoViews, s.videoStarts),
      ctr: pct(s.formClicks, s.videoViews),
      formArrivalRate: pct(s.formPV, s.formClicks),
      uniqueRate: pct(s.formUU, s.formPV),
      cvr: pct(s.applications, s.formUU),
      totalCvr: pct(s.applications, s.videoStarts),
      entryRate: pct(s.applications, s.formUU),
    }
  }, [kpi])

  // クロス分析（業種・規模・関係性別）
  function buildCrossData(keyName) {
    const map = {}
    filtered.forEach(d => {
      const proposal = wonCompanyMap.get(d.companyName)
      if (!proposal) return
      const key = proposal[keyName] || '(未設定)'
      if (!map[key]) {
        map[key] = {
          name: key,
          companies: new Set(),
          videoStarts: 0, videoViews: 0, formClicks: 0, formPV: 0, formUU: 0, applications: 0,
        }
      }
      map[key].companies.add(d.companyName)
      map[key].videoStarts += d.videoStarts || 0
      map[key].videoViews += d.videoViews || 0
      map[key].formClicks += d.formClicks || 0
      map[key].formPV += d.formPV || 0
      map[key].formUU += d.formUU || 0
      map[key].applications += d.applications || 0
    })
    return Object.values(map).map(d => ({
      name: d.name,
      companyCount: d.companies.size,
      videoStarts: d.videoStarts,
      videoViews: d.videoViews,
      applications: d.applications,
      vtr: pct(d.videoViews, d.videoStarts),
      ctr: pct(d.formClicks, d.videoViews),
      cvr: pct(d.applications, d.formUU),
      totalCvr: pct(d.applications, d.videoStarts),
    })).filter(d => d.videoStarts > 0)
      .sort((a, b) => (b.totalCvr || 0) - (a.totalCvr || 0))
  }

  const crossByIndustry = useMemo(() => buildCrossData('industry'), [filtered, wonCompanyMap])
  const crossByScale = useMemo(() => buildCrossData('employeeScale'), [filtered, wonCompanyMap])
  const crossByRelationship = useMemo(() => buildCrossData('relationship'), [filtered, wonCompanyMap])

  // 月別推移
  const monthlyTrend = useMemo(() => {
    const map = {}
    filtered.forEach(d => {
      if (!map[d.month]) {
        map[d.month] = { month: d.month, videoStarts: 0, videoViews: 0, formUU: 0, applications: 0 }
      }
      map[d.month].videoStarts += d.videoStarts || 0
      map[d.month].videoViews += d.videoViews || 0
      map[d.month].formUU += d.formUU || 0
      map[d.month].applications += d.applications || 0
    })
    return Object.values(map)
      .sort((a, b) => a.month.localeCompare(b.month))
      .map(d => ({
        ...d,
        totalCvr: pct(d.applications, d.videoStarts),
        entryRate: pct(d.applications, d.formUU),
      }))
  }, [filtered])

  // 企業別ランキング
  const companyRanking = useMemo(() => {
    const map = {}
    filtered.forEach(d => {
      if (!map[d.companyName]) {
        const proposal = wonCompanyMap.get(d.companyName)
        map[d.companyName] = {
          companyName: d.companyName,
          industry: proposal?.industry || '',
          scale: proposal?.employeeScale || '',
          relationship: proposal?.relationship || '',
          videoStarts: 0, videoViews: 0, formClicks: 0, formPV: 0, formUU: 0, applications: 0,
        }
      }
      const r = map[d.companyName]
      r.videoStarts += d.videoStarts || 0
      r.videoViews += d.videoViews || 0
      r.formClicks += d.formClicks || 0
      r.formPV += d.formPV || 0
      r.formUU += d.formUU || 0
      r.applications += d.applications || 0
    })
    const list = Object.values(map).map(r => ({
      ...r,
      vtr: pct(r.videoViews, r.videoStarts),
      cvr: pct(r.applications, r.formUU),
      totalCvr: pct(r.applications, r.videoStarts),
    }))
    list.sort((a, b) => (b[sortKey] || 0) - (a[sortKey] || 0))
    return list
  }, [filtered, wonCompanyMap, sortKey])

  // 紐付け済み企業名
  const linkedCompanies = useMemo(() => new Set(validPerformance.map(d => d.companyName)), [validPerformance])

  // 未紐付け受注企業
  const unlinkedCompanies = useMemo(() => {
    return [...wonCompanyMap.values()]
      .filter(p => !linkedCompanies.has(p.companyName))
      .sort((a, b) => (b.conclusionDate || '').localeCompare(a.conclusionDate || ''))
  }, [wonCompanyMap, linkedCompanies])

  // CSV インポート処理
  const handleCsvImport = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (event) => {
      try {
        const text = event.target.result
        const rows = parseCsv(text)

        const COL_MAP = {
          '企業名': 'companyName',
          '月': 'month',
          '動画起動数': 'videoStarts',
          '動画視聴数': 'videoViews',
          '応募フォームクリック数': 'formClicks',
          '応募フォームPV数': 'formPV',
          '応募フォームUU': 'formUU',
          '応募数': 'applications',
        }

        const imported = []
        const skipped = []  // 受注企業ではないもの
        const errors = []

        rows.forEach((row, idx) => {
          const obj = {}
          Object.entries(COL_MAP).forEach(([jp, en]) => {
            obj[en] = row[jp]
          })

          if (!obj.companyName || !obj.month) {
            errors.push(`行${idx + 2}: 企業名または月が空欄`)
            return
          }

          const proposal = wonCompanyMap.get(obj.companyName)
          if (!proposal) {
            skipped.push(obj.companyName)
            return
          }

          imported.push({
            id: crypto.randomUUID(),
            proposalId: proposal.id,
            companyName: obj.companyName,
            month: obj.month,
            videoStarts: parseInt(obj.videoStarts) || 0,
            videoViews: parseInt(obj.videoViews) || 0,
            formClicks: parseInt(obj.formClicks) || 0,
            formPV: parseInt(obj.formPV) || 0,
            formUU: parseInt(obj.formUU) || 0,
            applications: parseInt(obj.applications) || 0,
          })
        })

        // 同一企業×月のデータは上書き
        setPerformance(prev => {
          const next = [...prev]
          imported.forEach(newItem => {
            const idx = next.findIndex(d => d.companyName === newItem.companyName && d.month === newItem.month)
            if (idx >= 0) {
              next[idx] = { ...next[idx], ...newItem, id: next[idx].id }
            } else {
              next.push(newItem)
            }
          })
          return next
        })

        setImportResult({
          success: imported.length,
          skipped: [...new Set(skipped)],
          errors,
        })
      } catch (err) {
        setImportResult({ success: 0, skipped: [], errors: [`CSV解析エラー: ${err.message}`] })
      }
      e.target.value = ''
    }
    reader.readAsText(file, 'UTF-8')
  }

  const clearFilters = () => {
    setSelectedCompany([])
    setSelectedIndustry([])
    setSelectedScale([])
    setSelectedRelationship([])
    setMonthFrom('')
    setMonthTo('')
  }

  const SORT_OPTIONS = [
    { key: 'totalCvr', label: '全体CVR' },
    { key: 'applications', label: '応募数' },
    { key: 'videoStarts', label: '動画起動数' },
    { key: 'cvr', label: 'CVR' },
    { key: 'vtr', label: 'VTR' },
  ]

  return (
    <div>
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h2 className="text-xl font-bold text-slate-800">成果分析</h2>
          <p className="text-xs text-slate-500 mt-1">
            受注企業 {wonCompanyMap.size}社 / 紐付け済 {linkedCompanies.size}社
            {kpi.monthsCovered > 0 && ` / 対象月数 ${kpi.monthsCovered}ヶ月`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={downloadTemplate}
            className="px-3 py-2 bg-slate-100 text-slate-700 text-sm rounded-md hover:bg-slate-200 transition-colors flex items-center gap-1.5">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
            </svg>
            テンプレ
          </button>
          <input ref={fileInputRef} type="file" accept=".csv" onChange={handleCsvImport} className="hidden" />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="px-4 py-2 bg-[#0f766e] text-white text-sm rounded-md hover:bg-[#0a5c56] transition-colors">
            CSVインポート
          </button>
        </div>
      </div>

      {/* Import result */}
      {importResult && (
        <div className={`mb-4 p-3 rounded-md border text-sm ${importResult.errors.length > 0 || importResult.skipped.length > 0 ? 'bg-amber-50 border-amber-200' : 'bg-green-50 border-green-200'}`}>
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1">
              <p className="font-medium text-slate-800">{importResult.success}件のデータをインポートしました</p>
              {importResult.skipped.length > 0 && (
                <p className="text-amber-700 mt-1 text-xs">
                  ⚠️ {importResult.skipped.length}社は受注企業ではないためスキップ: {importResult.skipped.slice(0, 5).join(', ')}{importResult.skipped.length > 5 ? `...他${importResult.skipped.length - 5}社` : ''}
                </p>
              )}
              {importResult.errors.length > 0 && (
                <ul className="text-red-700 mt-1 text-xs list-disc list-inside">
                  {importResult.errors.slice(0, 5).map((e, i) => <li key={i}>{e}</li>)}
                </ul>
              )}
            </div>
            <button onClick={() => setImportResult(null)} className="text-slate-400 hover:text-slate-600">✕</button>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="bg-white rounded-lg shadow p-4 mb-4">
        <div className="flex flex-wrap gap-2 items-center">
          <MultiSelect selected={selectedCompany} onChange={setSelectedCompany} options={wonCompanies} placeholder="全企業" />
          <MultiSelect selected={selectedIndustry} onChange={setSelectedIndustry} options={allIndustries} placeholder="全業種" />
          <MultiSelect selected={selectedScale} onChange={setSelectedScale} options={allScales} placeholder="全規模" />
          <MultiSelect selected={selectedRelationship} onChange={setSelectedRelationship} options={allRelationships} placeholder="全関係性" />
          <div className="flex items-center gap-1">
            <span className="text-xs text-slate-500">期間:</span>
            <input type="month" value={monthFrom} onChange={e => setMonthFrom(e.target.value)}
              className={`border rounded-md px-2 py-1.5 text-sm ${monthFrom ? 'border-blue-400 bg-blue-50' : 'border-slate-300'}`} />
            <span className="text-slate-400 text-xs">〜</span>
            <input type="month" value={monthTo} onChange={e => setMonthTo(e.target.value)}
              className={`border rounded-md px-2 py-1.5 text-sm ${monthTo ? 'border-blue-400 bg-blue-50' : 'border-slate-300'}`} />
          </div>
          {hasActiveFilter && (
            <button onClick={clearFilters} className="text-sm text-[#4a82ae] hover:text-[#2d6a9e] px-2">
              クリア
            </button>
          )}
        </div>
      </div>

      {validPerformance.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-12 text-center text-slate-400">
          <p className="text-base mb-2">成果データがまだありません</p>
          <p className="text-sm">右上の「CSVインポート」からLookerのデータを取り込んでください</p>
          <p className="text-xs mt-2">※ 受注ステータスの企業のみが分析対象になります</p>
        </div>
      ) : (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-4">
            {[
              { label: '動画起動数', sum: kpi.sum.videoStarts, avg: kpi.avg.videoStarts },
              { label: '動画視聴数', sum: kpi.sum.videoViews, avg: kpi.avg.videoViews },
              { label: 'Fクリック', sum: kpi.sum.formClicks, avg: kpi.avg.formClicks },
              { label: 'F PV', sum: kpi.sum.formPV, avg: kpi.avg.formPV },
              { label: 'F UU', sum: kpi.sum.formUU, avg: kpi.avg.formUU },
              { label: '応募数', sum: kpi.sum.applications, avg: kpi.avg.applications, highlight: true },
            ].map(item => (
              <div key={item.label} className={`bg-white rounded-lg shadow p-3 ${item.highlight ? 'ring-2 ring-[#0f766e]/30' : ''}`}>
                <p className="text-[11px] text-slate-500 font-medium">{item.label}</p>
                <p className={`text-xl font-bold mt-1 ${item.highlight ? 'text-[#0f766e]' : 'text-slate-800'}`}>{formatNum(item.sum)}</p>
                <p className="text-[10px] text-slate-400 mt-0.5">企業平均 {formatNum(item.avg)}</p>
              </div>
            ))}
          </div>

          {/* Funnel */}
          <div className="bg-white rounded-lg shadow p-5 mb-4">
            <h3 className="text-sm font-bold text-slate-700 mb-4">マーケティングファネル</h3>
            <FunnelView sum={kpi.sum} funnel={funnel} />
            <div className="mt-4 pt-4 border-t border-slate-100 grid grid-cols-2 gap-4">
              <div className="text-center">
                <p className="text-xs text-slate-500">全体CVR <span className="text-[10px]">(応募/起動)</span></p>
                <p className="text-2xl font-bold text-[#0f766e]">{fmtPct(funnel.totalCvr)}</p>
              </div>
              <div className="text-center">
                <p className="text-xs text-slate-500">エントリー率 <span className="text-[10px]">(応募/UU)</span></p>
                <p className="text-2xl font-bold text-[#1a5285]">{fmtPct(funnel.entryRate)}</p>
              </div>
            </div>
          </div>

          {/* Cross Analysis */}
          <div className="bg-white rounded-lg shadow p-5 mb-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
              <h3 className="text-sm font-bold text-slate-700">クロス分析</h3>
              <div className="flex bg-slate-100 rounded-lg p-0.5">
                {[
                  { key: 'industry', label: '業種別' },
                  { key: 'scale', label: '規模別' },
                  { key: 'relationship', label: '関係性別' },
                  { key: 'monthly', label: '月別推移' },
                ].map(t => (
                  <button key={t.key} onClick={() => setCrossTab(t.key)}
                    className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${crossTab === t.key ? 'bg-white text-[#1a5285] shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
            {crossTab === 'industry' && <CrossTable data={crossByIndustry} keyLabel="業種" />}
            {crossTab === 'scale' && <CrossTable data={crossByScale} keyLabel="規模" />}
            {crossTab === 'relationship' && <CrossTable data={crossByRelationship} keyLabel="関係性" />}
            {crossTab === 'monthly' && <MonthlyTrend data={monthlyTrend} />}
          </div>

          {/* Company Ranking */}
          <div className="bg-white rounded-lg shadow p-5 mb-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-slate-700">企業別成果ランキング</h3>
              <select value={sortKey} onChange={e => setSortKey(e.target.value)}
                className="border border-slate-300 rounded-md px-2 py-1 text-sm bg-white">
                {SORT_OPTIONS.map(o => <option key={o.key} value={o.key}>ソート: {o.label}</option>)}
              </select>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-2 py-2 text-left text-slate-500 font-medium">#</th>
                    <th className="px-2 py-2 text-left text-slate-500 font-medium">企業名</th>
                    <th className="px-2 py-2 text-left text-slate-500 font-medium">業種</th>
                    <th className="px-2 py-2 text-left text-slate-500 font-medium">規模</th>
                    <th className="px-2 py-2 text-right text-slate-500 font-medium">起動数</th>
                    <th className="px-2 py-2 text-right text-slate-500 font-medium">応募数</th>
                    <th className="px-2 py-2 text-right text-slate-500 font-medium">VTR</th>
                    <th className="px-2 py-2 text-right text-slate-500 font-medium">CVR</th>
                    <th className="px-2 py-2 text-right text-slate-500 font-medium">全体CVR</th>
                  </tr>
                </thead>
                <tbody>
                  {companyRanking.map((c, i) => (
                    <tr key={c.companyName} className="border-t border-slate-100 hover:bg-slate-50">
                      <td className="px-2 py-2 text-slate-400">{i + 1}</td>
                      <td className="px-2 py-2 font-medium text-slate-800">{c.companyName}</td>
                      <td className="px-2 py-2 text-slate-600">{c.industry}</td>
                      <td className="px-2 py-2 text-slate-600">{c.scale}</td>
                      <td className="px-2 py-2 text-right text-slate-600">{formatNum(c.videoStarts)}</td>
                      <td className="px-2 py-2 text-right text-[#0f766e] font-medium">{formatNum(c.applications)}</td>
                      <td className="px-2 py-2 text-right text-slate-600">{fmtPct(c.vtr)}</td>
                      <td className="px-2 py-2 text-right text-slate-600">{fmtPct(c.cvr)}</td>
                      <td className="px-2 py-2 text-right text-[#0f766e] font-bold">{fmtPct(c.totalCvr)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* 未紐付け企業 */}
      {unlinkedCompanies.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-4">
          <h3 className="text-sm font-bold text-amber-900 mb-2 flex items-center gap-1.5">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.732 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
            </svg>
            成果データ未紐付けの受注企業 ({unlinkedCompanies.length}社)
          </h3>
          <p className="text-xs text-amber-700 mb-2">Lookerから該当企業のデータをCSVで取り込んでください</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {unlinkedCompanies.slice(0, 12).map(p => (
              <div key={p.id} className="bg-white rounded px-3 py-2 text-xs">
                <p className="font-medium text-slate-800">{p.companyName}</p>
                <p className="text-slate-500 mt-0.5">
                  {p.industry || '業種未設定'} / {p.status} / {p.conclusionDate || p.decisionMakerDate || '日付未設定'}
                </p>
              </div>
            ))}
          </div>
          {unlinkedCompanies.length > 12 && (
            <p className="text-xs text-amber-700 mt-2">他 {unlinkedCompanies.length - 12} 社</p>
          )}
        </div>
      )}
    </div>
  )
}

function FunnelView({ sum, funnel }) {
  const max = Math.max(sum.videoStarts, 1)
  const stages = [
    { label: '動画起動数', value: sum.videoStarts, color: '#1a5285' },
    { label: '動画視聴数', value: sum.videoViews, color: '#2d6a9e', rateLabel: 'VTR', rate: funnel.vtr },
    { label: 'Fクリック数', value: sum.formClicks, color: '#4a82ae', rateLabel: 'CTR', rate: funnel.ctr },
    { label: 'F PV数', value: sum.formPV, color: '#6e9bbf', rateLabel: 'フォーム到達率', rate: funnel.formArrivalRate },
    { label: 'F UU数', value: sum.formUU, color: '#93b5d0', rateLabel: 'PV→UU率', rate: funnel.uniqueRate },
    { label: '応募数', value: sum.applications, color: '#0f766e', rateLabel: 'CVR', rate: funnel.cvr },
  ]
  return (
    <div className="space-y-1">
      {stages.map((s, i) => {
        const widthPct = max > 0 ? Math.max((s.value / max) * 100, 2) : 2
        return (
          <div key={s.label}>
            {i > 0 && (
              <div className="flex items-center gap-2 pl-4 py-0.5 text-[11px] text-slate-500">
                <span>↓</span>
                <span className="font-medium">{s.rateLabel}</span>
                <span className="text-[#0f766e] font-bold">{fmtPct(s.rate)}</span>
              </div>
            )}
            <div className="flex items-center gap-3">
              <div className="w-24 text-xs text-slate-700 font-medium text-right">{s.label}</div>
              <div className="flex-1 bg-slate-50 rounded h-7 relative overflow-hidden">
                <div className="h-full rounded transition-all" style={{ width: `${widthPct}%`, backgroundColor: s.color }}></div>
                <div className="absolute inset-0 flex items-center px-3">
                  <span className="text-xs font-bold text-white drop-shadow" style={{ textShadow: '0 0 3px rgba(0,0,0,0.5)' }}>{formatNum(s.value)}</span>
                </div>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function CrossTable({ data, keyLabel }) {
  if (data.length === 0) {
    return <p className="text-sm text-slate-400 text-center py-4">データなし</p>
  }
  const maxTotalCvr = Math.max(...data.map(d => d.totalCvr || 0))
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead className="bg-slate-50">
          <tr>
            <th className="px-2 py-2 text-left text-slate-500 font-medium">{keyLabel}</th>
            <th className="px-2 py-2 text-right text-slate-500 font-medium">企業数</th>
            <th className="px-2 py-2 text-right text-slate-500 font-medium">起動数</th>
            <th className="px-2 py-2 text-right text-slate-500 font-medium">応募数</th>
            <th className="px-2 py-2 text-right text-slate-500 font-medium">VTR</th>
            <th className="px-2 py-2 text-right text-slate-500 font-medium">CTR</th>
            <th className="px-2 py-2 text-right text-slate-500 font-medium">CVR</th>
            <th className="px-2 py-2 text-right text-slate-500 font-medium">全体CVR</th>
          </tr>
        </thead>
        <tbody>
          {data.map(d => (
            <tr key={d.name} className="border-t border-slate-100 hover:bg-slate-50">
              <td className="px-2 py-2 font-medium text-slate-800">{d.name}</td>
              <td className="px-2 py-2 text-right text-slate-600">{d.companyCount}</td>
              <td className="px-2 py-2 text-right text-slate-600">{formatNum(d.videoStarts)}</td>
              <td className="px-2 py-2 text-right text-[#0f766e] font-medium">{formatNum(d.applications)}</td>
              <td className="px-2 py-2 text-right text-slate-600">{fmtPct(d.vtr)}</td>
              <td className="px-2 py-2 text-right text-slate-600">{fmtPct(d.ctr)}</td>
              <td className="px-2 py-2 text-right text-slate-600">{fmtPct(d.cvr)}</td>
              <td className="px-2 py-2 text-right font-bold text-[#0f766e]">
                {fmtPct(d.totalCvr)}
                {d.totalCvr === maxTotalCvr && d.totalCvr > 0 && <span className="ml-1">⭐</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function MonthlyTrend({ data }) {
  if (data.length === 0) {
    return <p className="text-sm text-slate-400 text-center py-4">データなし</p>
  }
  return (
    <ResponsiveContainer width="100%" height={280}>
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
        <XAxis dataKey="month" tick={{ fontSize: 11 }} />
        <YAxis yAxisId="left" tick={{ fontSize: 11 }} />
        <YAxis yAxisId="right" orientation="right" unit="%" tick={{ fontSize: 11 }} />
        <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} formatter={(v, name) => name.includes('率') || name.includes('CVR') ? `${v?.toFixed?.(1) || v}%` : formatNum(v)} />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        <Line yAxisId="left" type="monotone" dataKey="applications" name="応募数" stroke="#0f766e" strokeWidth={2} />
        <Line yAxisId="left" type="monotone" dataKey="formUU" name="フォームUU" stroke="#4a82ae" strokeWidth={1.5} strokeDasharray="3 3" />
        <Line yAxisId="right" type="monotone" dataKey="totalCvr" name="全体CVR" stroke="#c97a1a" strokeWidth={2} />
      </LineChart>
    </ResponsiveContainer>
  )
}
