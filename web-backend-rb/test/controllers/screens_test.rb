require "test_helper"

# 新しく追加した画面（マインドマップ・ブラウズ・作業・カレンダー）と
# 作業画面用アクションのスモークテスト
class ScreensTest < ActionDispatch::IntegrationTest
  test "マインドマップが表示できる" do
    get mindmap_path
    assert_response :success
    assert_select ".mm-card", minimum: 1
  end

  test "マインドマップは id を指定するとそのチケットの配下だけを表示する" do
    epic = todos(:epic_backend)
    get mindmap_path(epic)
    assert_response :success
    assert_includes response.body, epic.title
    assert_includes response.body, todos(:story_crud).title      # 配下は表示される
    assert_not_includes response.body, "＋ ルートに追加"          # 全体用の追加ボタンは出ない
  end

  test "部分マインドマップは存在しない id で 404" do
    get mindmap_path(999_999)
    assert_response :not_found
  end

  test "ブラウズのプロジェクト一覧が表示できる" do
    get browse_path
    assert_response :success
    assert_select ".browse-card", minimum: 1
  end

  test "ブラウズでプロジェクトを掘り下げられる" do
    get browse_todo_path(todos(:project_alpha))
    assert_response :success
    assert_select ".breadcrumb"
    assert_select ".browse-card", minimum: 1
  end

  test "ブラウズは view=list で表形式のリスト表示になる" do
    get browse_path(view: "list")
    assert_response :success
    assert_select ".browse-table tbody tr", minimum: 1
    assert_select ".browse-card", count: 0
  end

  test "ブラウズの掘り下げ画面も view=list で表形式になる" do
    get browse_todo_path(todos(:project_alpha), view: "list")
    assert_response :success
    assert_select ".browse-table tbody tr", minimum: 1
    assert_select ".browse-card", count: 0
  end

  test "ブラウズの掘り下げ画面に詳細とマインドマップの開閉パネルがある" do
    get browse_todo_path(todos(:project_alpha))
    assert_response :success
    assert_select ".inline-panel", minimum: 2
    assert_select ".inline-panel .mindmap"
    assert_select ".inline-panel .link-form"
  end

  test "ツリー画面は表形式で全 TODO を表示する" do
    get root_path
    assert_response :success
    assert_select ".tree-table tbody tr", count: Todo.count
    assert_select ".tree-table .tree-marker", count: Todo.count - Todo.roots.count
  end

  test "ブラウズは存在しない id で 404" do
    get browse_todo_path(id: 999_999)
    assert_response :not_found
  end

  test "作業画面が表示できる" do
    get work_path
    assert_response :success
    assert_select ".work-row", minimum: 1
  end

  test "カレンダーが表示できる" do
    get calendar_path
    assert_response :success
    assert_select ".calendar-table"
  end

  test "カレンダーは月を指定できる" do
    get calendar_path(month: "2026-01")
    assert_response :success
    assert_select ".calendar-month", text: "2026年1月"
  end

  test "カレンダーは不正な月指定でも今月にフォールバックする" do
    get calendar_path(month: "invalid")
    assert_response :success
  end

  test "advance で状態を進められる" do
    todo = todos(:story_crud) # in_progress
    patch advance_todo_path(todo)
    assert_redirected_to work_path
    assert_equal "done", todo.reload.status
  end

  test "set_priority で優先度を変更できる" do
    todo = todos(:task_model)
    patch set_priority_todo_path(todo, priority: "high")
    assert_redirected_to work_path
    assert_equal "high", todo.reload.priority
  end

  test "set_priority は不正な値を無視する" do
    todo = todos(:task_model)
    patch set_priority_todo_path(todo, priority: "urgent")
    assert_equal "medium", todo.reload.priority
  end

  test "マインドマップのその場追加は Turbo Stream でノードを追記する" do
    parent = todos(:project_alpha)
    assert_difference "Todo.count", 1 do
      post todos_path, params: {
        todo: { title: "その場で追加", todo_type: "epic", parent_id: parent.id },
        inline: "mindmap"
      }, headers: { "Accept" => "text/vnd.turbo-stream.html" }
    end
    assert_response :success
    assert_includes response.body, %(<turbo-stream action="append" target="mm-children-#{parent.id}")
    assert_includes response.body, %(<turbo-stream action="replace" target="mm-add-#{parent.id}")
  end

  test "マインドマップのその場追加はルートにも追記できる" do
    post todos_path, params: {
      todo: { title: "ルートに追加", todo_type: "project" },
      inline: "mindmap"
    }, headers: { "Accept" => "text/vnd.turbo-stream.html" }
    assert_response :success
    assert_includes response.body, %(<turbo-stream action="append" target="mm-root-children")
  end

  test "マインドマップのその場追加はバリデーションエラーをフォームに表示する" do
    assert_no_difference "Todo.count" do
      post todos_path, params: {
        todo: { title: "", todo_type: "project" },
        inline: "mindmap"
      }, headers: { "Accept" => "text/vnd.turbo-stream.html" }
    end
    assert_response :unprocessable_entity
    assert_includes response.body, %(<turbo-stream action="replace" target="mm-add-root")
  end

  test "return_to 付きで作成すると呼び出し元の画面に戻る" do
    post todos_path, params: {
      todo: { title: "マップから追加", todo_type: "project" },
      return_to: mindmap_path
    }
    assert_redirected_to mindmap_path
  end

  test "return_to に外部 URL を渡しても無視される" do
    post todos_path, params: {
      todo: { title: "外部に飛ばそうとする", todo_type: "project" },
      return_to: "https://example.com/evil"
    }
    assert_redirected_to todos_path
  end

  test "return_to 付きで更新すると呼び出し元の画面に戻る" do
    todo = todos(:project_alpha)
    patch todo_path(todo), params: {
      todo: { title: todo.title },
      return_to: browse_todo_path(todo)
    }
    assert_redirected_to browse_todo_path(todo)
  end

  test "move で並び順を入れ替えられる" do
    parent = todos(:story_crud)
    first = Todo.create!(title: "1 番目", todo_type: "task", parent: parent)
    second = Todo.create!(title: "2 番目", todo_type: "task", parent: parent)

    patch move_todo_path(second, direction: "up")
    assert_redirected_to work_path
    ordered = Todo.where(id: [ first.id, second.id ]).ordered.pluck(:id)
    assert_equal [ second.id, first.id ], ordered
  end
end
