import type { HttpClient } from './http-client'
import { HttpError } from './http-error'

/**
 * サーバーが応答しないときに isSaving が立ちっぱなしになり、
 * 画面の全ボタンが無効のまま戻らなくなるのを防ぐための上限。
 */
const REQUEST_TIMEOUT_MS = 15_000

export class FetchHttpClient implements HttpClient {
  private readonly baseUrl: string

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl
  }

  async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      ...init,
    })

    if (!response.ok) {
      const message = await this.readErrorMessage(response)
      throw new HttpError(response.status, message)
    }

    if (response.status === 204) {
      return undefined as T
    }

    return response.json() as Promise<T>
  }

  private async readErrorMessage(response: Response): Promise<string> {
    try {
      const body = (await response.json()) as { detail?: string }
      return body.detail ?? `Request failed with status ${response.status}`
    } catch {
      return `Request failed with status ${response.status}`
    }
  }
}
