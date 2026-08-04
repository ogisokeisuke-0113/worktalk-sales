import { useState, useEffect, useRef, useCallback } from 'react'
import { loadProposals, saveProposals, loadTeleapo, saveTeleapo, loadSettings, saveSettings, loadUsers, saveUsers, loadCurrentUser, saveCurrentUser, loadPerformance, savePerformance, loadDeletedKeys, saveDeletedKeys, loadDownloadLeads, saveDownloadLeads } from './storage'
import { db } from './lib/db'
import { isSupabaseEnabled } from './lib/supabase'
import { EMPLOYEE_SCALES } from './constants'
import Dashboard from './components/Dashboard'
import ProposalList from './components/ProposalList'
import SalesRepView from './components/SalesRepView'
import TeleapoList from './components/TeleapoList'
import Settings from './components/Settings'
import LoginScreen from './components/LoginScreen'
import { useToast } from './components/Toast'

const TABS = [
  { id: 'dashboard', label: 'ダッシュボード' },
  { id: 'reps', label: '担当別' },
  { id: 'proposals', label: '提案リスト' },
  { id: 'teleapo', label: 'テレアポ' },
]

// ========== スプレッドシート同期 ==========
const SHEET_COL_MAP = {
  '初回提案日時': 'initialDate',
  '初回アポ日': 'initialDate',
  '企業名': 'companyName',
  '営業担当': 'salesRep',
  '担当者': 'contactName',
  '役職': 'position',
  '業種': 'industry',
  '企業規模': 'employeeScale',
  '従業員規模': 'employeeScale', // 列名の揺れに対応
  '提案状況': 'status',
  '決裁者アポ日': 'decisionMakerDate',
  '結論日': 'conclusionDate',
  '関係性': 'relationship',
  '失注理由': 'lossReason',
  '失注理由詳細': 'lossReasonDetail',
  '備考': 'notes',
}

// 旧・企業規模区分 → 新7区分へのマイグレーション
const SCALE_MIGRATION = {
  '1~50': '1〜30名', '50~100': '31〜100名',
  '100~200': '101〜300名', '200~300': '101〜300名',
  '300~400': '301〜500名', '400~500': '301〜500名',
  '500~600': '501〜1000名', '600~700': '501〜1000名',
  '700~800': '501〜1000名', '800~900': '501〜1000名', '900~1000': '501〜1000名',
  '1000~2000': '1001〜3000名', '2000~3000': '1001〜3000名',
  '3000~4000': '3001名〜', '4000~5000': '3001名〜', '5000~6000': '3001名〜',
  '6000~7000': '3001名〜', '7000~8000': '3001名〜', '8000~9000': '3001名〜',
  '9000~10000': '3001名〜', '10000~': '3001名〜',
}

// 企業規模の表記ゆれを正規化（半角~→全角〜、名なし→名あり）
function normalizeScale(val) {
  if (!val) return val
  const strip = s => s.replace(/~/g, '〜').replace(/名/g, '').replace(/\s/g, '').trim()
  const normalized = strip(String(val))
  for (const scale of EMPLOYEE_SCALES) {
    if (strip(scale) === normalized) return scale
  }
  return String(val).trim()
}

function migrateEmployeeScale(proposals) {
  let changed = false
  const migrated = proposals.map(p => {
    if (!p.employeeScale) return p
    // 旧21区分マッピング
    if (SCALE_MIGRATION[p.employeeScale]) {
      changed = true
      return { ...p, employeeScale: SCALE_MIGRATION[p.employeeScale] }
    }
    // 表記ゆれ正規化（半角~→全角〜、名なし→名あり）
    const normalized = normalizeScale(p.employeeScale)
    if (normalized !== p.employeeScale) {
      changed = true
      return { ...p, employeeScale: normalized }
    }
    return p
  })
  return changed ? migrated : proposals
}

function formatSheetDate(val) {
  if (!val) return ''
  const s = String(val).trim()
  if (!s) return ''
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  const slashMatch = s.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/)
  if (slashMatch) return `${slashMatch[1]}-${slashMatch[2].padStart(2, '0')}-${slashMatch[3].padStart(2, '0')}`
  const d = new Date(s)
  if (!isNaN(d)) {
    // toISOString() はUTC基準のため日本時間と1日ズレる → ローカル時間で取得
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
  }
  return s
}

