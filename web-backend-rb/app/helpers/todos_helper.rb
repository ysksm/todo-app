module TodosHelper
  TYPE_LABELS = {
    "project" => "プロジェクト",
    "epic" => "エピック",
    "feature" => "フィーチャー",
    "user_story" => "ユーザーストーリー",
    "task" => "タスク"
  }.freeze

  STATUS_LABELS = {
    "open" => "未着手",
    "in_progress" => "進行中",
    "done" => "完了"
  }.freeze

  def todo_type_label(type)
    TYPE_LABELS.fetch(type, type)
  end

  def todo_status_label(status)
    STATUS_LABELS.fetch(status, status)
  end

  def todo_type_options(types)
    types.map { |t| [ todo_type_label(t), t ] }
  end

  def todo_status_options
    Todo::STATUSES.map { |s| [ todo_status_label(s), s ] }
  end
end
