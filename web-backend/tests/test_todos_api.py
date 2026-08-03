from fastapi.testclient import TestClient


def post_todo(
    client: TestClient,
    title: str,
    parent_id: int | None = None,
    todo_type: str = "product",
) -> dict:
    response = client.post(
        "/api/todos",
        json={"title": title, "parent_id": parent_id, "type": todo_type},
    )
    assert response.status_code == 200
    return response.json()


def test_create_and_list_returns_depth_first_order(client: TestClient) -> None:
    root = post_todo(client, "root")
    child = post_todo(client, "child", parent_id=root["id"], todo_type="epic")
    post_todo(client, "grandchild", parent_id=child["id"], todo_type="user_story")
    post_todo(client, "second root")

    response = client.get("/api/todos")

    assert response.status_code == 200
    assert [todo["title"] for todo in response.json()] == [
        "root",
        "child",
        "grandchild",
        "second root",
    ]


def test_create_defaults_to_root(client: TestClient) -> None:
    response = client.post("/api/todos", json={"title": "no parent field"})

    assert response.status_code == 200
    assert response.json()["parent_id"] is None
    assert response.json()["position"] == 0
    # 種類も省略できる。既定は task。
    assert response.json()["type"] == "task"
    # 状態も省略できる。既定は todo。
    assert response.json()["status"] == "todo"


def test_list_filters_by_status(client: TestClient) -> None:
    todo = post_todo(client, "手つかず")
    doing = post_todo(client, "作業中")
    client.put(
        f"/api/todos/{doing['id']}",
        json={"title": "作業中", "status": "doing", "type": "product"},
    )

    response = client.get("/api/todos", params={"status": "doing"})

    assert response.status_code == 200
    assert [t["id"] for t in response.json()] == [doing["id"]]
    assert [t["id"] for t in client.get("/api/todos", params={"status": "todo"}).json()] == [
        todo["id"]
    ]
    assert client.get("/api/todos", params={"status": "done"}).json() == []


def test_list_with_unknown_status_returns_422(client: TestClient) -> None:
    response = client.get("/api/todos", params={"status": "unknown"})

    assert response.status_code == 422


def test_put_accepts_legacy_completed(client: TestClient) -> None:
    """status 導入前のクライアントが送る completed も受け付ける。"""
    todo = post_todo(client, "旧クライアント")

    response = client.put(
        f"/api/todos/{todo['id']}",
        json={"title": "旧クライアント", "completed": True, "type": "product"},
    )

    assert response.status_code == 200
    assert response.json()["status"] == "done"


def test_create_with_a_type_the_parent_cannot_hold_returns_400(client: TestClient) -> None:
    task = post_todo(client, "task", todo_type="task")

    response = client.post(
        "/api/todos",
        json={"title": "epic", "parent_id": task["id"], "type": "epic"},
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "Cannot place this todo type under that parent type"


def test_put_rejects_a_type_that_breaks_the_children(client: TestClient) -> None:
    epic = post_todo(client, "epic", todo_type="epic")
    post_todo(client, "story", parent_id=epic["id"], todo_type="user_story")

    response = client.put(f"/api/todos/{epic['id']}", json={"title": "epic", "type": "task"})

    assert response.status_code == 400
    assert client.get(f"/api/todos/{epic['id']}").json()["type"] == "epic"


def test_move_under_a_parent_of_the_same_level_returns_400(client: TestClient) -> None:
    product = post_todo(client, "product")
    first = post_todo(client, "first epic", parent_id=product["id"], todo_type="epic")
    second = post_todo(client, "second epic", parent_id=product["id"], todo_type="epic")

    response = client.patch(
        f"/api/todos/{second['id']}/move",
        json={"parent_id": first["id"]},
    )

    assert response.status_code == 400
    assert client.get(f"/api/todos/{second['id']}").json()["parent_id"] == product["id"]


def test_create_with_unknown_parent_returns_400(client: TestClient) -> None:
    response = client.post("/api/todos", json={"title": "orphan", "parent_id": 999})

    assert response.status_code == 400
    assert response.json()["detail"] == "Parent todo not found"


def test_get_todo(client: TestClient) -> None:
    todo = post_todo(client, "root")

    response = client.get(f"/api/todos/{todo['id']}")

    assert response.status_code == 200
    assert response.json()["title"] == "root"


def test_get_missing_todo_returns_404(client: TestClient) -> None:
    response = client.get("/api/todos/999")

    assert response.status_code == 404
    assert response.json()["detail"] == "Todo not found"


def test_put_keeps_parent_and_position(client: TestClient) -> None:
    root = post_todo(client, "root")
    child = post_todo(client, "child", parent_id=root["id"], todo_type="epic")

    response = client.put(
        f"/api/todos/{child['id']}",
        json={"title": "renamed", "description": "detail", "status": "done", "type": "epic"},
    )

    assert response.status_code == 200
    assert response.json()["parent_id"] == root["id"]
    assert response.json()["position"] == 0
    assert response.json()["title"] == "renamed"


def test_put_missing_todo_returns_404(client: TestClient) -> None:
    response = client.put("/api/todos/999", json={"title": "nope"})

    assert response.status_code == 404


def test_move_changes_parent_and_position(client: TestClient) -> None:
    root = post_todo(client, "root")
    first = post_todo(client, "first", parent_id=root["id"], todo_type="epic")
    second = post_todo(client, "second", parent_id=root["id"], todo_type="epic")

    response = client.patch(
        f"/api/todos/{second['id']}/move",
        json={"parent_id": root["id"], "position": 0},
    )

    assert response.status_code == 200
    assert response.json()["position"] == 0
    assert [todo["title"] for todo in client.get("/api/todos").json()] == [
        "root",
        "second",
        "first",
    ]
    assert client.get(f"/api/todos/{first['id']}").json()["position"] == 1


def test_move_to_root(client: TestClient) -> None:
    root = post_todo(client, "root")
    child = post_todo(client, "child", parent_id=root["id"], todo_type="epic")

    response = client.patch(f"/api/todos/{child['id']}/move", json={"parent_id": None})

    assert response.status_code == 200
    assert response.json()["parent_id"] is None


def test_move_under_descendant_returns_400(client: TestClient) -> None:
    root = post_todo(client, "root")
    child = post_todo(client, "child", parent_id=root["id"], todo_type="epic")

    response = client.patch(
        f"/api/todos/{root['id']}/move",
        json={"parent_id": child["id"]},
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "Cannot move a todo under its own descendant"


def test_move_to_unknown_parent_returns_400(client: TestClient) -> None:
    todo = post_todo(client, "root")

    response = client.patch(f"/api/todos/{todo['id']}/move", json={"parent_id": 999})

    assert response.status_code == 400
    assert response.json()["detail"] == "Parent todo not found"


def test_move_missing_todo_returns_404(client: TestClient) -> None:
    response = client.patch("/api/todos/999/move", json={"parent_id": None})

    assert response.status_code == 404


def test_delete_cascades_to_descendants(client: TestClient) -> None:
    root = post_todo(client, "root")
    child = post_todo(client, "child", parent_id=root["id"], todo_type="epic")
    post_todo(client, "grandchild", parent_id=child["id"], todo_type="user_story")
    post_todo(client, "survivor")

    response = client.delete(f"/api/todos/{root['id']}")

    assert response.status_code == 204
    assert [todo["title"] for todo in client.get("/api/todos").json()] == ["survivor"]


def test_delete_missing_todo_returns_404(client: TestClient) -> None:
    response = client.delete("/api/todos/999")

    assert response.status_code == 404


