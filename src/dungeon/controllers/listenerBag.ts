/* Tracks every listener a controller registers so its detach() can remove
   them all — the teardown contract that makes re-initialization (HMR, tests)
   safe. One bag per controller attach call. */

export interface ListenerBag {
  /** addEventListener + remember the matching removeEventListener. */
  listen<E extends Event>(
    target: EventTarget,
    type: string,
    handler: (event: E) => void,
    options?: AddEventListenerOptions | boolean,
  ): void;
  /** Remove every listener registered through this bag. Idempotent. */
  detach(): void;
}

export function createListenerBag(): ListenerBag {
  const teardowns: (() => void)[] = [];
  return {
    listen(target, type, handler, options) {
      const listener = handler as EventListener;
      target.addEventListener(type, listener, options);
      teardowns.push(() => target.removeEventListener(type, listener, options));
    },
    detach() {
      teardowns.splice(0).forEach((teardown) => teardown());
    },
  };
}
