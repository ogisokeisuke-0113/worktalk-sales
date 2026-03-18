export const INDUSTRIES = [
  'IT・ソフトウェア',
  '建設・不動産',
  '医療・福祉・介護',
  '教育・学習支援',
  '製造業',
  '小売・流通',
  '飲食・フード',
  '金融・保険',
  '人材・HR',
  '広告・マーケティング',
  '物流・運輸',
  'サービス業（その他）',
]

export const EMPLOYEE_SCALES = [
  '1~50',
  '50~100',
  '100~200',
  '200~300',
  '300~400',
  '400~500',
  '500~600',
  '600~700',
  '700~800',
  '800~900',
  '900~1000',
  '1000~',
]

export const PROPOSAL_STATUSES = [
  '未提案',
  'アポ調整中',
  'アポ確定',
  'アポ獲得不可',
  '担当者合意',
  '決済者アポ調整中',
  '決済者合意',
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

export const STATUS_COLORS = {
  '未提案': 'bg-gray-100 text-gray-700',
  'アポ調整中': 'bg-blue-100 text-blue-700',
  'アポ確定': 'bg-blue-200 text-blue-800',
  'アポ獲得不可': 'bg-red-100 text-red-700',
  '担当者合意': 'bg-yellow-100 text-yellow-800',
  '決済者アポ調整中': 'bg-purple-100 text-purple-700',
  '決済者合意': 'bg-green-100 text-green-700',
  '受注': 'bg-green-200 text-green-800',
  '失注': 'bg-red-200 text-red-800',
}

export const TELEAPO_STATUS_COLORS = {
  '未架電': 'bg-gray-100 text-gray-700',
  '架電済': 'bg-blue-100 text-blue-700',
  '折り返し待ち': 'bg-yellow-100 text-yellow-700',
  'アポ確定': 'bg-green-100 text-green-700',
}

export const KANBAN_BORDER_COLORS = {
  '未提案': 'border-l-gray-400',
  'アポ調整中': 'border-l-blue-400',
  'アポ確定': 'border-l-blue-600',
  'アポ獲得不可': 'border-l-red-400',
  '担当者合意': 'border-l-yellow-500',
  '決済者アポ調整中': 'border-l-purple-400',
  '決済者合意': 'border-l-green-400',
  '受注': 'border-l-green-600',
  '失注': 'border-l-red-600',
}

export const KANBAN_HEADER_COLORS = {
  '未提案': 'bg-gray-200 text-gray-700',
  'アポ調整中': 'bg-blue-200 text-blue-700',
  'アポ確定': 'bg-blue-300 text-blue-800',
  'アポ獲得不可': 'bg-red-200 text-red-700',
  '担当者合意': 'bg-yellow-200 text-yellow-800',
  '決済者アポ調整中': 'bg-purple-200 text-purple-700',
  '決済者合意': 'bg-green-200 text-green-700',
  '受注': 'bg-green-300 text-green-800',
  '失注': 'bg-red-300 text-red-800',
}

export const FUNNEL_COLORS = ['#94a3b8', '#3b82f6', '#2563eb', '#f59e0b', '#8b5cf6', '#10b981', '#059669']

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
  status: '未提案',
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
