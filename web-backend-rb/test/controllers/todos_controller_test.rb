require "test_helper"

class TodosControllerTest < ActionDispatch::IntegrationTest
  test "一覧が表示できる" do
    get todos_url
    assert_response :success
    assert_match "アプリを作る", response.body
  end

  test "詳細が表示できる" do
    get todo_url(todos(:project_alpha))
    assert_response :success
  end

  test "作成できる" do
    assert_difference "Todo.count", 1 do
      post todos_url, params: {
        todo: { title: "新規プロジェクト", todo_type: "project", status: "open" }
      }
    end
    assert_redirected_to todos_url
  end

  test "階層ルールに反する作成はエラー表示" do
    task = todos(:task_model)
    assert_no_difference "Todo.count" do
      post todos_url, params: {
        todo: { title: "だめなエピック", todo_type: "epic", parent_id: task.id }
      }
    end
    assert_response :unprocessable_entity
  end

  test "toggle で完了と未着手を切り替えられる" do
    todo = todos(:story_crud)
    patch toggle_todo_url(todo)
    assert_equal "done", todo.reload.status
    patch toggle_todo_url(todo)
    assert_equal "open", todo.reload.status
  end

  test "削除できる" do
    todo = todos(:subtask_migration)
    assert_difference "Todo.count", -1 do
      delete todo_url(todo)
    end
    assert_redirected_to todos_url
  end
end
