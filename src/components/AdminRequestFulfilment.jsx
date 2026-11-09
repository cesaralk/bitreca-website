import { useRef, useState } from 'react'
import { useAdminApi } from '../hooks/useAdminApi'
import { deliveryMethods, deliveryStatuses, fulfilmentDraft, fulfilmentStages, fulfilmentTransitions, paymentMethods, paymentStatuses, snapshotPriceIssue } from '../../shared/store-fulfilment'

export default function AdminRequestFulfilment({ record, items, busy, blocked, onBusy, onSaved, onConflict }) {
  const request = useAdminApi(), mutex = useRef(false), form = useRef(null)
  const [fields, setFields] = useState(() => fulfilmentDraft(record)), [errors, setErrors] = useState({}), [notice, setNotice] = useState('')
  const [customerConfirmation, setCustomerConfirmation] = useState(false), [paymentReceiptConfirmed, setPaymentReceiptConfirmed] = useState(false)
  const locked = Boolean(record.customer_confirmed_at), priceIssue = snapshotPriceIssue(items)
  function edit(key, value) { setFields(current => ({ ...current, [key]: value })); setErrors({}); setNotice('') }
  function select(key, label, choices, optional = false, disabled = false) {
    return <label htmlFor={`fulfilment-${key}`}>{label}<select id={`fulfilment-${key}`} value={fields[key] ?? ''} disabled={disabled} onChange={event => edit(key, event.target.value || null)} aria-invalid={Boolean(errors[key])} aria-describedby={errors[key] ? `fulfilment-${key}-error` : undefined}>{optional && <option value="">Not selected</option>}{Object.entries(choices).map(([value, text]) => <option value={value} key={value}>{text}</option>)}</select>{errors[key] && <span id={`fulfilment-${key}-error`} className="fulfilment-error">{errors[key]}</span>}</label>
  }
  async function save(event) {
    event.preventDefault()
    if (mutex.current || busy || blocked) return
    mutex.current = true; onBusy(true); setErrors({}); setNotice('Saving fulfilment details…')
    try {
      const fee = fields.delivery_charge_minor
      const body = { ...fields, delivery_charge_minor: fee === null || fee === '' ? null : /^\d+$/.test(String(fee)) ? Number(fee) : -1, delivery_currency: fields.delivery_currency || null, version: record.version, customerConfirmation, paymentReceiptConfirmed }
      const result = await request(`/api/admin/store/requests/${record.id}/fulfilment`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(12000) })
      if (!result) return
      if (!result.response.ok || result.data?.success !== true || result.data.record?.id !== record.id || result.data.record.version !== record.version + 1) {
        if (result.response.status === 409) onConflict()
        if (result.data?.errors && typeof result.data.errors === 'object') setErrors(Object.fromEntries(Object.entries(result.data.errors).filter(([, value]) => typeof value === 'string')))
        throw Error(result.data?.message || 'Save unconfirmed. Reload before retrying.')
      }
      onSaved()
    } catch (error) { setNotice(error.message || 'Save unconfirmed. Reload before retrying.'); requestAnimationFrame(() => form.current?.querySelector('[aria-invalid="true"]')?.focus()) }
    finally { mutex.current = false; onBusy(false) }
  }
  const stages = Object.fromEntries([record.fulfilment_stage, ...fulfilmentTransitions[record.fulfilment_stage]].map(stage => [stage, fulfilmentStages[stage]]))
  return <form ref={form} className="store-fulfilment" onSubmit={save} noValidate aria-labelledby="fulfilment-title">
    <h3 id="fulfilment-title">Order fulfilment</h3>
    <p className="enquiries-help">Supplier checks and purchases, customer confirmation, delivery and replies are manual. Fulfilment stage, delivery status and payment receipt are recorded separately. No stock, supplier order or customer message is changed automatically.</p>
    <fieldset disabled={busy || blocked}><legend>Progress and agreed terms</legend>
      {select('fulfilment_stage', 'Fulfilment stage', stages)}
      {locked ? <p className="enquiries-help">Customer agreement recorded {new Date(record.customer_confirmed_at * 1000).toLocaleString()}. Captured item prices, delivery charge/currency and payment method are locked. Cancellation or unavailability preserves them.</p> : <p className="enquiries-help">Honour the submitted item prices shown above. Before customer confirmation, agree the delivery charge explicitly (zero for no charge) and choose a payment method. No supplier-cost field can reprice this request.</p>}
      {priceIssue && <p className="fulfilment-error">{priceIssue}</p>}
      <div className="fulfilment-grid"><label htmlFor="fulfilment-delivery-charge">Agreed delivery charge (minor units; enter 100 for USD 1.00)<input id="fulfilment-delivery-charge" type="text" inputMode="numeric" maxLength={12} value={fields.delivery_charge_minor ?? ''} disabled={locked} onChange={event => edit('delivery_charge_minor', event.target.value)} aria-invalid={Boolean(errors.delivery_charge_minor)} aria-describedby="fulfilment-fee-help" /></label><label htmlFor="fulfilment-delivery-currency">Delivery currency (same as captured items)<input id="fulfilment-delivery-currency" type="text" maxLength={3} value={fields.delivery_currency ?? ''} disabled={locked} onChange={event => edit('delivery_currency', event.target.value.toUpperCase())} aria-invalid={Boolean(errors.delivery_currency)} /></label></div>
      <p id="fulfilment-fee-help" className="enquiries-help">Leave both fields unset until agreed. Enter currency as three letters, e.g. USD. Existing snapshots are never edited. {errors.delivery_charge_minor || errors.delivery_currency}</p>
      {select('payment_method', 'Payment method agreed with customer', paymentMethods, true, locked)}
      {!locked && fields.fulfilment_stage === 'customer_confirmed' && <label className="fulfilment-check"><input id="fulfilment-customer-confirmation" type="checkbox" checked={customerConfirmation} onChange={event => setCustomerConfirmation(event.target.checked)} aria-invalid={Boolean(errors.customerConfirmation)} />I manually checked supplier availability and confirmed the captured item prices, delivery charge and selected payment method with the customer.</label>}
      {errors.customerConfirmation && <p className="fulfilment-error" role="alert">{errors.customerConfirmation}</p>}
    </fieldset>
    <fieldset disabled={busy || blocked}><legend>Delivery tracking (optional)</legend>
      {select('delivery_method', 'Delivery method', deliveryMethods, true)}
      {fields.delivery_method === 'third_party' && <div className="fulfilment-grid">{[['delivery_company', 'Delivery company name'], ['tracking_reference', 'Tracking reference']].map(([key, label]) => <label key={key} htmlFor={`fulfilment-${key}`}>{label}<input id={`fulfilment-${key}`} type="text" maxLength={120} value={fields[key]} onChange={event => edit(key, event.target.value)} aria-invalid={Boolean(errors[key])} /></label>)}</div>}
      {fields.delivery_method !== 'third_party' && (fields.delivery_company || fields.tracking_reference) && <button type="button" onClick={() => { edit('delivery_company', ''); edit('tracking_reference', '') }}>Clear previous company/tracking fields</button>}
      {errors.delivery_company && <p className="fulfilment-error" role="alert">{errors.delivery_company}</p>}{errors.tracking_reference && <p className="fulfilment-error" role="alert">{errors.tracking_reference}</p>}
      {select('delivery_status', 'Delivery status', deliveryStatuses)}
      <label htmlFor="fulfilment-delivery_notes">Private delivery / sourcing notes (up to 2,000 characters)<textarea id="fulfilment-delivery_notes" rows={4} maxLength={2000} value={fields.delivery_notes} onChange={event => edit('delivery_notes', event.target.value)} aria-invalid={Boolean(errors.delivery_notes)} /></label>
      <p className="enquiries-help">Record customer-agreed delivery details or an unavailable/cancellation reason. Do not store passwords, payment credentials or unnecessary personal information.</p>{errors.delivery_notes && <p className="fulfilment-error" role="alert">{errors.delivery_notes}</p>}
    </fieldset>
    <fieldset disabled={busy || blocked}><legend>Payment receipt — manual record</legend>
      {select('payment_status', 'Payment received', paymentStatuses)}
      <p className="enquiries-help">Completing an order or delivery never marks it paid. Verify Cash on Delivery collection or actual Wish Money receipt yourself. This page collects no payment and sends no payment instructions.</p>
      {fields.payment_status === 'confirmed' && record.payment_status !== 'confirmed' && <label className="fulfilment-check"><input id="fulfilment-payment-receipt" type="checkbox" checked={paymentReceiptConfirmed} onChange={event => setPaymentReceiptConfirmed(event.target.checked)} aria-invalid={Boolean(errors.paymentReceiptConfirmed)} />I verified actual receipt of this payment.</label>}
      {errors.paymentReceiptConfirmed && <p className="fulfilment-error" role="alert">{errors.paymentReceiptConfirmed}</p>}
    </fieldset>
    {errors.form && <p role="alert" className="fulfilment-error">{errors.form}</p>}
    <button type="submit" disabled={busy || blocked}>{busy ? 'Saving…' : 'Save fulfilment details'}</button><p role="status" aria-live="polite">{notice}</p>
  </form>
}
