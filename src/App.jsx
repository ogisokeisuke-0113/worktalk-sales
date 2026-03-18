import { useState, useEffect } from 'react'
import { loadProposals, saveProposals, loadTeleapo, saveTeleapo, loadSettings, saveSettings } from './storage'
import Dashboard from './components/Dashboard'
import ProposalList from './components/ProposalList'
import SalesRepView from './components/SalesRepView'
import TeleapoList from './components/TeleapoList'
import Settings from './components/Settings'

const TABS = [
  { id: 'dashboard', label: 'ダッシュボード' },
  { id: 'proposals', label: '提案リスト' },
  { id: 'reps', label: '営業担当別' },
  { id: 'teleapo', label: 'テレアポリスト' },
  { id: 'settings', label: '設定' },
]

export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard')
  const [proposals, setProposals] = useState(() => loadProposals())
  const [teleapoItems, setTeleapoItems] = useState(() => loadTeleapo())
  const [settings, setSettings] = useState(() => loadSettings())

  useEffect(() => { saveProposals(proposals) }, [proposals])
  useEffect(() => { saveTeleapo(teleapoItems) }, [teleapoItems])
  useEffect(() => { saveSettings(settings) }, [settings])

  const promoteToProposal = (teleapoItem) => {
    const newProposal = {
      id: crypto.randomUUID(),
      initialDate: new Date().toISOString().slice(0, 10),
      companyName: teleapoItem.companyName,
      salesRep: '',
      contactName: '',
      industry: '',
      employeeScale: '',
      priorityFlag: false,
      other: '',
      position: teleapoItem.contactName || '',
      status: '未提案',
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

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex items-center justify-between h-14">
            <h1 className="text-lg font-bold text-slate-800 shrink-0">
              worktalk ダイレクト 営業管理
            </h1>
            <nav className="flex gap-1 ml-8 overflow-x-auto">
              {TABS.map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`px-4 py-2 text-sm font-medium rounded-t-lg whitespace-nowrap transition-colors ${
                    activeTab === tab.id
                      ? 'bg-slate-100 text-blue-600 border-b-2 border-blue-600'
                      : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </nav>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6">
        {activeTab === 'dashboard' && <Dashboard proposals={proposals} />}
        {activeTab === 'proposals' && (
          <ProposalList
            proposals={proposals}
            setProposals={setProposals}
            apiKey={settings.apiKey}
          />
        )}
        {activeTab === 'reps' && <SalesRepView proposals={proposals} />}
        {activeTab === 'teleapo' && (
          <TeleapoList
            items={teleapoItems}
            setItems={setTeleapoItems}
            onPromote={promoteToProposal}
          />
        )}
        {activeTab === 'settings' && (
          <Settings settings={settings} setSettings={setSettings} />
        )}
      </main>
    </div>
  )
}
