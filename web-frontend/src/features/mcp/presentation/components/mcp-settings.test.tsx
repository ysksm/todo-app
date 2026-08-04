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
  connectorUrl: 'http://127.0.0.1:8000/mcp',
  codexConfig:
    '[mcp_servers.todo-app]\nurl = "http://127.0.0.1:8000/mcp"\nbearer_token_env_var = "TODO_APP_MCP_TOKEN"\n',
  codexEnvCommand: `launchctl setenv TODO_APP_MCP_TOKEN '${API_KEY}'\nexport TODO_APP_MCP_TOKEN='${API_KEY}'`,
  persistEnvScript: `#!/bin/sh\nKEY='${API_KEY}'\necho persist\n`,
  note: null,
}

const PERSIST_RESULT = {
  envVar: 'TODO_APP_MCP_TOKEN',
  zshrcPath: '/Users/tester/.zshrc',
  zshrcChanged: true,
  launchAgentPath: '/Users/tester/Library/LaunchAgents/com.todo-app.mcp-env.plist',
  launchAgentChanged: true,
  launchctlApplied: true,
}

function renderSettings(
  connection: McpConnection | Error = LOCAL_CONNECTION,
  persist: typeof PERSIST_RESULT | Error = PERSIST_RESULT,
) {
  const execute =
    connection instanceof Error
      ? vi.fn().mockRejectedValue(connection)
      : vi.fn().mockResolvedValue(connection)
  const persistExecute =
    persist instanceof Error
      ? vi.fn().mockRejectedValue(persist)
      : vi.fn().mockResolvedValue(persist)
  const dependencies = {
    getMcpConnection: { execute },
    persistMcpEnv: { execute: persistExecute },
  } as unknown as McpDependencies

  render(<McpSettings dependencies={dependencies} />)
  return { execute, persistExecute }
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
    expect(screen.getByRole('heading', { name: 'Codex' })).toBeInTheDocument()
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

  it('shows the api key needed for the consent screen', async () => {
    renderSettings()

    await waitFor(() =>
      expect(screen.getByText('MCP API キー（認可画面で入力するキー）')).toBeInTheDocument(),
    )
  })

  it('hides the api key row for remote clients', async () => {
    renderSettings({ ...LOCAL_CONNECTION, apiKey: null, isLocalRequest: false, note: 'note' })

    await waitFor(() => expect(screen.getByText('note')).toBeInTheDocument())
    expect(
      screen.queryByText('MCP API キー（認可画面で入力するキー）'),
    ).not.toBeInTheDocument()
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

  it('persists the env var with one click and reports what changed', async () => {
    renderSettings()
    const persistButton = await screen.findByRole('button', { name: /環境変数を永続化/ })

    await user.click(persistButton)

    const result = await screen.findByRole('status')
    expect(result).toHaveTextContent('/Users/tester/.zshrc に export を追記・更新しました')
    expect(result).toHaveTextContent('LaunchAgent を登録しました')
    expect(result).toHaveTextContent('Codex / ChatGPT アプリを再起動してください')
  })

  it('reports when everything was already persisted', async () => {
    renderSettings(LOCAL_CONNECTION, {
      ...PERSIST_RESULT,
      zshrcChanged: false,
      launchAgentChanged: false,
    })

    await user.click(await screen.findByRole('button', { name: /環境変数を永続化/ }))

    const result = await screen.findByRole('status')
    expect(result).toHaveTextContent('/Users/tester/.zshrc は設定済みでした')
    expect(result).toHaveTextContent('LaunchAgent は登録済みでした')
  })

  it('shows an error when persisting fails', async () => {
    renderSettings(LOCAL_CONNECTION, new Error('boom'))

    await user.click(await screen.findByRole('button', { name: /環境変数を永続化/ }))

    expect(await screen.findByRole('alert')).toHaveTextContent('永続化に失敗しました')
  })

  it('offers a copyable script for other machines', async () => {
    renderSettings()

    expect(await screen.findByText('別のマシンで実行するスクリプト')).toBeInTheDocument()
  })

  it('hides the persist button for remote clients', async () => {
    renderSettings({ ...LOCAL_CONNECTION, apiKey: null, isLocalRequest: false, note: 'note' })

    await screen.findByText('note')
    expect(screen.queryByRole('button', { name: /環境変数を永続化/ })).not.toBeInTheDocument()
  })

  it('reports a failure to load the connection', async () => {
    renderSettings(new Error('boom'))

    expect(await screen.findByRole('alert')).toHaveTextContent('接続情報を取得できませんでした')
  })
})
