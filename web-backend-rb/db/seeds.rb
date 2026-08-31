# 動作確認用のサンプルデータ。`bin/rails db:seed` で投入する。
# 何度実行しても増殖しないよう、タイトルで find_or_create する。

def seed_todo(title, type, parent: nil, status: "open", **attrs)
  todo = Todo.find_or_create_by!(title: title, parent: parent) do |t|
    t.todo_type = type
    t.status = status
    attrs.each { |key, value| t.public_send("#{key}=", value) }
  end
  todo.update!(attrs) if attrs.any?
  todo
end

def seed_link(source, target, link_type)
  TodoLink.find_or_create_by!(source: source, target: target, link_type: link_type)
end

project = seed_todo("TODO アプリを作る", "project",
  goal: "階層構造で TODO を管理できるアプリを完成させる",
  target_date: Date.current + 2.months, priority: "high")
epic    = seed_todo("バックエンド", "epic", parent: project,
  goal: "API とデータモデルを固める", target_date: Date.current + 1.month)
feature = seed_todo("階層構造の管理", "feature", parent: epic,
  estimated_hours: 24, estimated_cost: 120_000)
story   = seed_todo("TODO を階層で整理できる", "user_story", parent: feature,
  target_date: Date.current + 2.weeks)
task1   = seed_todo("モデルを実装する", "task", parent: story, status: "done",
  priority: "high", estimated_hours: 4, actual_hours: 5,
  estimated_cost: 20_000, actual_cost: 25_000,
  target_date: Date.current - 3.days)
migrate = seed_todo("マイグレーションを書く", "task", parent: task1, status: "done",
  estimated_hours: 1, actual_hours: 1)
valid   = seed_todo("バリデーションを書く", "task", parent: task1, status: "in_progress",
  priority: "high", estimated_hours: 2, target_date: Date.current + 2.days)
api     = seed_todo("API を実装する", "task", parent: story,
  estimated_hours: 6, estimated_cost: 30_000, target_date: Date.current + 1.week)

frontend = seed_todo("フロントエンド", "epic", parent: project,
  goal: "画面から一通り操作できるようにする")
screen = seed_todo("画面を実装する", "task", parent: frontend,
  priority: "low", estimated_hours: 8, target_date: Date.current + 3.weeks)

seed_link(api, valid, "depends_on")       # API はバリデーション完了に依存
seed_link(screen, api, "depends_on")      # 画面は API 完了に依存
seed_link(migrate, valid, "relates_to")   # マイグレーションとバリデーションは関連

puts "Seeded: #{Todo.count} todos, #{TodoLink.count} links"
