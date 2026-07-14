import { describe, expect, it, vi } from 'vitest'
import { CreateTodo } from './create-todo'
import type { TodoRepository } from '../../domain/repositories/todo-repository'

describe('CreateTodo', () => {
  it('normalizes the draft before passing it to the repository', async () => {
    const repository: TodoRepository = {
      list: vi.fn(),
      create: vi.fn().mockResolvedValue({
        id: 1,
        title: 'Buy milk',
        description: '',
        completed: false,
      }),
      update: vi.fn(),
      delete: vi.fn(),
    }
    const useCase = new CreateTodo(repository)

    await useCase.execute({ title: '  Buy milk  ', description: '  ', completed: false })

    expect(repository.create).toHaveBeenCalledWith({
      title: 'Buy milk',
      description: '',
      completed: false,
    })
  })

  it('rejects an empty title without invoking the repository', async () => {
    const repository: TodoRepository = {
      list: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    }
    const useCase = new CreateTodo(repository)

    await expect(
      useCase.execute({ title: '   ', description: '', completed: false }),
    ).rejects.toThrow('Title is required')

    expect(repository.create).not.toHaveBeenCalled()
  })
})
