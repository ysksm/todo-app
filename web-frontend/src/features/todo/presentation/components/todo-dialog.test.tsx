import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { TodoDialog } from './todo-dialog'

describe('TodoDialog', () => {
  it('dispatches the updated draft when a text field loses focus', async () => {
    const user = userEvent.setup()
    const onDraftChange = vi.fn()

    render(
      <TodoDialog
        todo={{ id: 1, title: 'Buy milk', description: '2L', completed: false }}
        isSaving={false}
        onDraftChange={onDraftChange}
        onUpdate={vi.fn().mockResolvedValue(true)}
        onDelete={vi.fn().mockResolvedValue(true)}
        onClose={vi.fn()}
      />,
    )

    const input = screen.getByLabelText('Todo 名')
    await user.clear(input)
    await user.type(input, 'Buy oat milk')
    fireEvent.blur(input)

    expect(onDraftChange).toHaveBeenCalledWith({
      id: 1,
      title: 'Buy oat milk',
      description: '2L',
      completed: false,
    })
  })
})