function mapSheetRow(row) {
  const p = {}
  for (const [jpKey, engKey] of Object.entries(SHEET_COL_MAP)) {
    let val = row[jpKey]
    if (val === undefined || val === null || val === '') {
      // 既に値がセット済みなら空欄で上書きしない（企業規模/従業員規模の重複キー対策）
      if (!(engKey in p)) p[engKey] = ''
      continue
    }
    if (['initialDate', 'decisionMakerDate', 'conclusionDate'].includes(engKey)) {
      p[engKey] = formatSheetDate(val)
    } else if (engKey === 'employeeScale') {
      p[engKey] = normalizeScale(val)
    } else {
      p[engKey] = String(val).trim()
    }
  }
  if (row._rowIndex) p._sheetRowIndex = row._rowIndex
  return p
}

function upsertFromSheet(existing, incoming) {
  const result = [...existing]
  for (const row of incoming) {
    if (!row.companyName) continue
    // 企業名で先に一致を試みる（行番号ズレによる重複防止）
    // 企業名一致しなければ sheetRowIndex で一致
    let idx = result.findIndex(p => p.companyName === row.companyName)
    if (idx < 0 && row._sheetRowIndex !== undefined) {
      idx = result.findIndex(p => p._sheetRowIndex === row._sheetRowIndex)
    }

    if (idx >= 0) {
      // 既存: スプレッドシートが正 → シートの全フィールドで上書き
      // Sales Board固有項目（活動ログ・フラグ・金額）のみ保持
      result[idx] = {
        ...result[idx],
        ...row,
        id: result[idx].id,
        activityLog: result[idx].activityLog || [],
        priorityFlag: result[idx].priorityFlag ?? false,
      }
    } else {
      // 新規: シートから追加
      result.push({
        id: crypto.randomUUID(),
        priorityFlag: false,
        other: '',
        lossReasonDetail: '',
        activityLog: [{ date: new Date().toISOString(), type: 'create', note: 'スプレッドシートから同期' }],
        ...row,
      })
    }
  }
  return result
}
// ==========================================

const INDUSTRY_MIGRATION = {
  'IT・ソフトウェア': 'IT・SaaS',
  '建設・不動産': '建設',
  '医療・福祉・介護': '医療・福祉',
  '教育・学習支援': '教育',
  '製造業': 'メーカー',
  '小売・流通': 'サービス・その他',
  '飲食・フード': 'サービス・その他',
  '金融・保険': '保険・金融',
  '人材・HR': '人材',
  '広告・マーケティング': '広告・マーケ',
  '物流・運輸': 'サービス・その他',
  'サービス業（その他）': 'サービス・その他',
}

function migrateIndustry(proposals) {
  let changed = false
  const migrated = proposals.map(p => {
    if (p.industry && INDUSTRY_MIGRATION[p.industry]) {
      changed = true
      return { ...p, industry: INDUSTRY_MIGRATION[p.industry] }
    }
    return p
  })
  return changed ? migrated : proposals
}

function removeInvalidStatuses(proposals) {
  const before = proposals.length
  const removeStatuses = ['アポ獲得不可', 'アポ調整中']
  const cleaned = proposals.filter(p => !removeStatuses.includes(p.status))
  if (cleaned.length < before) {
    console.log(`[migration] アポ獲得不可・アポ調整中 ${before - cleaned.length}件を削除しました`)
  }
  return cleaned
}

function migrateKessaisha(proposals) {
  const STATUS_MAP = { '決済者アポ調整中': '決裁者アポ調整中', '決済者合意': '決裁者合意' }
  let changed = false
  const migrated = proposals.map(p => {
    if (p.status && STATUS_MAP[p.status]) {
      changed = true
      return { ...p, status: STATUS_MAP[p.status] }
    }
    return p
  })
  return changed ? migrated : proposals
}

