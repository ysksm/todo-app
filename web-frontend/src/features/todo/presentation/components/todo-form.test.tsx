import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { TodoForm } from './todo-form'

describe('TodoForm', () => {
  it('submits a new todo and clears the input after success', async () => {
    const user = userEvent.setup()
    const onCreate = vi.fn().mockResolvedValue(true)

    render(<TodoForm isSaving={false} onCreate={onCreate} />)

    const input = screen.getByLabelText('新しい Todo')
    await user.type(input, 'Buy milk')
    await user.click(screen.getByRole('button', { name: '追加' }))

    expect(onCreate).toHaveBeenCalledWith('Buy milk')
    expect(input).toHaveValue('')
  })
})
