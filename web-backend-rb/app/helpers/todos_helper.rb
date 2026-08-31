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

  PRIORITY_LABELS = {
    "high" => "高",
    "medium" => "中",
    "low" => "低"
  }.freeze

  LINK_TYPE_LABELS = {
    "relates_to" => "関連",
    "depends_on" => "依存"
  }.freeze

  def todo_type_label(type)
    TYPE_LABELS.fetch(type, type)
  end

  def todo_status_label(status)
    STATUS_LABELS.fetch(status, status)
  end

  def todo_priority_label(priority)
    PRIORITY_LABELS.fetch(priority, priority)
  end

  def link_type_label(link_type)
    LINK_TYPE_LABELS.fetch(link_type, link_type)
  end

  def todo_type_options(types)
    types.map { |t| [ todo_type_label(t), t ] }
  end

  def todo_status_options
    Todo::STATUSES.map { |s| [ todo_status_label(s), s ] }
  end

  def todo_priority_options
    Todo::PRIORITIES.map { |p| [ todo_priority_label(p), p ] }
  end

  def link_type_options
    TodoLink::LINK_TYPES.map { |t| [ link_type_label(t), t ] }
  end

  # 3.0 → "3h" / 2.5 → "2.5h" / nil → "-"
  def format_hours(hours)
    return "-" if hours.nil?

    value = hours.to_f
    text = value == value.to_i ? value.to_i.to_s : value.to_s
    "#{text}h"
  end

  # 12000 → "¥12,000" / nil → "-"
  def format_cost(cost)
    return "-" if cost.nil?

    value = cost.to_f
    if value == value.to_i
      "¥#{number_with_delimiter(value.to_i)}"
    else
      "¥#{number_with_delimiter(value)}"
    end
  end

  # リダイレクト先として安全なアプリ内パスならそれを、そうでなければ nil を返す。
  # （外部 URL やプロトコル相対 URL への誘導を防ぐ）
  def safe_internal_path(path)
    path = path.to_s
    path if path.start_with?("/") && !path.start_with?("//")
  end

  def format_target_date(date)
    return "-" if date.nil?

    date.strftime("%Y/%m/%d")
  end
end
