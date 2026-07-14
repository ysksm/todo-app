export interface HttpClient {
  request<T>(path: string, init?: RequestInit): Promise<T>
}
