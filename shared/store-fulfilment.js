// Private operational metadata; submitted request identities/items stay immutable.
export const fulfilmentStages = {
  new: 'New customer request', supplier_check: 'Supplier availability check',
  customer_confirmed: 'Customer confirmed', sourcing: 'Product sourcing',
  ready_for_delivery: 'Ready for delivery', out_for_delivery: 'Out for delivery',
  completed: 'Completed', cancelled: 'Cancelled', unavailable: 'Unavailable',
}
const stop = ['cancelled', 'unavailable']
export const fulfilmentTransitions = {
  new: ['supplier_check', ...stop], supplier_check: ['customer_confirmed', ...stop],
  customer_confirmed: ['sourcing', ...stop], sourcing: ['ready_for_delivery', ...stop],
  ready_for_delivery: ['sourcing', 'out_for_delivery', ...stop],
  out_for_delivery: ['ready_for_delivery', 'completed', ...stop],
  completed: [], cancelled: ['supplier_check'], unavailable: ['supplier_check'],
}
export const deliveryMethods = { personal: 'Personal delivery', third_party: 'Third-party delivery company' }
export const deliveryStatuses = { not_arranged: 'Not arranged', preparing: 'Preparing delivery', dispatched: 'Dispatched', delivered: 'Delivered', failed: 'Delivery unsuccessful' }
export const paymentMethods = { cod: 'Cash on Delivery', wish_money: 'Wish Money' }
export const paymentStatuses = { pending: 'Pending', confirmed: 'Confirmed received' }
export const fulfilmentFields = ['fulfilment_stage', 'delivery_method', 'delivery_company', 'tracking_reference', 'delivery_notes', 'delivery_status', 'delivery_charge_minor', 'delivery_currency', 'payment_method', 'payment_status']
export const fulfilmentColumns = [...fulfilmentFields, 'customer_confirmed_at'].join(',')
export const fulfilmentDraft = record => Object.fromEntries(fulfilmentFields.map(key => [key, record[key]]))

// No currency conversion, live catalogue repricing, guessed totals or supplier costs.
export function snapshotPriceIssue(items) {
  if (!items.length || items.some(item => !Number.isSafeInteger(item.listed_price_minor) || item.listed_price_minor < 0 || !/^[A-Z]{3}$/.test(item.listed_currency))) return 'Every item needs a fixed captured price and currency. Keep this history intact; obtain a new priced request for items without a captured price.'
  if (new Set(items.map(item => item.listed_currency)).size !== 1) return 'Mixed-currency snapshots cannot be confirmed together. Keep this history intact and obtain separate priced requests.'
  return ''
}

export function validateFulfilment(input, current, items) {
  const errors = {}, data = {}
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(key => ![...fulfilmentFields, 'version', 'customerConfirmation', 'paymentReceiptConfirmed'].includes(key)) || fulfilmentFields.some(key => !Object.hasOwn(input, key)) || !Number.isSafeInteger(input.version) || input.version < 1 || typeof input.customerConfirmation !== 'boolean' || typeof input.paymentReceiptConfirmed !== 'boolean') return { errors: { form: 'Invalid fulfilment fields or request version.' }, data }
  for (const [key, choices, optional] of [['fulfilment_stage', fulfilmentStages], ['delivery_method', deliveryMethods, true], ['delivery_status', deliveryStatuses], ['payment_method', paymentMethods, true], ['payment_status', paymentStatuses]]) {
    if (!(optional && input[key] === null) && (typeof input[key] !== 'string' || !Object.hasOwn(choices, input[key]))) errors[key] = 'Choose a supported option.'
    else data[key] = input[key]
  }
  for (const [key, max] of [['delivery_company', 120], ['tracking_reference', 120], ['delivery_notes', 2000]]) {
    const value = input[key]
    if (typeof value !== 'string' || value.length > max || [...value].some(char => { const code = char.charCodeAt(0); return code === 127 || code < 32 && ![9, 10, 13].includes(code) }) || key !== 'delivery_notes' && /[\r\n\t]/.test(value)) errors[key] = `Use at most ${max} characters without control characters.`
    else data[key] = value.replace(/\r\n?/g, '\n').trim()
  }
  const fee = input.delivery_charge_minor, currency = input.delivery_currency
  if (!((fee === null && currency === null) || Number.isSafeInteger(fee) && fee >= 0 && fee <= 999999999999 && typeof currency === 'string' && /^[A-Z]{3}$/.test(currency))) errors.delivery_charge_minor = 'Set both delivery charge in minor units and its three-letter currency, or leave both unset. Zero explicitly means no charge.'
  else { data.delivery_charge_minor = fee; data.delivery_currency = currency }
  if (data.delivery_method !== 'third_party' && (data.delivery_company || data.tracking_reference)) errors.delivery_company = 'Company and tracking reference apply only to third-party delivery.'
  if (!data.delivery_method && data.delivery_status !== 'not_arranged') errors.delivery_method = 'Select a delivery method before tracking delivery.'
  if (input.fulfilment_stage !== current.fulfilment_stage && !fulfilmentTransitions[current.fulfilment_stage]?.includes(input.fulfilment_stage)) errors.fulfilment_stage = 'This fulfilment transition is not allowed.'
  const confirming = input.fulfilment_stage === 'customer_confirmed' && !current.customer_confirmed_at
  if (confirming) {
    const issue = snapshotPriceIssue(items)
    if (issue) errors.customerConfirmation = issue
    else if (currency !== items[0].listed_currency) errors.delivery_currency = 'Delivery currency must match the captured item currency.'
    if (fee === null || !data.payment_method || input.customerConfirmation !== true) errors.customerConfirmation ||= 'Confirm availability, unchanged captured prices, the explicit delivery charge and selected payment method with the customer first; then tick the confirmation.'
  }
  if (current.customer_confirmed_at && ['delivery_charge_minor', 'delivery_currency', 'payment_method'].some(key => input[key] !== current[key])) errors.form = 'Customer-confirmed price/delivery/payment terms are locked. Do not reprice this request; record any issue in notes or cancel it.'
  if (['sourcing', 'ready_for_delivery', 'out_for_delivery', 'completed'].includes(input.fulfilment_stage) && !current.customer_confirmed_at) errors.fulfilment_stage = 'Customer confirmation is required before sourcing or delivery.'
  if (['ready_for_delivery', 'out_for_delivery'].includes(input.fulfilment_stage) && !data.delivery_method) errors.delivery_method = 'Choose personal or third-party delivery.'
  if (input.payment_status === 'confirmed' && (!data.payment_method || !current.customer_confirmed_at && !confirming)) errors.payment_status = 'Confirm the customer/payment terms before recording receipt.'
  if (input.payment_status === 'confirmed' && current.payment_status !== 'confirmed' && input.paymentReceiptConfirmed !== true) errors.paymentReceiptConfirmed = 'Verify actual receipt and tick the payment acknowledgement. Completion/delivery never confirms payment.'
  return { errors, data, confirming }
}
