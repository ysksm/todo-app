require "test_helper"

class TodoLinksControllerTest < ActionDispatch::IntegrationTest
  test "依存リンクを追加できる" do
    source = todos(:story_crud)
    target = todos(:task_model)
    assert_difference "TodoLink.count", 1 do
      post todo_links_path(source), params: { todo_link: { target_id: target.id, link_type: "depends_on" } }
    end
    assert_redirected_to todo_path(source)
    assert source.reload.dependencies.include?(target)
  end

  test "不正なリンクはエラーメッセージ付きで弾かれる" do
    source = todos(:story_crud)
    assert_no_difference "TodoLink.count" do
      post todo_links_path(source), params: { todo_link: { target_id: source.id, link_type: "depends_on" } }
    end
    assert_redirected_to todo_path(source)
    assert flash[:alert].present?
  end

  test "リンクを削除できる（受け手側からも消せる）" do
    link = todo_links(:migration_relates_story)
    assert_difference "TodoLink.count", -1 do
      delete todo_link_path(link.target, link)
    end
    assert_redirected_to todo_path(link.target)
  end
end
