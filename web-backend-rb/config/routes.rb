Rails.application.routes.draw do
  root "todos#index"

  resources :todos do
    member do
      patch :toggle
    end
  end

  namespace :api, defaults: { format: :json } do
    get "todos/tree", to: "todos#tree"
    resources :todos, only: %i[index show create update destroy]
  end

  get "up" => "rails/health#show", as: :rails_health_check
end
