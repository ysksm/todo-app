/** 変更購読を解除する。 */
export type UnsubscribeTodoChanges = () => void

/**
 * サーバー側で TODO が変わったときに onChange を呼ぶ購読を開始する。
 * どう受け取るか（SSE など）は infrastructure 側が決める。
 */
export type SubscribeToTodoChanges = (onChange: () => void) => UnsubscribeTodoChanges
