export async function adminApi(url, options = {}) {
  const response = await fetch(url, options)

  const data = await response
    .json()
    .catch(() => null)

  return {
    response,
    data,
    unauthorized: response.status === 401,
  }
}