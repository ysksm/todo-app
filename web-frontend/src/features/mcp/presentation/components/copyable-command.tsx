import { useEffect, useState } from 'react'

interface CopyableCommandProps {
  label: string
  value: string
  /** 伏せ字にしたい部分（認証キーなど）。 */
  secret?: string | null
}

export function CopyableCommand({ label, value, secret }: CopyableCommandProps) {
  const [isRevealed, setIsRevealed] = useState(false)
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle')

  useEffect(() => {
    if (copyState === 'idle') {
      return
    }
    const timer = window.setTimeout(() => setCopyState('idle'), 2000)
    return () => window.clearTimeout(timer)
  }, [copyState])

  async function copy() {
    try {
      await navigator.clipboard.writeText(value)
      setCopyState('copied')
    } catch {
      setCopyState('failed')
    }
  }

  const displayedValue = secret && !isRevealed ? value.replaceAll(secret, maskOf(secret)) : value

  return (
    <div className="mcp-command">
      <div className="mcp-command__header">
        <span className="mcp-command__label">{label}</span>
        <div className="mcp-command__buttons">
          {secret && (
            <button type="button" onClick={() => setIsRevealed((revealed) => !revealed)}>
              {isRevealed ? 'キーを隠す' : 'キーを表示'}
            </button>
          )}
          <button type="button" onClick={() => void copy()}>
            {copyState === 'copied' ? 'コピーしました' : copyState === 'failed' ? 'コピー失敗' : 'コピー'}
          </button>
        </div>
      </div>
      <pre className="mcp-command__value">
        <code>{displayedValue}</code>
      </pre>
    </div>
  )
}

function maskOf(secret: string): string {
  const visibleLength = Math.min(4, secret.length)
  return `${secret.slice(0, visibleLength)}${'•'.repeat(Math.max(secret.length - visibleLength, 0))}`
}
