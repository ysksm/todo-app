# カレンダー画面。目標予定日（target_date）で TODO を月表示する。
class CalendarController < ApplicationController
  def show
    @month = parse_month(params[:month])
    @weeks = build_weeks(@month)
    @todos_by_date = Todo.where(target_date: @weeks.first.first..@weeks.last.last)
                         .by_priority
                         .group_by(&:target_date)
    @overdue = Todo.where(target_date: ...Date.current)
                   .where.not(status: "done")
                   .order(:target_date)
  end

  private

  def parse_month(value)
    Date.strptime(value.to_s, "%Y-%m")
  rescue ArgumentError, TypeError
    Date.current.beginning_of_month
  end

  # 月を含む週（日曜はじまり）の配列。各週は 7 日分の Date の配列。
  def build_weeks(month)
    first = month.beginning_of_month.beginning_of_week(:sunday)
    last = month.end_of_month.end_of_week(:sunday)
    (first..last).each_slice(7).to_a
  end
end
