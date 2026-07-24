const PROPOSALS_KEY = 'worktalk_proposals'
const TELEAPO_KEY = 'worktalk_teleapo'
const SETTINGS_KEY = 'worktalk_settings'
const USERS_KEY = 'worktalk_users'
const CURRENT_USER_KEY = 'worktalk_current_user'

export function loadProposals() {
  try {
    const data = localStorage.getItem(PROPOSALS_KEY)
    return data ? JSON.parse(data) : []
  } catch {
    return []
  }
}

export function saveProposals(proposals) {
  localStorage.setItem(PROPOSALS_KEY, JSON.stringify(proposals))
}

export function loadTeleapo() {
  try {
    const data = localStorage.getItem(TELEAPO_KEY)
    return data ? JSON.parse(data) : []
  } catch {
    return []
  }
}

export function saveTeleapo(items) {
  localStorage.setItem(TELEAPO_KEY, JSON.stringify(items))
}

export function loadSettings() {
  try {
    const data = localStorage.getItem(SETTINGS_KEY)
    const defaults = {
      apiKey: '',
      sheetSyncUrl: '',
      emailFrom: 'noreply@work-talk.jp',
      emailSenderName: 'WorkTalk営業チーム',
      emailTemplates: [
        {
          id: 'default',
          name: 'アプローチメール（標準）',
          subject: '【WorkTalk】ご挨拶のご連絡',
          body: '{{会社名}} 御中\n\n突然のご連絡失礼いたします。\nWorkTalkの{{送信者名}}と申します。\n\nこの度は弊社サービスをご案内したく、ご連絡差し上げました。\n貴社の採用・人材育成のお役に立てると考えております。\n\nご興味がございましたら、お気軽にご返信ください。\n詳しいご説明の機会をいただけますと幸いです。\n\nどうぞよろしくお願いいたします。',
        },
      ],
    }
    return data ? { ...defaults, ...JSON.parse(data) } : defaults
  } catch {
    return {
      apiKey: '',
      sheetSyncUrl: '',
      emailFrom: 'noreply@work-talk.jp',
      emailSenderName: 'WorkTalk営業チーム',
      emailSubject: '【WorkTalk】ご挨拶のご連絡',
      emailBody: '',
    }
  }
}

export function saveSettings(settings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
}

// Users management
export function loadUsers() {
  try {
    const data = localStorage.getItem(USERS_KEY)
    return data ? JSON.parse(data) : []
  } catch {
    return []
  }
}

export function saveUsers(users) {
  localStorage.setItem(USERS_KEY, JSON.stringify(users))
}

export function loadCurrentUser() {
  try {
    const data = localStorage.getItem(CURRENT_USER_KEY)
    return data ? JSON.parse(data) : null
  } catch {
    return null
  }
}

export function saveCurrentUser(user) {
  if (user) {
    localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(user))
  } else {
    localStorage.removeItem(CURRENT_USER_KEY)
  }
}

// Performance data management
const PERFORMANCE_KEY = 'worktalk_performance'

export function loadPerformance() {
  try {
    const data = localStorage.getItem(PERFORMANCE_KEY)
    return data ? JSON.parse(data) : []
  } catch {
    return []
  }
}

export function savePerformance(items) {
  localStorage.setItem(PERFORMANCE_KEY, JSON.stringify(items))
}

// ダウンロード履歴
const DOWNLOAD_LEADS_KEY = 'worktalk_download_leads'

export function loadDownloadLeads() {
  try {
    const data = localStorage.getItem(DOWNLOAD_LEADS_KEY)
    return data ? JSON.parse(data) : []
  } catch { return [] }
}

export function saveDownloadLeads(items) {
  localStorage.setItem(DOWNLOAD_LEADS_KEY, JSON.stringify(items))
}

// 削除済み企業キー（同期で復活させない）
const DELETED_KEYS_KEY = 'worktalk_deleted_keys'

export function loadDeletedKeys() {
  try {
    const data = localStorage.getItem(DELETED_KEYS_KEY)
    return data ? new Set(JSON.parse(data)) : new Set()
  } catch { return new Set() }
}

export function saveDeletedKeys(keys) {
  localStorage.setItem(DELETED_KEYS_KEY, JSON.stringify([...keys]))
}
