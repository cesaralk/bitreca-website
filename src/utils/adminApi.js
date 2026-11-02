export async function adminApi(url, options = {}) {
  const response = await fetch(url, { credentials: 'same-origin', cache: 'no-store', ...options })

  const data = await response
    .json()
    .catch(() => null)

  return {
    response,
    data,
    unauthorized: response.status === 401,
  }
}
