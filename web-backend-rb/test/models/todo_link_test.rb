require "test_helper"

class TodoLinkTest < ActiveSupport::TestCase
  test "関連リンクを作れる" do
    link = TodoLink.new(source: todos(:task_model), target: todos(:epic_backend), link_type: "relates_to")
    assert link.valid?, link.errors.full_messages.join(", ")
  end

  test "依存リンクを作れる" do
    link = TodoLink.new(source: todos(:story_crud), target: todos(:task_model), link_type: "depends_on")
    assert link.valid?, link.errors.full_messages.join(", ")
  end

  test "自分自身へのリンクは作れない" do
    task = todos(:task_model)
    link = TodoLink.new(source: task, target: task, link_type: "relates_to")
    assert_not link.valid?
  end

  test "不正な種類は作れない" do
    link = TodoLink.new(source: todos(:task_model), target: todos(:epic_backend), link_type: "blocks")
    assert_not link.valid?
  end

  test "同じ組み合わせは重複して作れない" do
    existing = todo_links(:migration_relates_story)
    dup = TodoLink.new(source: existing.source, target: existing.target, link_type: existing.link_type)
    assert_not dup.valid?
  end

  test "逆向きの同じ種類のリンクは作れない（直接循環の禁止）" do
    TodoLink.create!(source: todos(:story_crud), target: todos(:task_model), link_type: "depends_on")
    reverse = TodoLink.new(source: todos(:task_model), target: todos(:story_crud), link_type: "depends_on")
    assert_not reverse.valid?
  end

  test "TODO を削除するとリンクも削除される" do
    todo = todos(:subtask_migration)
    assert_difference "TodoLink.count", -1 do
      todo.destroy
    end
  end
end
