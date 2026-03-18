import { useState } from 'react'
import { PROPOSAL_STATUSES, STATUS_COLORS, KANBAN_BORDER_COLORS, KANBAN_HEADER_COLORS } from '../constants'

export default function KanbanBoard({ proposals, onStatusChange, onCardClick }) {
  const [dragItem, setDragItem] = useState(null)
  const [dragOverStatus, setDragOverStatus] = useState(null)

  const handleDragStart = (e, proposal) => {
    setDragItem(proposal)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', proposal.id)
    e.currentTarget.classList.add('kanban-card-dragging')
  }

  const handleDragEnd = (e) => {
    e.currentTarget.classList.remove('kanban-card-dragging')
    setDragItem(null)
    setDragOverStatus(null)
  }

  const handleDragOver = (e, status) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOverStatus(status)
  }

  const handleDragLeave = () => {
    setDragOverStatus(null)
  }

  const handleDrop = (e, status) => {
    e.preventDefault()
    setDragOverStatus(null)
    if (dragItem && dragItem.status !== status) {
      onStatusChange(dragItem.id, status)
    }
    setDragItem(null)
  }

  const getColumnCards = (status) => {
    return proposals
      .filter(p => p.status === status)
      .sort((a, b) => {
        if (a.priorityFlag && !b.priorityFlag) return -1
        if (!a.priorityFlag && b.priorityFlag) return 1
        return (b.initialDate || '').localeCompare(a.initialDate || '')
      })
  }

  const formatAmount = (amount) => {
    if (!amount) return null
    if (amount >= 10000) {
      return `¥${(amount / 10000).toFixed(amount % 10000 === 0 ? 0 : 1)}万`
    }
    return `¥${amount.toLocaleString()}`
  }

  return (
    <div className="kanban-scroll flex gap-3 overflow-x-auto pb-4" style={{ minHeight: '60vh' }}>
      {PROPOSAL_STATUSES.map(status => {
        const cards = getColumnCards(status)
        const columnAmount = cards.reduce((sum, p) => sum + (p.expectedAmount || 0), 0)
        const isOver = dragOverStatus === status

        return (
          <div
            key={status}
            className={`flex-shrink-0 w-60 rounded-lg flex flex-col transition-colors ${
              isOver ? 'kanban-column-active' : 'bg-slate-50'
            }`}
            onDragOver={(e) => handleDragOver(e, status)}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(e, status)}
          >
            {/* Column Header */}
            <div className={`rounded-t-lg px-3 py-2 ${KANBAN_HEADER_COLORS[status] || 'bg-gray-200'}`}>
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold truncate">{status}</h4>
                <span className="text-xs bg-white/60 px-1.5 py-0.5 rounded-full font-bold">
                  {cards.length}
                </span>
              </div>
              {columnAmount > 0 && (
                <p className="text-[10px] mt-0.5 opacity-75">
                  {formatAmount(columnAmount)}
                </p>
              )}
            </div>

            {/* Cards */}
            <div className="flex-1 p-2 space-y-2 overflow-y-auto" style={{ maxHeight: '65vh' }}>
              {cards.map(p => (
                <div
                  key={p.id}
                  draggable
                  onDragStart={(e) => handleDragStart(e, p)}
                  onDragEnd={handleDragEnd}
                  onClick={() => onCardClick(p)}
                  className={`bg-white rounded-md shadow-sm p-2.5 cursor-pointer hover:shadow-md transition-all border-l-4 ${
                    KANBAN_BORDER_COLORS[status] || 'border-l-gray-300'
                  } ${p.priorityFlag ? 'ring-1 ring-yellow-300' : ''}`}
                >
                  <div className="flex items-start justify-between gap-1">
                    <p className="font-medium text-xs text-slate-800 leading-tight">
                      {p.priorityFlag && <span className="text-yellow-500 mr-0.5">★</span>}
                      {p.companyName}
                    </p>
                  </div>
                  {p.salesRep && (
                    <p className="text-[10px] text-slate-500 mt-1">{p.salesRep}</p>
                  )}
                  {p.contactName && (
                    <p className="text-[10px] text-slate-400">{p.contactName}{p.position ? ` (${p.position})` : ''}</p>
                  )}
                  <div className="flex items-center justify-between mt-1.5">
                    {p.expectedAmount > 0 ? (
                      <span className="text-[10px] font-bold text-blue-600">
                        {formatAmount(p.expectedAmount)}
                      </span>
                    ) : <span />}
                    {p.initialDate && (
                      <span className="text-[10px] text-slate-400">{p.initialDate.slice(5)}</span>
                    )}
                  </div>
                  {p.relationship && p.relationship !== '新規' && (
                    <span className="inline-block mt-1 text-[9px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded">
                      {p.relationship}
                    </span>
                  )}
                </div>
              ))}
              {cards.length === 0 && (
                <div className="text-center py-6 text-slate-300 text-xs">
                  ドロップで移動
                </div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
