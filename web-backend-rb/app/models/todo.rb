# TODO は 0 個または 1 個の親を持つツリー構造。
# 種類は project > epic > feature > user_story > task の固定階層で、
# 親は必ず子より上位でなければならない。階層飛ばしは許可（project 直下に task を置ける）。
# 例外として task の下に task は置ける（タスクは何段でも入れ子にできる）。
class Todo < ApplicationRecord
  # 値が小さいほど上位
  TYPE_LEVELS = {
    "project" => 0,
    "epic" => 1,
    "feature" => 2,
    "user_story" => 3,
    "task" => 4
  }.freeze

  TYPES = TYPE_LEVELS.keys.freeze
  STATUSES = %w[open in_progress done].freeze

  # 値が小さいほど優先
  PRIORITY_LEVELS = { "high" => 0, "medium" => 1, "low" => 2 }.freeze
  PRIORITIES = PRIORITY_LEVELS.keys.freeze

  belongs_to :parent, class_name: "Todo", optional: true
  has_many :children, -> { order(:position, :id) },
           class_name: "Todo", foreign_key: :parent_id,
           inverse_of: :parent, dependent: :destroy

  has_many :outgoing_links, class_name: "TodoLink", foreign_key: :source_id,
           inverse_of: :source, dependent: :destroy
  has_many :incoming_links, class_name: "TodoLink", foreign_key: :target_id,
           inverse_of: :target, dependent: :destroy

  # この TODO が依存している先（これらが終わらないと着手できない）
  has_many :dependencies, -> { where(todo_links: { link_type: "depends_on" }) },
           through: :outgoing_links, source: :target
  # この TODO に依存している側
  has_many :dependents, -> { where(todo_links: { link_type: "depends_on" }) },
           through: :incoming_links, source: :source

  scope :roots, -> { where(parent_id: nil) }
  scope :ordered, -> { order(:position, :id) }
  scope :by_priority, -> { order(Arel.sql(priority_order_sql)).order(:position, :id) }

  def self.priority_order_sql
    cases = PRIORITY_LEVELS.map { |name, level| "WHEN '#{name}' THEN #{level}" }.join(" ")
    "CASE priority #{cases} ELSE 9 END"
  end

  # 全 TODO を 1 クエリで読み、children をメモリ上で紐付けたルート一覧を返す。
  # 再帰描画（ツリー表示・API の tree）でノードごとにクエリが走るのを防ぐ。
  def self.tree_roots
    preloaded_index.values.select { |todo| todo.parent_id.nil? }
  end

  # 全 TODO の id => Todo のハッシュ。children はメモリ上で紐付け済み。
  # ブラウズ画面などツリーを辿る画面で使う。
  def self.preloaded_index
    todos = ordered.to_a
    by_parent = todos.group_by(&:parent_id)
    todos.each do |todo|
      association = todo.association(:children)
      association.target = by_parent.fetch(todo.id, [])
      association.loaded!
    end
    todos.index_by(&:id)
  end

  validates :title, presence: true
  validates :todo_type, inclusion: { in: TYPES }
  validates :status, inclusion: { in: STATUSES }
  validates :priority, inclusion: { in: PRIORITIES }
  validates :estimated_hours, :estimated_cost, :actual_hours, :actual_cost,
            numericality: { greater_than_or_equal_to: 0 }, allow_nil: true
  validate :parent_must_be_higher_level
  validate :parent_must_not_be_self_or_descendant
  validate :children_must_stay_lower_level, on: :update

  before_create :assign_position

  def level
    TYPE_LEVELS.fetch(todo_type)
  end

  # この TODO の下に置ける種類の一覧
  def allowed_child_types
    TYPES.select { |t| self.class.valid_parent_child?(todo_type, t) }
  end

  # parent_type の下に child_type を置けるか。parent_type が nil ならルート（常に可）。
  def self.valid_parent_child?(parent_type, child_type)
    return true if parent_type.nil?
    return false unless TYPE_LEVELS.key?(parent_type) && TYPE_LEVELS.key?(child_type)
    return true if parent_type == "task" && child_type == "task"

    TYPE_LEVELS[parent_type] < TYPE_LEVELS[child_type]
  end

  def descendants
    children.flat_map { |child| [ child ] + child.descendants }
  end

  def done?
    status == "done"
  end

  # 未完了の依存先。1 件でもあれば着手できない（ブロック中）。
  def blocking_dependencies
    dependencies.reject(&:done?)
  end

  def blocked?
    blocking_dependencies.any?
  end

  # 「関連」でつながっている TODO（向きは意味を持たないので両方向を返す）
  def related_todos
    outgoing = outgoing_links.select { |l| l.link_type == "relates_to" }.map(&:target)
    incoming = incoming_links.select { |l| l.link_type == "relates_to" }.map(&:source)
    (outgoing + incoming).uniq
  end

  # 状態を 未着手 → 進行中 → 完了 の順に 1 つ進める（完了で止まる）
  def advance_status!
    index = STATUSES.index(status) || 0
    update!(status: STATUSES[[ index + 1, STATUSES.size - 1 ].min])
  end

  # 同じ親の中で 1 つ上（:up）または下（:down）の兄弟と position を入れ替える
  def move!(direction)
    siblings = self.class.where(parent_id: parent_id).ordered.to_a
    index = siblings.index { |s| s.id == id }
    other_index = direction == :up ? index - 1 : index + 1
    return if other_index.negative? || other_index >= siblings.size

    other = siblings[other_index]
    transaction do
      # 同 position で並んでいた場合も確実に入れ替わるよう、双方を再採番する
      a, b = [ position, other.position ].minmax
      b = a + 1 if a == b
      first, second = direction == :up ? [ self, other ] : [ other, self ]
      first.update_columns(position: a, updated_at: Time.current)
      second.update_columns(position: b, updated_at: Time.current)
    end
  end

  # 自分と子孫を合算した工数・コスト（未入力は 0 扱い）。
  # children がメモリ上で紐付け済みであること（preloaded_index 経由）を想定。
  def rollup(attribute)
    ([ self ] + descendants).sum { |todo| todo.public_send(attribute) || 0 }
  end

  private

  def parent_must_be_higher_level
    return if parent.nil? || !TYPE_LEVELS.key?(todo_type)
    return if self.class.valid_parent_child?(parent.todo_type, todo_type)

    errors.add(:parent_id,
      "の種類 #{parent.todo_type} の下に #{todo_type} は置けません")
  end

  def parent_must_not_be_self_or_descendant
    return if parent.nil? || new_record?

    node = parent
    while node
      if node.id == id
        errors.add(:parent_id, "に自分自身または子孫は指定できません")
        break
      end
      node = node.parent
    end
  end

  def children_must_stay_lower_level
    return unless todo_type_changed? && TYPE_LEVELS.key?(todo_type)

    bad = children.reject { |c| self.class.valid_parent_child?(todo_type, c.todo_type) }
    return if bad.empty?

    errors.add(:todo_type,
      "を #{todo_type} に変更できません（#{bad.map(&:todo_type).uniq.join(', ')} の子があります）")
  end

  def assign_position
    return unless position.nil? || position.zero?

    siblings = self.class.where(parent_id: parent_id)
    self.position = (siblings.maximum(:position) || -1) + 1
  end
end
