require "test_helper"

class TodoTest < ActiveSupport::TestCase
  test "タイトルは必須" do
    todo = Todo.new(todo_type: "task", status: "open")
    assert_not todo.valid?
    assert todo.errors[:title].any?
  end

  test "ルートにはどの種類でも置ける" do
    Todo::TYPES.each do |type|
      todo = Todo.new(title: "ルート #{type}", todo_type: type)
      assert todo.valid?, "#{type} はルートに置けるはず: #{todo.errors.full_messages}"
    end
  end

  test "親は子より上位でなければならない" do
    epic = todos(:epic_backend)
    todo = Todo.new(title: "逆向き", todo_type: "project", parent: epic)
    assert_not todo.valid?
  end

  test "同じ種類どうしは task 以外は置けない" do
    epic = todos(:epic_backend)
    todo = Todo.new(title: "エピックの下のエピック", todo_type: "epic", parent: epic)
    assert_not todo.valid?
  end

  test "task の下に task は置ける（何段でも入れ子にできる）" do
    parent_task = todos(:subtask_migration) # すでに task > task の 2 段目
    todo = Todo.new(title: "3 段目のタスク", todo_type: "task", parent: parent_task)
    assert todo.valid?, todo.errors.full_messages.join(", ")
  end

  test "階層飛ばしは作れる（project 直下に task）" do
    project = todos(:project_alpha)
    todo = Todo.new(title: "直下のタスク", todo_type: "task", parent: project)
    assert todo.valid?, todo.errors.full_messages.join(", ")
  end

  test "task の下に epic は置けない" do
    task = todos(:task_model)
    todo = Todo.new(title: "タスクの下のエピック", todo_type: "epic", parent: task)
    assert_not todo.valid?
  end

  test "自分自身を親にできない" do
    task = todos(:task_model)
    task.parent = task
    assert_not task.valid?
  end

  test "子孫を親にできない（循環禁止）" do
    story = todos(:story_crud)
    story.parent = todos(:subtask_migration)
    assert_not story.valid?
  end

  test "子を持つ TODO の種類は子と矛盾する値に変更できない" do
    epic = todos(:epic_backend) # 子に user_story がいる
    epic.todo_type = "task"
    assert_not epic.valid?
  end

  test "親を削除すると子孫もまとめて削除される" do
    project = todos(:project_alpha)
    assert_difference "Todo.count", -5 do
      project.destroy
    end
  end

  test "position は同じ親の中で自動採番される" do
    project = todos(:project_alpha)
    first = Todo.create!(title: "1 番目", todo_type: "feature", parent: project)
    second = Todo.create!(title: "2 番目", todo_type: "feature", parent: project)
    assert second.position > first.position
  end

  test "allowed_child_types は種類に応じた選択肢を返す" do
    assert_equal %w[epic feature user_story task], todos(:project_alpha).allowed_child_types
    assert_equal %w[task], todos(:task_model).allowed_child_types
  end
end
