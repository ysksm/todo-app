export interface TodoContent {
  readonly title: string
  readonly description: string
  readonly completed: boolean
}

export interface Todo extends TodoContent {
  readonly id: number
  readonly parentId: number | null
  readonly position: number
}

/** 新規作成の下書き。parentId が null ならルートとして追加する。 */
export interface TodoDraft extends TodoContent {
  readonly parentId: number | null
}

/** 本文の更新。親子関係は変更しない。 */
export interface TodoUpdate extends TodoContent {
  readonly id: number
}

/** 親子関係と並び順の変更。position が null なら末尾へ。 */
export interface TodoMove {
  readonly id: number
  readonly parentId: number | null
  readonly position: number | null
}

export class TodoValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'TodoValidationError'
  }
}

export function normalizeTodoContent<T extends TodoContent>(content: T): T {
  const title = content.title.trim()
  if (!title) {
    throw new TodoValidationError('Title is required')
  }

  return {
    ...content,
    title,
    description: content.description.trim(),
  }
}
