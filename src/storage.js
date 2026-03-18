const PROPOSALS_KEY = 'worktalk_proposals'
const TELEAPO_KEY = 'worktalk_teleapo'
const SETTINGS_KEY = 'worktalk_settings'

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
    return data ? JSON.parse(data) : { apiKey: '' }
  } catch {
    return { apiKey: '' }
  }
}

export function saveSettings(settings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
}
