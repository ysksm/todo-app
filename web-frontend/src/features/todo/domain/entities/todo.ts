export interface Todo {
  readonly id: number
  readonly title: string
  readonly description: string
  readonly completed: boolean
}

export interface TodoDraft {
  readonly title: string
  readonly description: string
  readonly completed: boolean
}

export interface TodoUpdate extends TodoDraft {
  readonly id: number
}

export class TodoValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'TodoValidationError'
  }
}

export function normalizeTodoDraft(draft: TodoDraft): TodoDraft {
  const title = draft.title.trim()
  if (!title) {
    throw new TodoValidationError('Title is required')
  }

  return {
    title,
    description: draft.description.trim(),
    completed: draft.completed,
  }
}
