import type { Todo } from '../domain/entities/todo'
import { countDescendants } from '../domain/entities/todo-tree'

/**
 * 削除してよいか確認する。
 *
 * API の DELETE は子孫もまとめて消すので、どのビューから削除しても同じ確認が要る。
 * 子孫が無いときは黙って true を返す。
 */
export function confirmCascadingDelete(todos: readonly Todo[], id: number): boolean {
  const descendantCount = countDescendants(todos, id)
  if (descendantCount === 0) {
    return true
  }

  const title = todos.find((todo) => todo.id === id)?.title ?? ''
  return window.confirm(
    `「${title}」を削除すると、子タスク ${descendantCount} 件も一緒に削除されます。よろしいですか？`,
  )
}
