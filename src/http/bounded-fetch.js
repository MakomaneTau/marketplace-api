// Bound provider outages even when the SDK supplies its own cancellation signal.
export function boundedFetch(input, init = {}, timeoutMs = 15_000) {
  const deadline = AbortSignal.timeout(timeoutMs);
  const signal = init.signal
    ? AbortSignal.any([init.signal, deadline])
    : deadline;
  return fetch(input, { ...init, signal });
}
