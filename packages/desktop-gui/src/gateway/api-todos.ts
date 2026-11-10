// todo.* 领域 RPC（从 client.ts 拆出，经 DomainRpc 调用面解耦）
import type { DomainRpc, Todo, TodoCreateInput, TodoStatus, TodoUpdateInput } from "./protocol";

export async function fetchTodos(
  rpc: DomainRpc,
  filter?: { status?: TodoStatus; tag?: string; dueBefore?: number },
): Promise<Todo[]> {
  try {
    const res = await rpc.call("todo.list", filter ?? {});
    return (res.payload?.todos ?? []) as Todo[];
  } catch (err) {
    console.error("[Gateway] fetchTodos failed:", err);
    rpc.notifyError(`加载待办失败：${err instanceof Error ? err.message : String(err)}`);
    return [];
  }
}

export async function addTodo(rpc: DomainRpc, input: TodoCreateInput): Promise<Todo> {
  try {
    const res = await rpc.call("todo.add", input);
    return res.payload.todo as Todo;
  } catch (err) {
    console.error("[Gateway] addTodo failed:", err);
    rpc.notifyError(`新增待办失败：${err instanceof Error ? err.message : String(err)}`);
    throw err;
  }
}

export async function updateTodo(
  rpc: DomainRpc,
  id: string,
  patch: TodoUpdateInput,
): Promise<Todo> {
  try {
    const res = await rpc.call("todo.update", { id, ...patch });
    return res.payload.todo as Todo;
  } catch (err) {
    console.error("[Gateway] updateTodo failed:", err);
    rpc.notifyError(`更新待办失败：${err instanceof Error ? err.message : String(err)}`);
    throw err;
  }
}

export async function removeTodo(rpc: DomainRpc, id: string): Promise<void> {
  try {
    await rpc.call("todo.remove", { id });
  } catch (err) {
    console.error("[Gateway] removeTodo failed:", err);
    rpc.notifyError(`删除待办失败：${err instanceof Error ? err.message : String(err)}`);
    throw err;
  }
}
