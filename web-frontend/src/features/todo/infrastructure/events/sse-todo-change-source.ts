import type { SubscribeToTodoChanges } from '../../application/subscribe-to-todo-changes'

/**
 * SSE（GET /api/todos/events）で変更通知を受け取る購読を作る。
 * 切断時の再接続は EventSource の標準機能に任せる。切断中に起きた変更は、
 * イベント受信のたびに全件取り直す方式なので再接続後の初回通知で追いつける。
 */
export function createSseTodoChangeSource(baseUrl: string): SubscribeToTodoChanges {
  return (onChange) => {
    const source = new EventSource(`${baseUrl}/api/todos/events`)
    source.addEventListener('todos_changed', onChange)
    return () => {
      source.removeEventListener('todos_changed', onChange)
      source.close()
    }
  }
}
