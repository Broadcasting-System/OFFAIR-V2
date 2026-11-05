/**
 * 키(저장소 경로 등)마다 하나씩 도는 비동기 줄. 같은 키의 작업은 순서대로,
 * 다른 키끼리는 동시에 돈다. 한 Next 서버 프로세스 안에서만 유효하다.
 */
export class KeyedMutex {
  private tails = new Map<string, Promise<unknown>>();

  run<T>(key: string, task: () => Promise<T>): Promise<T> {
    const prev = this.tails.get(key) ?? Promise.resolve();
    const next = prev.then(task, task);
    // 실패해도 다음 작업은 이어서 돈다
    const tail = next.catch(() => undefined);
    this.tails.set(key, tail);
    void tail.then(() => {
      if (this.tails.get(key) === tail) this.tails.delete(key);
    });
    return next;
  }
}

/** 프로세스 전체에서 공유 (HMR 로 모듈이 다시 읽혀도 같은 줄을 쓴다) */
const g = globalThis as unknown as { __offairMutex?: KeyedMutex };
export const repoMutex: KeyedMutex = (g.__offairMutex ??= new KeyedMutex());
