require "test_helper"

module Api
  class TodosControllerTest < ActionDispatch::IntegrationTest
    test "一覧を取得できる" do
      get api_todos_url
      assert_response :success
      body = JSON.parse(response.body)
      assert_equal Todo.count, body.size
    end

    test "ルートのみに絞り込める" do
      get api_todos_url(root: "true")
      body = JSON.parse(response.body)
      assert_equal Todo.roots.count, body.size
    end

    test "ツリーを取得できる" do
      get api_todos_tree_url
      assert_response :success
      body = JSON.parse(response.body)
      root = body.find { |t| t["title"] == "アプリを作る" }
      assert_equal "project", root["type"]
      epic = root["children"].first
      assert_equal "epic", epic["type"]
      assert_equal "user_story", epic["children"].first["type"]
    end

    test "作成できる" do
      parent = todos(:project_alpha)
      assert_difference "Todo.count", 1 do
        post api_todos_url, params: {
          todo: { title: "新しいフィーチャー", todo_type: "feature", parent_id: parent.id }
        }, as: :json
      end
      assert_response :created
      body = JSON.parse(response.body)
      assert_equal "feature", body["type"]
      assert_equal parent.id, body["parent_id"]
    end

    test "階層ルールに反する作成は 422" do
      task = todos(:task_model)
      assert_no_difference "Todo.count" do
        post api_todos_url, params: {
          todo: { title: "タスクの下のエピック", todo_type: "epic", parent_id: task.id }
        }, as: :json
      end
      assert_response :unprocessable_entity
      assert JSON.parse(response.body)["errors"].any?
    end

    test "更新で親を付け替えられる" do
      story = todos(:story_crud)
      new_parent = todos(:project_alpha)
      patch api_todo_url(story), params: { todo: { parent_id: new_parent.id } }, as: :json
      assert_response :success
      assert_equal new_parent.id, story.reload.parent_id
    end

    test "循環する親の付け替えは 422" do
      story = todos(:story_crud)
      descendant = todos(:subtask_migration)
      patch api_todo_url(story), params: { todo: { parent_id: descendant.id } }, as: :json
      assert_response :unprocessable_entity
    end

    test "削除すると子孫も消える" do
      epic = todos(:epic_backend)
      assert_difference "Todo.count", -4 do
        delete api_todo_url(epic)
      end
      assert_response :no_content
    end

    test "存在しない ID は 404" do
      get api_todo_url(999_999)
      assert_response :not_found
    end
  end
end
