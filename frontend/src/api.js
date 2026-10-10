export class ApiError extends Error {
  constructor(message, status, errors = {}) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.errors = errors
  }
}

const configuredApiUrl = import.meta.env.VITE_API_BASE_URL?.trim()
const apiOrigin = configuredApiUrl
  ? new URL(configuredApiUrl.includes('://') ? configuredApiUrl : `https://${configuredApiUrl}`).origin
  : ''

export async function apiRequest(path, { token, method = 'GET', body, signal } = {}) {
  const headers = { Accept: 'application/json' }
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  if (token) headers.Authorization = `Bearer ${token}`

  const response = await fetch(`${apiOrigin}/api${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    signal,
  })
  const payload = response.status === 204 ? null : await response.json().catch(() => null)

  if (!response.ok) {
    const message = payload?.message || `Request failed with status ${response.status}.`
    throw new ApiError(message, response.status, payload?.errors || {})
  }

  return payload
}