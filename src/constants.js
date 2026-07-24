export const INDUSTRIES = [
  'IT・SaaS',
  '人材',
  '不動産',
  '建設',
  '住宅',
  '医療・福祉',
  '教育',
  'メーカー',
  'コンサル・士業',
  'M&A',
  '広告・マーケ',
  '保険・金融',
  '商社',
  'サービス・その他',
]

export const EMPLOYEE_SCALES = [
  '1〜30名',
  '31〜100名',
  '101〜300名',
  '301〜500名',
  '501〜1000名',
  '1001〜3000名',
  '3001名〜',
]

export const PROPOSAL_STATUSES = [
  'アポ確定',
  '担当者合意',
  '決裁者アポ調整中',
  '決裁者合意',
  '受注',
  '失注',
]

export const RELATIONSHIPS = [
  '新規',
  '既存CL',
  '前職CL',
  'EO大阪',
  '相互紹介',
  '業務委託',
  '営業代行',
  '代理店',
]

export const LOSS_REASONS = [
  '採用人数10名未満',
  'HP設置不可',
  '先行投資不可',
  '採用単価30万円未満',
  '旧ダイレクト契約済み',
]

export const TELEAPO_STATUSES = [
  '未架電',
  '架電済',
  '折り返し待ち',
  'アポ確定',
]

export const CALL_RESULTS = [
  '不在',
  '受付ブロック',
  '担当者不在',
  '資料送付済',
  '折り返し依頼',
  '断り',
]

export const STATUS_COLORS = {
  'アポ確定': 'bg-sky-100 text-[#2d6a9e]',

  '担当者合意': 'bg-amber-50 text-[#b45309]',
  '決裁者アポ調整中': 'bg-slate-100 text-[#5a7a8a]',
  '決裁者合意': 'bg-teal-50 text-[#0f766e]',
  '受注': 'bg-teal-100 text-[#0f766e]',
  '失注': 'bg-rose-100 text-[#be123c]',
}

export const TELEAPO_STATUS_COLORS = {
  '未架電': 'bg-slate-100 text-slate-600',
  '架電済': 'bg-sky-50 text-[#4a82ae]',
  '折り返し待ち': 'bg-amber-50 text-[#b45309]',
  'アポ確定': 'bg-teal-50 text-[#0f766e]',
}

export const EMAIL_STATUSES = ['未送信', '送信済み', '開封済み', 'クリック済み']

export const EMAIL_STATUS_COLORS = {
  '未送信': 'bg-slate-100 text-slate-400',
  '送信済み': 'bg-blue-50 text-blue-600',
  '開封済み': 'bg-amber-50 text-amber-700',
  'クリック済み': 'bg-teal-50 text-[#0f766e]',
}

export const KANBAN_BORDER_COLORS = {
  'アポ確定': 'border-l-[#4a82ae]',

  '担当者合意': 'border-l-[#b45309]',
  '決裁者アポ調整中': 'border-l-[#5a7a8a]',
  '決裁者合意': 'border-l-[#0f766e]',
  '受注': 'border-l-[#0f766e]',
  '失注': 'border-l-[#be123c]',
}

export const KANBAN_HEADER_COLORS = {
  'アポ確定': 'bg-sky-200 text-[#2d6a9e]',

  '担当者合意': 'bg-amber-100 text-[#b45309]',
  '決裁者アポ調整中': 'bg-slate-200 text-[#5a7a8a]',
  '決裁者合意': 'bg-teal-100 text-[#0f766e]',
  '受注': 'bg-teal-200 text-[#0f766e]',
  '失注': 'bg-rose-200 text-[#be123c]',
}

export const FUNNEL_COLORS = ['#dbe6f0', '#b8cfe0', '#93b5d0', '#6e9bbf', '#4a82ae', '#2d6a9e', '#1a5285']

export const DEFAULT_PROPOSAL = {
  id: '',
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
  activityLog: [],
}
