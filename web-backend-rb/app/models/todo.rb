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

  belongs_to :parent, class_name: "Todo", optional: true
  has_many :children, -> { order(:position, :id) },
           class_name: "Todo", foreign_key: :parent_id,
           inverse_of: :parent, dependent: :destroy

  scope :roots, -> { where(parent_id: nil) }
  scope :ordered, -> { order(:position, :id) }

  validates :title, presence: true
  validates :todo_type, inclusion: { in: TYPES }
  validates :status, inclusion: { in: STATUSES }
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
