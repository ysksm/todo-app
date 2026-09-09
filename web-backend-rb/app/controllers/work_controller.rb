# 実作業用の画面。タスクを優先度順に眺めて、
# 優先順位付け・並べ替え・状態送り（未着手 → 進行中 → 完了）を行う。
class WorkController < ApplicationController
  def index
    tasks = Todo.where(todo_type: "task")
                .includes(:parent, dependencies: [], dependents: [])
                .by_priority
    @in_progress, rest = tasks.partition { |t| t.status == "in_progress" }
    @open, @done = rest.partition { |t| t.status == "open" }
  end
end
