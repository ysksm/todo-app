/**
 * タスクの種類と、種類どうしの親子関係の決まり。
 *
 * Product > Epic > UserStory > Task > SubTask は上下の決まった 1 本の階層で、
 * Bug だけがその外にいる。バックエンドの core/models/todo_type.py と同じ決まりを持ち、
 * 画面側は「そもそも選べないようにする」ために使う（最終的な判定はバックエンド）。
 */

export const TODO_TYPES = ['product', 'epic', 'user_story', 'task', 'subtask', 'bug'] as const

export type TodoType = (typeof TODO_TYPES)[number]

export const TODO_TYPE_LABELS: Record<TodoType, string> = {
  product: 'Product',
  epic: 'Epic',
  user_story: 'UserStory',
  task: 'Task',
  subtask: 'SubTask',
  bug: 'Bug',
}

/** 上位から下位への並び。この順序だけが親子の向きを決める。 */
const HIERARCHY: readonly TodoType[] = ['product', 'epic', 'user_story', 'task', 'subtask']

function rank(todoType: TodoType): number {
  return HIERARCHY.indexOf(todoType)
}

/** Bug は階層の外にいるので、子を持たない葉として扱う。 */
export function canHaveChildren(parentType: TodoType): boolean {
  return parentType !== 'bug'
}

/**
 * その親子が成立するか。parentType が null ならルート。
 *
 * 階層飛ばし（Product の直下に Task）は許すが、逆流（Task の下に Epic）と
 * 同じ階層どうし（Task の下に Task）は許さない。
 */
export function canBeChildOf(childType: TodoType, parentType: TodoType | null): boolean {
  if (parentType === null) {
    return true
  }
  if (!canHaveChildren(parentType)) {
    return false
  }
  if (childType === 'bug') {
    return true
  }
  return rank(parentType) < rank(childType)
}

/** その親の下に置ける種類を、階層の並び順で返す。 */
export function allowedChildTypes(parentType: TodoType | null): readonly TodoType[] {
  return TODO_TYPES.filter((todoType) => canBeChildOf(todoType, parentType))
}

/** その親に子を足すときの既定の種類。ルートは Product、それ以外は 1 つ下の階層。 */
export function defaultChildType(parentType: TodoType | null): TodoType | null {
  return allowedChildTypes(parentType)[0] ?? null
}

/**
 * すでにある 1 件を何の種類に変えられるか。
 * いまの親の下に置けて、かつ今の子をすべて抱えられる種類だけを返す。
 */
export function selectableTypes(
  parentType: TodoType | null,
  childTypes: readonly TodoType[],
): readonly TodoType[] {
  return TODO_TYPES.filter(
    (candidate) =>
      canBeChildOf(candidate, parentType) &&
      childTypes.every((childType) => canBeChildOf(childType, candidate)),
  )
}
