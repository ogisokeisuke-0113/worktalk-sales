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
    const defaults = { apiKey: '', sheetSyncUrl: '' }
    return data ? { ...defaults, ...JSON.parse(data) } : defaults
  } catch {
    return { apiKey: '', sheetSyncUrl: '' }
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
