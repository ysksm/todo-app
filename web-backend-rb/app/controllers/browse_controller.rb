# 落とし込み用のブラウズ画面。
# プロジェクト一覧 → エピック一覧 → フィーチャー一覧 → ユーザーストーリー…と
# 1 階層ずつ選択しながら掘り下げていく。
class BrowseController < ApplicationController
  def index
    index_by_id = Todo.preloaded_index
    @projects = index_by_id.values.select { |t| t.parent_id.nil? }
  end

  def show
    index_by_id = Todo.preloaded_index
    @todo = index_by_id.fetch(params[:id].to_i) { raise ActiveRecord::RecordNotFound }
    @ancestors = ancestors_of(@todo, index_by_id)
  end

  private

  def ancestors_of(todo, index_by_id)
    list = []
    node = todo
    while node.parent_id
      node = index_by_id[node.parent_id]
      list.unshift(node)
    end
    list
  end
end
