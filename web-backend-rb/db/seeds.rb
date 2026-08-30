# 動作確認用のサンプルデータ。`bin/rails db:seed` で投入する。
# 何度実行しても増殖しないよう、タイトルで find_or_create する。

def seed_todo(title, type, parent: nil, status: "open")
  Todo.find_or_create_by!(title: title, parent: parent) do |t|
    t.todo_type = type
    t.status = status
  end
end

project = seed_todo("TODO アプリを作る", "project")
epic    = seed_todo("バックエンド", "epic", parent: project)
feature = seed_todo("階層構造の管理", "feature", parent: epic)
story   = seed_todo("TODO を階層で整理できる", "user_story", parent: feature)
task1   = seed_todo("モデルを実装する", "task", parent: story, status: "done")
seed_todo("マイグレーションを書く", "task", parent: task1, status: "done")
seed_todo("バリデーションを書く", "task", parent: task1, status: "in_progress")
seed_todo("API を実装する", "task", parent: story)

seed_todo("フロントエンド", "epic", parent: project)

puts "Seeded: #{Todo.count} todos"
