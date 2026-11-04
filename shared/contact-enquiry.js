export const contactInterests = ['Website development', 'Applications', 'Custom software', 'Game development', 'Not sure yet']
export const contactRecipient = 'info@bitreca.com'

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
  if (typeof fields.message !== 'string' || fields.message.trim().length < 20 || fields.message.length > 5000 || controlCharacters(fields.message, true)) {
    errors.message = 'Describe your project in 20–5,000 characters without control characters.'
  }
  return errors
}

export function formatContactBrief(fields) {
  return ['Bitreca project enquiry', `Name: ${fields.name.trim()}`, `Email: ${fields.email.trim()}`, `Service interest: ${fields.service}`, '', fields.message.trim()].join('\n')
}

export function contactWhatsAppUrl(fields) {
  // Keep the deep link short; the full brief can be copied without putting
  // visitor email/name or a long private message in an external URL.
  const interest = contactInterests.includes(fields.service) && fields.service !== 'Not sure yet'
    ? ` about ${fields.service.toLowerCase()}` : ''
  return `https://wa.me/96170864221?text=${encodeURIComponent(`Hello Bitreca, I would like to discuss a project${interest}.`)}`
}
