# This file is auto-generated from the current state of the database. Instead
# of editing this file, please use the migrations feature of Active Record to
# incrementally modify your database, and then regenerate this schema definition.
#
# This file is the source Rails uses to define your schema when running `bin/rails
# db:schema:load`. When creating a new database, `bin/rails db:schema:load` tends to
# be faster and is potentially less error prone than running all of your
# migrations from scratch. Old migrations may fail to apply correctly if those
# migrations use external dependencies or application code.
#
# It's strongly recommended that you check this file into your version control system.

ActiveRecord::Schema[8.1].define(version: 2026_08_31_000002) do
  create_table "todo_links", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.string "link_type", default: "relates_to", null: false
    t.integer "source_id", null: false
    t.integer "target_id", null: false
    t.datetime "updated_at", null: false
    t.index ["source_id", "target_id", "link_type"], name: "index_todo_links_on_source_id_and_target_id_and_link_type", unique: true
    t.index ["source_id"], name: "index_todo_links_on_source_id"
    t.index ["target_id"], name: "index_todo_links_on_target_id"
  end

  create_table "todos", force: :cascade do |t|
    t.decimal "actual_cost", precision: 12, scale: 2
    t.decimal "actual_hours", precision: 8, scale: 2
    t.datetime "created_at", null: false
    t.text "description"
    t.decimal "estimated_cost", precision: 12, scale: 2
    t.decimal "estimated_hours", precision: 8, scale: 2
    t.text "goal"
    t.integer "parent_id"
    t.integer "position", default: 0, null: false
    t.string "priority", default: "medium", null: false
    t.string "status", default: "open", null: false
    t.date "target_date"
    t.string "title", null: false
    t.string "todo_type", default: "task", null: false
    t.datetime "updated_at", null: false
    t.index ["parent_id", "position"], name: "index_todos_on_parent_id_and_position"
    t.index ["parent_id"], name: "index_todos_on_parent_id"
    t.index ["priority"], name: "index_todos_on_priority"
    t.index ["target_date"], name: "index_todos_on_target_date"
  end

  add_foreign_key "todo_links", "todos", column: "source_id"
  add_foreign_key "todo_links", "todos", column: "target_id"
  add_foreign_key "todos", "todos", column: "parent_id"
end
