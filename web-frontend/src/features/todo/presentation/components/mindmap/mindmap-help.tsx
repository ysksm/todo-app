interface MindmapHelpProps {
  onClose(): void
}

const SHORTCUTS: readonly { keys: readonly string[]; description: string }[] = [
  { keys: ['→'], description: '子タスクへ移動（折りたたみ中なら展開）' },
  { keys: ['←'], description: '親タスクへ移動' },
  { keys: ['↑', '↓'], description: '同じ親の兄弟タスクへ移動' },
  { keys: ['Home', 'End'], description: '兄弟の先頭 / 末尾へ移動' },
  { keys: ['F2'], description: 'タイトルを編集' },
  { keys: ['Enter'], description: '兄弟タスクを追加（編集中は確定）' },
  { keys: ['Tab'], description: '子タスクを追加' },
  { keys: ['Delete'], description: 'タスクを削除（子タスクも削除）' },
  { keys: ['Space'], description: '完了・未完了を切り替え' },
  { keys: ['Esc'], description: '編集を取り消す' },
  { keys: ['?'], description: 'このヘルプを開閉' },
]

export function MindmapHelp({ onClose }: MindmapHelpProps) {
  return (
    <aside className="mindmap-help" aria-label="キー操作の一覧">
      <header className="mindmap-help__header">
        <h2>キー操作</h2>
        <button type="button" onClick={onClose} aria-label="ヘルプを閉じる">
          ×
        </button>
      </header>
      <dl className="mindmap-help__list">
        {SHORTCUTS.map((shortcut) => (
          <div key={shortcut.description} className="mindmap-help__row">
            <dt>
              {shortcut.keys.map((key) => (
                <kbd key={key}>{key}</kbd>
              ))}
            </dt>
            <dd>{shortcut.description}</dd>
          </div>
        ))}
      </dl>
    </aside>
  )
}
