import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { Todo } from '../../domain/entities/todo'
import type { TodoType } from '../../domain/entities/todo-type'
import { TodoDialog } from './todo-dialog'

function todo(id: number, parentId: number | null, type: TodoType, title = `todo-${id}`): Todo {
  return { id, title, description: '', completed: false, type, parentId, position: 0 }
}

function renderDialog(
  selected: Todo,
  todos: readonly Todo[],
  overrides: Partial<Parameters<typeof TodoDialog>[0]> = {},
) {
  const props = {
    todo: selected,
    todos,
    isSaving: false,
    onDraftChange: vi.fn(),
    onUpdate: vi.fn().mockResolvedValue(true),
    onDelete: vi.fn().mockResolvedValue(true),
    onClose: vi.fn(),
    ...overrides,
  }

  render(<TodoDialog {...props} />)
  return props
}

function typeOptions(): string[] {
  return (screen.getAllByRole('option') as HTMLOptionElement[]).map((option) => option.value)
}

describe('TodoDialog', () => {
  it('dispatches the updated draft when a text field loses focus', async () => {
    const user = userEvent.setup()
    const selected: Todo = {
      id: 1,
      title: 'Buy milk',
      description: '2L',
      completed: false,
      type: 'task',
      parentId: null,
      position: 0,
    }
    const { onDraftChange } = renderDialog(selected, [selected])

    const input = screen.getByLabelText('Todo 名')
    await user.clear(input)
    await user.type(input, 'Buy oat milk')
    fireEvent.blur(input)

    expect(onDraftChange).toHaveBeenCalledWith({ ...selected, title: 'Buy oat milk' })
  })

  it('saves the selected type', async () => {
    const user = userEvent.setup()
    const product = todo(1, null, 'product')
    const child = todo(2, 1, 'epic')
    const { onUpdate } = renderDialog(child, [product, child])

    await user.selectOptions(screen.getByLabelText('種類'), 'task')
    await user.click(screen.getByRole('button', { name: '保存' }))

    expect(onUpdate).toHaveBeenCalledWith(expect.objectContaining({ id: 2, type: 'task' }))
  })

  it('only offers types that fit under the parent', () => {
    const userStory = todo(1, null, 'user_story')
    const child = todo(2, 1, 'task')
    renderDialog(child, [userStory, child])

    // UserStory の下なので、それより上位の種類は選べない
    expect(typeOptions()).toEqual(['task', 'subtask', 'bug'])
  })

  it('only offers types that can still hold the children', () => {
    const epic = todo(1, null, 'epic')
    const story = todo(2, 1, 'user_story')
    renderDialog(epic, [epic, story])

    // UserStory の子を抱えられる種類だけ。Bug は子を持てないので出ない
    expect(typeOptions()).toEqual(['product', 'epic'])
  })
})
