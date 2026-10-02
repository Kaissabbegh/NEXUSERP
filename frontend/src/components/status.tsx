import type { DeliveryStatus, InvoiceStatus, Move, Picking, SaleOrder } from '../lib/types'
import { Pill, type Tone } from './ui'

const orderTone: Record<SaleOrder['state'], Tone> = { draft: 'blue', sale: 'green', cancel: 'gray' }
export const OrderState = ({ order }: { order: Pick<SaleOrder, 'state' | 'state_display'> }) => (
  <Pill tone={orderTone[order.state]} dot>
    {order.state_display}
  </Pill>
)

const deliveryMap: Record<DeliveryStatus, [Tone, string] | null> = {
  none: null,
  pending: ['orange', 'To deliver'],
  partial: ['yellow', 'Partially delivered'],
  full: ['green', 'Delivered'],
}
export const DeliveryState = ({ status }: { status: DeliveryStatus }) => {
  const m = deliveryMap[status]
  return m ? <Pill tone={m[0]}>{m[1]}</Pill> : <span className="text-label-3">—</span>
}

const invoiceMap: Record<InvoiceStatus, [Tone, string] | null> = {
  no: null,
  to_invoice: ['orange', 'To invoice'],
  invoiced: ['green', 'Invoiced'],
}
export const InvoiceState = ({ status }: { status: InvoiceStatus }) => {
  const m = invoiceMap[status]
  return m ? <Pill tone={m[0]}>{m[1]}</Pill> : <span className="text-label-3">—</span>
}

export const MoveState = ({ move }: { move: Pick<Move, 'state' | 'payment_state' | 'move_type'> }) => {
  if (move.state === 'draft') return <Pill tone="gray" dot>Draft</Pill>
  if (move.state === 'cancel') return <Pill tone="gray">Cancelled</Pill>
  if (move.move_type === 'entry') return <Pill tone="blue" dot>Posted</Pill>
  if (move.payment_state === 'paid') return <Pill tone="green" dot>Paid</Pill>
  if (move.payment_state === 'partial') return <Pill tone="yellow" dot>Partially paid</Pill>
  return <Pill tone="orange" dot>Not paid</Pill>
}

export const PickingState = ({ picking }: { picking: Pick<Picking, 'state'> }) =>
  picking.state === 'done' ? <Pill tone="green" dot>Done</Pill> : picking.state === 'ready' ? <Pill tone="blue" dot>Ready</Pill> : <Pill tone="gray">Cancelled</Pill>

export const groupTone: Record<string, Tone> = { asset: 'blue', liability: 'orange', equity: 'purple', income: 'green', expense: 'red' }
export const groupLabel: Record<string, string> = { asset: 'Assets', liability: 'Liabilities', equity: 'Equity', income: 'Income', expense: 'Expenses' }
export const groupSingular: Record<string, string> = { asset: 'Asset', liability: 'Liability', equity: 'Equity', income: 'Income', expense: 'Expense' }