export default function App() {
  const { showToast } = useToast()
  const [users, setUsers] = useState(() => loadUsers())
  const [currentUser, setCurrentUser] = useState(() => loadCurrentUser())
  const [activeTab, setActiveTab] = useState('dashboard')
  const [proposalFilter, setProposalFilter] = useState(null)
  const [teleapoFilter, setTeleapoFilter] = useState(null)
  const [showUserMenu, setShowUserMenu] = useState(false)
  const [syncStatus, setSyncStatus] = useState(null) // null | { status:'loading'|'ok'|'error', time, count, message }
  const [deletedKeys, setDeletedKeys] = useState(() => loadDeletedKeys())
  const hasSyncedRef = useRef(false)
  const hasSupabaseSyncedRef = useRef(false)
  const prevProposalsRef = useRef(null)
  const prevTeleapoRef = useRef(null)
  const prevUsersRef = useRef(null)
  const prevDownloadLeadsRef = useRef(null)
  const userMenuRef = useRef(null)
  const [mountedTabs, setMountedTabs] = useState(() => new Set(['dashboard']))

  // タブ切り替え（ブラウザ履歴に追加）
  const switchTab = useCallback((tab) => {
    setMountedTabs(prev => { const next = new Set(prev); next.add(tab); return next })
    setActiveTab(tab)
    window.history.pushState({ tab }, '')
  }, [])

  // ダッシュボードからフィルタ付きで提案リストに遷移
  const navigateToProposals = (filter) => {
    setProposalFilter(filter)
    switchTab('proposals')
  }

  // ダッシュボードからフィルタ付きでテレアポリストに遷移
  const navigateToTeleapo = (filter) => {
    setTeleapoFilter(filter)
    switchTab('teleapo')
  }
  const [proposals, setProposals] = useState(() => migrateEmployeeScale(migrateKessaisha(removeInvalidStatuses(migrateIndustry(loadProposals())))))
  const [teleapoItems, setTeleapoItems] = useState(() => loadTeleapo())
  const [downloadLeads, setDownloadLeads] = useState(() => loadDownloadLeads())
  const [settings, setSettings] = useState(() => loadSettings())
  const [performance, setPerformance] = useState(() => loadPerformance())

  useEffect(() => { saveProposals(proposals) }, [proposals])
  useEffect(() => { saveTeleapo(teleapoItems) }, [teleapoItems])
  useEffect(() => { saveSettings(settings) }, [settings])
  useEffect(() => { saveUsers(users) }, [users])
  useEffect(() => { saveCurrentUser(currentUser) }, [currentUser])
  useEffect(() => { savePerformance(performance) }, [performance])
  useEffect(() => { saveDeletedKeys(deletedKeys) }, [deletedKeys])

  // ── Supabase 起動時同期（ログイン後に1回だけ実行） ──────────────
  useEffect(() => {
    if (!currentUser || !isSupabaseEnabled || hasSupabaseSyncedRef.current) return
    hasSupabaseSyncedRef.current = true

    async function doStartupSync() {
      try {
        const [remoteProposals, remoteTeleapo, remoteUsers, remoteDownloads, remoteSettings] =
          await Promise.all([
            db.proposals.fetchAll(),
            db.teleapoItems.fetchAll(),
            db.users.fetchAll(),
            db.downloadLeads.fetchAll(),
            db.settings.get(),
          ])

        function mergeById(local, remote) {
          if (!remote) return local
          const remoteMap = new Map(remote.map(r => [r.id, r]))
          const merged = local.map(item => remoteMap.has(item.id) ? remoteMap.get(item.id) : item)
          const localIds = new Set(local.map(i => i.id))
          remote.forEach(r => { if (!localIds.has(r.id)) merged.push(r) })
          return merged
        }

        if (remoteProposals) setProposals(prev => mergeById(prev, remoteProposals))
        if (remoteTeleapo) setTeleapoItems(prev => mergeById(prev, remoteTeleapo))
        if (remoteUsers && remoteUsers.length > 0) setUsers(remoteUsers)
        if (remoteDownloads && remoteDownloads.length > 0) setDownloadLeads(remoteDownloads)
        if (remoteSettings) setSettings(prev => ({ ...prev, ...remoteSettings }))
      } catch (e) {
        console.warn('[Supabase] 起動時同期エラー:', e.message)
      }
    }

    doStartupSync()
  }, [currentUser])

  // ── Supabase へのデータ書き込み（変更検知 + 削除追跡） ──────────
  useEffect(() => {
    if (!isSupabaseEnabled) return
    const prev = prevProposalsRef.current
    prevProposalsRef.current = proposals
    if (!prev) return  // 初回マウント時は書き込みしない
    const timer = setTimeout(async () => {
      if (proposals.length > 0) await db.proposals.upsert(proposals)
      const currentIds = new Set(proposals.map(p => p.id))
      const deletedIds = (prev || []).filter(p => !currentIds.has(p.id)).map(p => p.id)
      if (deletedIds.length) await db.proposals.delete(deletedIds)
    }, 1500)
    return () => clearTimeout(timer)
  }, [proposals])

  useEffect(() => {
    if (!isSupabaseEnabled) return
    const prev = prevTeleapoRef.current
    prevTeleapoRef.current = teleapoItems
    if (!prev) return
    const timer = setTimeout(async () => {
      if (teleapoItems.length > 0) await db.teleapoItems.upsert(teleapoItems)
      const currentIds = new Set(teleapoItems.map(i => i.id))
      const deletedIds = (prev || []).filter(i => !currentIds.has(i.id)).map(i => i.id)
      if (deletedIds.length) await db.teleapoItems.delete(deletedIds)
    }, 1500)
    return () => clearTimeout(timer)
  }, [teleapoItems])

  useEffect(() => {
    if (!isSupabaseEnabled) return
    const prev = prevUsersRef.current
    prevUsersRef.current = users
    if (!prev) return
    const timer = setTimeout(async () => {
      if (users.length > 0) await db.users.upsert(users)
    }, 1500)
    return () => clearTimeout(timer)
  }, [users])

  useEffect(() => {
    if (!isSupabaseEnabled) return
    const prev = prevDownloadLeadsRef.current
    prevDownloadLeadsRef.current = downloadLeads
    if (!prev) return
    const timer = setTimeout(async () => {
      if (downloadLeads.length > 0) await db.downloadLeads.upsert(downloadLeads)
    }, 1500)
    return () => clearTimeout(timer)
  }, [downloadLeads])

  useEffect(() => {
    if (!isSupabaseEnabled) return
    const timer = setTimeout(() => db.settings.set(settings), 1500)
    return () => clearTimeout(timer)
  }, [settings])

  // ブラウザバック対応: 初期履歴を設定
  useEffect(() => {
    window.history.replaceState({ tab: 'dashboard' }, '')
  }, [])

  // ブラウザバック/フォワード時にタブを切り替え
  useEffect(() => {
    const handlePopState = (e) => {
      const tab = e.state?.tab || 'dashboard'
      setMountedTabs(prev => { const next = new Set(prev); next.add(tab); return next })
      setActiveTab(tab)
    }
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  // スプレッドシート自動同期
  const syncFromSheet = useCallback(async (url) => {
    if (!url) return
    setSyncStatus({ status: 'loading' })
    try {
      const res = await fetch(url)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const rows = await res.json()
      // スプレッドシートが正 → シートにある企業を反映
      // 「未提案」「アポ獲得不可」はシステムに取り込まない
      const SKIP_STATUSES = ['未提案', 'アポ獲得不可']
      const mapped = rows.map(mapSheetRow).filter(r =>
        r.companyName && !SKIP_STATUSES.includes(r.status)
      )
      const incomingNames = new Set(mapped.map(r => r.companyName))
      const validStatuses = ['アポ確定','担当者合意','決裁者アポ調整中','決裁者合意','受注','失注']
      setProposals(prev => {
        const upserted = upsertFromSheet(prev, mapped)
        // シートにない企業名 or 不正ステータスの提案を削除（手動作成 = _sheetRowIndex なしは保持）
        const after = upserted.filter(p => {
          if (!p._sheetRowIndex) return true          // 手動作成は保持
          if (!incomingNames.has(p.companyName)) {
            console.log(`[sync] 削除（シートにない）: ${p.companyName}`)
            return false
          }
          if (p.status && !validStatuses.includes(p.status)) {
            console.log(`[sync] 削除（不正ステータス "${p.status}"）: ${p.companyName}`)
            return false
          }
          return true
        })
        console.log(`[sync] 同期完了: ${mapped.length}件取得 / ${prev.length - after.length}件削除 / 計${after.length}件`)
        return after
      })
      setSyncStatus({ status: 'ok', time: new Date(), count: mapped.length })
      showToast(`スプレッドシートを同期しました（${mapped.length}件）`, 'success')

      // ダウンロード履歴も取得（GASが対応していれば）
      try {
        const dlRes = await fetch(url + '?type=downloads')
        if (dlRes.ok) {
          const dlData = await dlRes.json()
          if (Array.isArray(dlData)) {
            setDownloadLeads(dlData)
            saveDownloadLeads(dlData)
          }
        }
      } catch (_) { /* ダウンロード履歴未対応のGASは無視 */ }
    } catch (e) {
      setSyncStatus({ status: 'error', message: e.message, time: new Date() })
      showToast(`同期エラー: ${e.message}`, 'error', 5000)
    }
  }, [showToast])

  // ログイン後に一度だけ自動同期
  useEffect(() => {
    if (currentUser && settings.sheetSyncUrl && !hasSyncedRef.current) {
      hasSyncedRef.current = true
      syncFromSheet(settings.sheetSyncUrl)
    }
  }, [currentUser, settings.sheetSyncUrl, syncFromSheet])

  // Close user menu on outside click
  useEffect(() => {
    const handleClick = (e) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target)) {
        setShowUserMenu(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const handleLogin = (user) => {
    setCurrentUser(user)
  }

  const handleRegister = (user) => {
    setUsers(prev => [...prev, user])
  }

  const handleLogout = () => {
    setCurrentUser(null)
    setShowUserMenu(false)
  }

  const promoteToProposal = (teleapoItem) => {
    const newProposal = {
      id: crypto.randomUUID(),
      initialDate: new Date().toISOString().slice(0, 10),
      companyName: teleapoItem.companyName,
      salesRep: currentUser?.name || '',
      contactName: '',
      industry: teleapoItem.industry || '',
      employeeScale: teleapoItem.employeeScale || '',
      priorityFlag: false,
      other: '',
      position: teleapoItem.contactName || '',
      status: 'アポ確定',
      decisionMakerDate: '',
      conclusionDate: '',
      relationship: '新規',
      lossReason: '',
      lossReasonDetail: '',
      notes: `テレアポより昇格。TEL: ${teleapoItem.phone}`,
      activityLog: [{
        date: new Date().toISOString(),
        type: 'create',
        note: 'テレアポから昇格',
      }],
    }
    setProposals(prev => [...prev, newProposal])
    setTeleapoItems(prev => prev.map(i =>
      i.id === teleapoItem.id
        ? { ...i, status: 'アポ確定', isKept: false, keptBy: '', keptAt: '' }
        : i
    ))
  }

  // Show login screen if not logged in
  if (!currentUser) {
    return (
      <LoginScreen
        users={users}
        onLogin={handleLogin}
        onRegister={handleRegister}
      />
    )
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-[#2d6a9e] shadow-md">
        <div className="px-4">
          <div className="flex items-center h-14">
            {/* Logo */}
            <h1
              className="text-lg font-bold text-white shrink-0 cursor-pointer"
              onClick={() => switchTab('dashboard')}
            >
              Sales Board
            </h1>

            {/* Main Navigation */}
            <nav className="flex gap-0.5 ml-6 overflow-x-auto">
              {TABS.map(tab => (
                <button
                  key={tab.id}
                  onClick={() => switchTab(tab.id)}
                  className={`px-3 py-2 text-[13px] font-medium rounded-t-lg whitespace-nowrap transition-colors ${
                    activeTab === tab.id
                      ? 'bg-white/15 text-white border-b-2 border-white'
                      : 'text-white/60 hover:text-white/90 hover:bg-white/10'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </nav>

            {/* Right side: Settings + User */}
            <div className="ml-auto flex items-center gap-1 shrink-0">
              {/* Settings button */}
              <button
                onClick={() => switchTab('settings')}
                className={`p-2 rounded-lg transition-colors ${
                  activeTab === 'settings'
                    ? 'bg-white/15 text-white'
                    : 'text-white/60 hover:text-white/90 hover:bg-white/10'
                }`}
                title="設定"
              >
                <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                </svg>
              </button>

              {/* Divider */}
              <div className="w-px h-6 bg-white/20 mx-1" />

              {/* User menu */}
              <div className="relative" ref={userMenuRef}>
                <button
                  onClick={() => setShowUserMenu(!showUserMenu)}
                  className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-white/80 hover:text-white hover:bg-white/10 transition-colors"
                >
                  <div className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center text-xs font-bold text-white">
                    {currentUser.name.charAt(0)}
                  </div>
                  <span className="text-[13px] font-medium max-w-[72px] truncate hidden sm:inline">{currentUser.name}</span>
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                  </svg>
                </button>

                {showUserMenu && (
                  <div className="absolute right-0 top-full mt-1 w-48 bg-white rounded-lg shadow-lg border border-slate-200 py-1 z-50 animate-fade-in">
                    <div className="px-3 py-2 border-b border-slate-100">
                      <p className="text-sm font-medium text-slate-800">{currentUser.name}</p>
                      <p className="text-xs text-slate-400">ログイン中</p>
                    </div>
                    <button
                      onClick={handleLogout}
                      className="w-full text-left px-3 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors flex items-center gap-2"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15m3 0 3-3m0 0-3-3m3 3H9" />
                      </svg>
                      ログアウト
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-6">
        {/* 遅延マウント + CSS hidden でフィルター状態を保持 */}
        {mountedTabs.has('dashboard') && (
          <div className={activeTab !== 'dashboard' ? 'hidden' : ''}>
            <Dashboard proposals={proposals} teleapoItems={teleapoItems} onNavigate={navigateToProposals} onNavigateTeleapo={navigateToTeleapo} users={users} />
          </div>
        )}
        {mountedTabs.has('proposals') && (
          <div className={activeTab !== 'proposals' ? 'hidden' : ''}>
            <ProposalList
              proposals={proposals}
              setProposals={setProposals}
              apiKey={settings.apiKey}
              initialFilter={proposalFilter}
              onFilterConsumed={() => setProposalFilter(null)}
              users={users}
              onDeleteProposals={(deleted) => {
                setDeletedKeys(prev => {
                  const next = new Set(prev)
                  deleted.forEach(p => {
                    if (p.companyName) next.add(p.companyName)
                    if (p._sheetRowIndex) next.add(`row:${p._sheetRowIndex}`)
                  })
                  return next
                })
              }}
            />
          </div>
        )}
        {mountedTabs.has('reps') && (
          <div className={activeTab !== 'reps' ? 'hidden' : ''}>
            <SalesRepView proposals={proposals} users={users} />
          </div>
        )}
        {mountedTabs.has('teleapo') && (
          <div className={activeTab !== 'teleapo' ? 'hidden' : ''}>
            <TeleapoList
              items={teleapoItems}
              setItems={setTeleapoItems}
              onPromote={promoteToProposal}
              proposals={proposals}
              currentUser={currentUser}
              users={users}
              downloadLeads={downloadLeads}
              settings={settings}
              initialFilter={teleapoFilter}
              onFilterConsumed={() => setTeleapoFilter(null)}
            />
          </div>
        )}
        {mountedTabs.has('settings') && (
          <div className={activeTab !== 'settings' ? 'hidden' : ''}>
            <Settings
              settings={settings}
              setSettings={setSettings}
              users={users}
              setUsers={setUsers}
              currentUser={currentUser}
              syncStatus={syncStatus}
              onSync={() => syncFromSheet(settings.sheetSyncUrl)}
            />
          </div>
        )}
      </main>
    </div>
  )
}
