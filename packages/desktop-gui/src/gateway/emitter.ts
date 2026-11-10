// 泛型监听器注册表：替代 GatewayClient 里 11 组 onXxx/退订/_notifyXxx
// 三件套手写样板。emit 时遍历副本，允许回调在事件分发中退订自身。
export class ListenerSet<Args extends unknown[]> {
  private items: Array<(...args: Args) => void> = [];

  add(fn: (...args: Args) => void): () => void {
    this.items.push(fn);
    return () => {
      this.items = this.items.filter((l) => l !== fn);
    };
  }

  emit(...args: Args): void {
    for (const fn of [...this.items]) fn(...args);
  }
}
