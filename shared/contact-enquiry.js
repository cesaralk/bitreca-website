export const contactInterests = ['Website development', 'Applications', 'Custom software', 'Game development', 'Not sure yet']
export const contactRecipient = 'info@bitreca.com'
export const enquiryStatuses = { new: 'New', in_progress: 'In Progress', replied: 'Replied', archived: 'Archived' }

export function normalizeContactPhone(value) {
  if (typeof value !== 'string' || value.length > 40 || !/^[+0-9 ()-]*$/.test(value)) return ''
  const normalized = value.replace(/[ ()-]/g, '')
  return /^\+[1-9][0-9]{7,14}$/.test(normalized) ? normalized : ''
}

export function validateContact(fields) {
  const errors = {}
  const controlCharacters = (value, multiline = false) => [...value].some((char) => {
    const code = char.charCodeAt(0)
    return code === 127 || (code < 32 && !(multiline && [9, 10, 13].includes(code)))
  })
  if (typeof fields.name !== 'string' || !fields.name.trim() || fields.name.length > 100 || controlCharacters(fields.name)) {
    errors.name = 'Enter a name of 1–100 characters on one line.'
  }
  const email = typeof fields.email === 'string' ? fields.email.trim() : ''
  const [local, domain, extra] = email.split('@')
  if (!email || email.length > 254 || !local || local.length > 64 || extra !== undefined ||
      !/^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+$/.test(local) || local.startsWith('.') || local.endsWith('.') || local.includes('..') ||
      !domain || !/^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,63}$/.test(domain) || controlCharacters(fields.email)) {
    errors.email = 'Enter a valid email address, such as name@example.com.'
  }
  if (!contactInterests.includes(fields.service)) errors.service = 'Choose a service, or select “Not sure yet”.'
  if (fields.phone != null && (typeof fields.phone !== 'string' || (fields.phone.trim() && !normalizeContactPhone(fields.phone)))) errors.phone = 'Use an international number, such as +961 70 123 456.'
  if (fields.whatsappConsent != null && typeof fields.whatsappConsent !== 'boolean') errors.phone = 'Choose whether to allow a manual WhatsApp reply.'
  if (typeof fields.phone === 'string' && fields.phone.trim() && fields.whatsappConsent !== true) errors.phone = 'Allow a WhatsApp reply, or leave the optional number blank.'
  if (fields.whatsappConsent === true && !normalizeContactPhone(fields.phone)) errors.phone = 'Provide a valid international number, or clear WhatsApp permission.'
  if (typeof fields.message !== 'string' || fields.message.trim().length < 20 || fields.message.length > 5000 || controlCharacters(fields.message, true)) {
    errors.message = 'Describe your project in 20–5,000 characters without control characters.'
  }
  return errors
}

export function formatContactBrief(fields) {
  return ['Bitreca project enquiry', `Name: ${fields.name.trim()}`, `Email: ${fields.email.trim()}`, `Service interest: ${fields.service}`, ...(fields.whatsappConsent === true && normalizeContactPhone(fields.phone) ? [`WhatsApp reply number: ${normalizeContactPhone(fields.phone)}`] : []), '', fields.message.trim()].join('\n')
}

export function enquiryReplyLinks(enquiry) {
  const emailErrors = validateContact({ name: 'Reply', email: enquiry.email, service: contactInterests[0], message: 'Reply address validation only.' })
  const email = emailErrors.email ? '' : enquiry.email.trim()
  const phone = enquiry.whatsapp_consent === 1 ? normalizeContactPhone(enquiry.phone) : ''
  return {
    email: email ? `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent('Re: Bitreca project enquiry')}` : '',
    whatsapp: phone ? `https://wa.me/${phone.slice(1)}?text=${encodeURIComponent('Hello, I am following up on your Bitreca project enquiry.')}` : '',
  }
}

export function contactWhatsAppUrl(fields) {
  // Keep the deep link short; the full brief can be copied without putting
  // visitor email/name or a long private message in an external URL.
  const interest = contactInterests.includes(fields.service) && fields.service !== 'Not sure yet'
    ? ` about ${fields.service.toLowerCase()}` : ''
  return `https://wa.me/96170864221?text=${encodeURIComponent(`Hello Bitreca, I would like to discuss a project${interest}.`)}`
}
