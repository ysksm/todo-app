import { describe, expect, it } from 'vitest'
import {
  TODO_TYPES,
  allowedChildTypes,
  canBeChildOf,
  canHaveChildren,
  defaultChildType,
  selectableTypes,
} from './todo-type'

describe('canBeChildOf', () => {
  it('accepts a lower type under a higher one', () => {
    expect(canBeChildOf('epic', 'product')).toBe(true)
    expect(canBeChildOf('subtask', 'task')).toBe(true)
  })

  it('accepts skipping levels', () => {
    expect(canBeChildOf('task', 'product')).toBe(true)
  })

  it('rejects the reverse direction', () => {
    expect(canBeChildOf('epic', 'task')).toBe(false)
    expect(canBeChildOf('product', 'subtask')).toBe(false)
  })

  it('rejects two todos of the same level', () => {
    expect(canBeChildOf('task', 'task')).toBe(false)
  })

  it('accepts every type at the root', () => {
    for (const todoType of TODO_TYPES) {
      expect(canBeChildOf(todoType, null)).toBe(true)
    }
  })

  it('puts a bug under anything but never gives it children', () => {
    for (const todoType of TODO_TYPES) {
      expect(canBeChildOf('bug', todoType)).toBe(todoType !== 'bug')
      expect(canBeChildOf(todoType, 'bug')).toBe(false)
    }
    expect(canHaveChildren('bug')).toBe(false)
  })
})

describe('allowedChildTypes', () => {
  it('lists only the types below the parent', () => {
    expect(allowedChildTypes('user_story')).toEqual(['task', 'subtask', 'bug'])
    expect(allowedChildTypes('subtask')).toEqual(['bug'])
    expect(allowedChildTypes('bug')).toEqual([])
  })
})

describe('defaultChildType', () => {
  it('starts a root at the top of the hierarchy', () => {
    expect(defaultChildType(null)).toBe('product')
  })

  it('goes one level down', () => {
    expect(defaultChildType('product')).toBe('epic')
    expect(defaultChildType('task')).toBe('subtask')
  })

  it('has nothing to offer under a bug', () => {
    expect(defaultChildType('bug')).toBeNull()
  })
})

describe('selectableTypes', () => {
  it('keeps the types that fit both the parent and the children', () => {
    expect(selectableTypes('epic', ['task'])).toEqual(['user_story'])
  })

  it('falls back to every type when the todo is a lonely root', () => {
    expect(selectableTypes(null, [])).toEqual([...TODO_TYPES])
  })

  it('drops bug as soon as the todo has a child', () => {
    expect(selectableTypes(null, ['subtask'])).toEqual(['product', 'epic', 'user_story', 'task'])
  })
})
