Rails.application.routes.draw do
  root "todos#index"

  resources :todos do
    member do
      patch :toggle
      patch :advance
      patch :move
      patch :set_priority
    end
    resources :links, controller: :todo_links, only: %i[create destroy]
  end

  get "mindmap(/:id)", to: "mindmap#show", as: :mindmap
  get "browse", to: "browse#index", as: :browse
  get "browse/:id", to: "browse#show", as: :browse_todo
  get "work", to: "work#index", as: :work
  get "calendar", to: "calendar#show", as: :calendar

  namespace :api, defaults: { format: :json } do
    get "todos/tree", to: "todos#tree"
    resources :todos, only: %i[index show create update destroy]
  end

  get "up" => "rails/health#show", as: :rails_health_check
end
