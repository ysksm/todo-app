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

    // ルートに追加するので、既定は階層のいちばん上
    expect(onCreate).toHaveBeenCalledWith('Buy milk', 'product')
    expect(input).toHaveValue('')
  })

  it('submits the selected type', async () => {
    const user = userEvent.setup()
    const onCreate = vi.fn().mockResolvedValue(true)

    render(<TodoForm isSaving={false} onCreate={onCreate} />)

    await user.selectOptions(screen.getByLabelText('種類'), 'bug')
    await user.type(screen.getByLabelText('新しい Todo'), '落ちる')
    await user.click(screen.getByRole('button', { name: '追加' }))

    expect(onCreate).toHaveBeenCalledWith('落ちる', 'bug')
  })

  it('offers every type because the root accepts all of them', () => {
    render(<TodoForm isSaving={false} onCreate={vi.fn()} />)

    const options = screen.getAllByRole('option') as HTMLOptionElement[]

    expect(options.map((option) => option.value)).toEqual([
      'product',
      'epic',
      'user_story',
      'task',
      'subtask',
      'bug',
    ])
  })
})
