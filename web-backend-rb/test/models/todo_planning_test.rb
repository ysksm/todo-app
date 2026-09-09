require "test_helper"

# 優先度・依存・並べ替え・状態送りなど、計画系フィールドとメソッドのテスト
class TodoPlanningTest < ActiveSupport::TestCase
  test "優先度は high / medium / low のみ" do
    todo = todos(:task_model)
    todo.priority = "urgent"
    assert_not todo.valid?
    todo.priority = "high"
    assert todo.valid?
  end

  test "工数とコストは負の値にできない" do
    todo = todos(:task_model)
    todo.estimated_hours = -1
    assert_not todo.valid?
    todo.estimated_hours = 2.5
    todo.actual_cost = 10_000
    assert todo.valid?
  end

  test "advance_status! は未着手 → 進行中 → 完了と進み、完了で止まる" do
    todo = Todo.create!(title: "進めるタスク", todo_type: "task")
    assert_equal "open", todo.status
    todo.advance_status!
    assert_equal "in_progress", todo.status
    todo.advance_status!
    assert_equal "done", todo.status
    todo.advance_status!
    assert_equal "done", todo.status
  end

  test "move! で同じ親の中の並び順を入れ替えられる" do
    parent = todos(:story_crud)
    first = Todo.create!(title: "1 番目", todo_type: "task", parent: parent)
    second = Todo.create!(title: "2 番目", todo_type: "task", parent: parent)

    second.move!(:up)
    ordered = parent.reload.children.where(id: [ first.id, second.id ]).ordered.pluck(:id)
    assert_equal [ second.id, first.id ], ordered

    second.reload.move!(:down)
    ordered = parent.reload.children.where(id: [ first.id, second.id ]).ordered.pluck(:id)
    assert_equal [ first.id, second.id ], ordered
  end

  test "move! は端では何もしない" do
    parent = todos(:story_crud)
    only = Todo.create!(title: "ひとりっ子", todo_type: "task", parent: parent)
    assert_nothing_raised { only.move!(:up) }
    assert_nothing_raised { only.move!(:down) }
  end

  test "blocked? は未完了の依存先があるときだけ true" do
    blocked = Todo.create!(title: "ブロックされるタスク", todo_type: "task")
    dependency = Todo.create!(title: "先にやるタスク", todo_type: "task")
    TodoLink.create!(source: blocked, target: dependency, link_type: "depends_on")

    assert blocked.reload.blocked?

    dependency.update!(status: "done")
    assert_not blocked.reload.blocked?
  end

  test "related_todos は双方向の関連を返す" do
    story = todos(:story_crud)
    migration = todos(:subtask_migration)
    assert_includes story.related_todos, migration
    assert_includes migration.related_todos, story
  end

  test "rollup は自分と子孫の値を合算する" do
    parent = todos(:story_crud)
    parent.update!(estimated_hours: 1)
    Todo.create!(title: "子タスク", todo_type: "task", parent: parent, estimated_hours: 2)

    index = Todo.preloaded_index
    assert_equal 3, index[parent.id].rollup(:estimated_hours)
  end
end
