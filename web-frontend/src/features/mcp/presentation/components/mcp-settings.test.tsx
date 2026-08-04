import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { McpDependencies } from '../../di/mcp-dependencies'
import type { McpConnection } from '../../domain/entities/mcp-connection'
import { McpSettings } from './mcp-settings'

const API_KEY = 'secret-key-1234'

const LOCAL_CONNECTION: McpConnection = {
  serverName: 'todo-app',
  url: 'http://127.0.0.1:8000/mcp',
  headerName: 'Authorization',
  apiKey: API_KEY,
  isLocalRequest: true,
  addCommand: `claude mcp add --transport http todo-app http://127.0.0.1:8000/mcp --header "Authorization: Bearer ${API_KEY}"`,
  clientConfig: `{\n  "url": "http://127.0.0.1:8000/mcp",\n  "key": "${API_KEY}"\n}`,
  connectorUrl: `http://127.0.0.1:8000/mcp?key=${API_KEY}`,
  codexConfig: `[mcp_servers.todo-app]\nurl = "http://127.0.0.1:8000/mcp?key=${API_KEY}"\n`,
  note: null,
}

function renderSettings(connection: McpConnection | Error = LOCAL_CONNECTION) {
  const execute =
    connection instanceof Error
      ? vi.fn().mockRejectedValue(connection)
      : vi.fn().mockResolvedValue(connection)
  const dependencies = { getMcpConnection: { execute } } as unknown as McpDependencies

  render(<McpSettings dependencies={dependencies} />)
  return { execute }
}

let user: ReturnType<typeof userEvent.setup>
let writeText: ReturnType<typeof vi.fn>

beforeEach(() => {
  user = userEvent.setup()
  // jsdom の navigator.clipboard は読み取り専用なので、プロパティごと差し替える。
  writeText = vi.fn().mockResolvedValue(undefined)
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText },
  })
})

describe('McpSettings', () => {
  it('shows a registration section for every client', async () => {
    renderSettings()

    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Claude Code' })).toBeInTheDocument(),
    )
    expect(screen.getByRole('heading', { name: 'Claude アプリ' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'ChatGPT' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Codex CLI' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'その他のクライアント' })).toBeInTheDocument()
  })

  it('shows the add command for Claude Code', async () => {
    renderSettings()

    await waitFor(() =>
      expect(screen.getByText(/claude mcp add --transport http todo-app/)).toBeInTheDocument(),
    )
  })

  it('shows the codex config snippet', async () => {
    renderSettings()

    await waitFor(() =>
      expect(screen.getByText(/\[mcp_servers\.todo-app\]/)).toBeInTheDocument(),
    )
  })

  it('masks the api key until it is revealed', async () => {
    renderSettings()
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Claude Code' })).toBeInTheDocument(),
    )

    expect(screen.queryByText(new RegExp(API_KEY))).not.toBeInTheDocument()
    expect(screen.getAllByText(/secr•+/).length).toBeGreaterThan(0)

    await user.click(screen.getAllByRole('button', { name: 'キーを表示' })[0])

    expect(screen.getByText(new RegExp(API_KEY))).toBeInTheDocument()
  })

  it('copies the full command including the key', async () => {
    renderSettings()
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Claude Code' })).toBeInTheDocument(),
    )

    const claudeCodeSection = screen.getByRole('region', { name: 'Claude Code' })
    await user.click(within(claudeCodeSection).getByRole('button', { name: 'コピー' }))

    expect(writeText).toHaveBeenCalledWith(LOCAL_CONNECTION.addCommand)
    expect(await screen.findByRole('button', { name: 'コピーしました' })).toBeInTheDocument()
  })

  it('warns that the key must not be shared', async () => {
    renderSettings()

    expect(await screen.findByText(/共有しないでください/)).toBeInTheDocument()
  })

  it('shows the server note instead of a key for remote clients', async () => {
    renderSettings({
      ...LOCAL_CONNECTION,
      apiKey: null,
      isLocalRequest: false,
      note: 'キーはローカルからのみ表示されます。',
    })

    expect(await screen.findByText('キーはローカルからのみ表示されます。')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'キーを表示' })).not.toBeInTheDocument()
    expect(screen.queryByText(/共有しないでください/)).not.toBeInTheDocument()
  })

  it('reports a failure to load the connection', async () => {
    renderSettings(new Error('boom'))

    expect(await screen.findByRole('alert')).toHaveTextContent('接続情報を取得できませんでした')
  })
})
