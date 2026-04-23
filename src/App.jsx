import { useState, useEffect, useRef } from 'react'
import { loadProposals, saveProposals, loadTeleapo, saveTeleapo, loadSettings, saveSettings, loadUsers, saveUsers, loadCurrentUser, saveCurrentUser, loadPerformance, savePerformance } from './storage'
import Dashboard from './components/Dashboard'
import ProposalList from './components/ProposalList'
import SalesRepView from './components/SalesRepView'
import TeleapoList from './components/TeleapoList'
import PerformanceAnalysis from './components/PerformanceAnalysis'
import Settings from './components/Settings'
import LoginScreen from './components/LoginScreen'

const TABS = [
  { id: 'dashboard', label: 'ダッシュボード' },
  { id: 'reps', label: '担当別' },
  { id: 'proposals', label: '提案リスト' },
  { id: 'teleapo', label: 'テレアポ' },
  { id: 'performance', label: '成果分析' },
]

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
  const [users, setUsers] = useState(() => loadUsers())
  const [currentUser, setCurrentUser] = useState(() => loadCurrentUser())
  const [activeTab, setActiveTab] = useState('dashboard')
  const [proposalFilter, setProposalFilter] = useState(null)
  const [showUserMenu, setShowUserMenu] = useState(false)
  const userMenuRef = useRef(null)

  // ダッシュボードからフィルタ付きで提案リストに遷移
  const navigateToProposals = (filter) => {
    setProposalFilter(filter)
    setActiveTab('proposals')
  }
  const [proposals, setProposals] = useState(() => migrateKessaisha(removeInvalidStatuses(migrateIndustry(loadProposals()))))
  const [teleapoItems, setTeleapoItems] = useState(() => loadTeleapo())
  const [settings, setSettings] = useState(() => loadSettings())
  const [performance, setPerformance] = useState(() => loadPerformance())

  useEffect(() => { saveProposals(proposals) }, [proposals])
  useEffect(() => { saveTeleapo(teleapoItems) }, [teleapoItems])
  useEffect(() => { saveSettings(settings) }, [settings])
  useEffect(() => { saveUsers(users) }, [users])
  useEffect(() => { saveCurrentUser(currentUser) }, [currentUser])
  useEffect(() => { savePerformance(performance) }, [performance])

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
      expectedAmount: 0,
      actualAmount: 0,
      activityLog: [{
        date: new Date().toISOString(),
        type: 'create',
        note: 'テレアポから昇格',
      }],
    }
    setProposals(prev => [...prev, newProposal])
    setTeleapoItems(prev => prev.filter(i => i.id !== teleapoItem.id))
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
              onClick={() => setActiveTab('dashboard')}
            >
              Sales Board
            </h1>

            {/* Main Navigation */}
            <nav className="flex gap-0.5 ml-6 overflow-x-auto">
              {TABS.map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
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
                onClick={() => setActiveTab('settings')}
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
        {activeTab === 'dashboard' && <Dashboard proposals={proposals} teleapoItems={teleapoItems} onNavigate={navigateToProposals} users={users} />}
        {activeTab === 'proposals' && (
          <ProposalList
            proposals={proposals}
            setProposals={setProposals}
            apiKey={settings.apiKey}
            initialFilter={proposalFilter}
            onFilterConsumed={() => setProposalFilter(null)}
            users={users}
          />
        )}
        {activeTab === 'reps' && <SalesRepView proposals={proposals} users={users} />}
        {activeTab === 'performance' && (
          <PerformanceAnalysis
            proposals={proposals}
            performance={performance}
            setPerformance={setPerformance}
          />
        )}
        {activeTab === 'teleapo' && (
          <TeleapoList
            items={teleapoItems}
            setItems={setTeleapoItems}
            onPromote={promoteToProposal}
            proposals={proposals}
            currentUser={currentUser}
            users={users}
          />
        )}
        {activeTab === 'settings' && (
          <Settings settings={settings} setSettings={setSettings} users={users} setUsers={setUsers} currentUser={currentUser} />
        )}
      </main>
    </div>
  )
}
