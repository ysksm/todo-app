import { describe, expect, it, vi } from 'vitest'
import { CreateTodo } from './create-todo'
import type { TodoRepository } from '../../domain/repositories/todo-repository'

function createRepository(overrides: Partial<TodoRepository> = {}): TodoRepository {
  return {
    list: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    move: vi.fn(),
    delete: vi.fn(),
    ...overrides,
  }
}

describe('CreateTodo', () => {
  it('normalizes the draft before passing it to the repository', async () => {
    const repository = createRepository({
      create: vi.fn().mockResolvedValue({
        id: 1,
        title: 'Buy milk',
        description: '',
        completed: false,
        type: 'product',
        parentId: null,
        position: 0,
      }),
    })
    const useCase = new CreateTodo(repository)

    await useCase.execute({
      title: '  Buy milk  ',
      description: '  ',
      completed: false,
      type: 'product',
      parentId: null,
    })

    expect(repository.create).toHaveBeenCalledWith({
      title: 'Buy milk',
      description: '',
      completed: false,
      type: 'product',
      parentId: null,
    })
  })

  it('keeps the parent id of the draft', async () => {
    const repository = createRepository({
      create: vi.fn().mockResolvedValue({
        id: 2,
        title: 'Child',
        description: '',
        completed: false,
        type: 'epic',
        parentId: 1,
        position: 0,
      }),
    })
    const useCase = new CreateTodo(repository)

    await useCase.execute({
      title: 'Child',
      description: '',
      completed: false,
      type: 'epic',
      parentId: 1,
    })

    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({ parentId: 1 }),
    )
  })

  it('rejects an empty title without invoking the repository', async () => {
    const repository = createRepository()
    const useCase = new CreateTodo(repository)

    await expect(
      useCase.execute({ title: '   ', description: '', completed: false, type: 'task', parentId: null }),
    ).rejects.toThrow('Title is required')

    expect(repository.create).not.toHaveBeenCalled()
  })
})
