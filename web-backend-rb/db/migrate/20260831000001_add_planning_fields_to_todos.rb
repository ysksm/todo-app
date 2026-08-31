class AddPlanningFieldsToTodos < ActiveRecord::Migration[8.1]
  def change
    change_table :todos, bulk: true do |t|
      t.text :goal
      t.date :target_date
      t.string :priority, default: "medium", null: false
      t.decimal :estimated_hours, precision: 8, scale: 2
      t.decimal :estimated_cost, precision: 12, scale: 2
      t.decimal :actual_hours, precision: 8, scale: 2
      t.decimal :actual_cost, precision: 12, scale: 2
    end

    add_index :todos, :target_date
    add_index :todos, :priority
  end
end
