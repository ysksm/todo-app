import { createServer } from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import { serveStatic, assetCount, normalizePath } from "./static";

const PORT = 8000;
const API_PREFIX = "/api/";

// 状態は todo → doing → done と進む。
type TodoCreate = {
  title: string;
  description: string;
  status: string;
};

type Todo = {
  id: number;
  title: string;
  description: string;
  status: string;
};

function isValidStatus(value: string): boolean {
  return value === "todo" || value === "doing" || value === "done";
}

const todos = new Map<number, Todo>();
let nextId = 1;

// SSE の変更通知。scriptc は ServerResponse を配列や Map に保持できないため、
// 購読者リストは持たず、変更カウンタを各接続が自分のタイマーで監視する。
const SSE_POLL_MS = 250;
const SSE_KEEP_ALIVE_TICKS = 60; // 250ms x 60 = 15 秒ごとに keep-alive
let changeVersion = 0;
let lastEventData = "";

function publishChange(action: string, id: number): void {
  lastEventData = `{"action":"${action}","ids":[${id}]}`;
  changeVersion += 1;
}

// GET /api/todos/events。接続を開いたままにして todos_changed を流し続ける。
function handleEvents(req: IncomingMessage, res: ServerResponse): void {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
  });
  res.write(": connected\n\n");

  let seenVersion = changeVersion;
  let idleTicks = 0;
  const timer = setInterval(() => {
    if (changeVersion !== seenVersion) {
      seenVersion = changeVersion;
      idleTicks = 0;
      res.write(`event: todos_changed\ndata: ${lastEventData}\n\n`);
      return;
    }
    idleTicks += 1;
    if (idleTicks >= SSE_KEEP_ALIVE_TICKS) {
      idleTicks = 0;
      res.write(": keep-alive\n\n");
    }
  }, SSE_POLL_MS);

  req.on("close", () => {
    clearInterval(timer);
  });
}

// statusFilter が空文字ならフィルタなしで全件返す。
function listTodos(statusFilter: string): Todo[] {
  const result: Todo[] = [];
  for (const todo of todos.values()) {
    if (statusFilter === "" || todo.status === statusFilter) {
      result.push(todo);
    }
  }
  return result;
}

function createTodo(input: TodoCreate): Todo {
  const todo: Todo = {
    id: nextId,
    title: input.title,
    description: input.description,
    status: input.status,
  };
  todos.set(nextId, todo);
  nextId += 1;
  return todo;
}

// pydantic の TodoCreate と同じく description / status は省略可能。
// status を持たない旧クライアントの completed も受け付ける（true → done / false → todo）。
// scriptc のキャストは実行時に検証され、必須フィールドが欠けると例外になる。
function parseTodoCreate(body: string): TodoCreate {
  const required = JSON.parse(body) as { title: string };

  let description = "";
  try {
    description = (JSON.parse(body) as { description: string }).description;
  } catch (error) {
    description = "";
  }

  let status = "";
  try {
    status = (JSON.parse(body) as { status: string }).status;
  } catch (error) {
    status = "";
  }

  if (status === "") {
    let completed = false;
    try {
      completed = (JSON.parse(body) as { completed: boolean }).completed;
    } catch (error) {
      completed = false;
    }
    status = completed ? "done" : "todo";
  }

  if (!isValidStatus(status)) {
    throw new Error(`invalid status: ${status}`);
  }

  return { title: required.title, description: description, status: status };
}

// url のクエリから name の値を取り出す。無ければ空文字。
function queryParam(url: string, name: string): string {
  const queryIndex = url.indexOf("?");
  if (queryIndex < 0) {
    return "";
  }
  const query = url.slice(queryIndex + 1);
  for (const pair of query.split("&")) {
    if (pair.startsWith(name + "=")) {
      return pair.slice(name.length + 1);
    }
  }
  return "";
}

function sendJson(res: ServerResponse, status: number, payload: string): void {
  const body = Buffer.from(payload, "utf8");
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": body.length,
  });
  res.end(body);
}

// API ルーター。処理したら true を返す。url はクエリ付きの生パス。
function handleApi(
  req: IncomingMessage,
  res: ServerResponse,
  path: string,
  url: string,
  body: string,
): boolean {
  if (path === "/api/todos/events") {
    if (req.method === "GET") {
      handleEvents(req, res);
      return true;
    }
    sendJson(res, 405, '{"detail":"Method Not Allowed"}');
    return true;
  }
  if (path === "/api/todos") {
    const method = req.method;
    if (method === "GET") {
      const statusFilter = queryParam(url, "status");
      if (statusFilter !== "" && !isValidStatus(statusFilter)) {
        sendJson(res, 422, '{"detail":"Invalid status"}');
        return true;
      }
      sendJson(res, 200, JSON.stringify(listTodos(statusFilter)));
      return true;
    }
    if (method === "POST") {
      try {
        const todo = createTodo(parseTodoCreate(body));
        publishChange("created", todo.id);
        sendJson(res, 200, JSON.stringify(todo));
      } catch (error) {
        sendJson(res, 422, '{"detail":"Invalid request body"}');
      }
      return true;
    }
    sendJson(res, 405, '{"detail":"Method Not Allowed"}');
    return true;
  }
  return false;
}

function handleRequest(req: IncomingMessage, res: ServerResponse, body: string): void {
  const url = req.url;
  if (url === undefined) {
    sendJson(res, 400, '{"detail":"Bad Request"}');
    return;
  }

  const path = normalizePath(url);

  // /api/* は必ず API が受け持つ。静的ハンドラに落ちて index.html が返らないようにする。
  if (path === "/api" || path.startsWith(API_PREFIX)) {
    if (!handleApi(req, res, path, url, body)) {
      sendJson(res, 404, '{"detail":"Not Found"}');
    }
    return;
  }

  if (serveStatic(req, res, path)) {
    return;
  }

  sendJson(res, 404, '{"detail":"Not Found"}');
}

function main(): void {
  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    let body = "";
    req.on("data", (chunk: Buffer) => {
      body += chunk.toString("utf8");
    });
    req.on("end", () => {
      handleRequest(req, res, body);
    });
  });

  server.on("error", (error: Error) => {
    console.error(`failed to start server on port ${PORT}: ${error.message}`);
    process.exit(1);
  });

  server.listen(PORT, () => {
    console.log(`TODO API listening on http://127.0.0.1:${PORT}`);
    console.log(`embedded static assets: ${assetCount}`);
  });
}

main();
