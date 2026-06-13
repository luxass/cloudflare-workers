export async function mapConcurrent<T>(
  items: T[],
  concurrency: number,
  callback: (item: T) => Promise<void>,
) {
  for (let index = 0; index < items.length; index += concurrency) {
    await Promise.all(items.slice(index, index + concurrency).map(callback));
  }
}
