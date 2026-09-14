export async function waitFor<T>(read: () => T | undefined | false, signal: AbortSignal, timeout = 15000): Promise<T> {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    signal.throwIfAborted();
    const value = read();
    if (value !== undefined && value !== false) return value;
    await new Promise<void>(resolve => setTimeout(resolve, 100));
  }
  throw new Error('El sitio tardó demasiado en cargar. Volvé a intentarlo.');
}
