/**
 * Retries an async function with exponential backoff and jitter.
 * Only retries on transient HTTP status codes embedded in the error message.
 */
export async function withRetry(fn, options = {}) {
  const {
    maxAttempts = 3,
    baseDelayMs = 500,
    retryableStatuses = [429, 500, 502, 503, 529],
  } = options;

  let lastError;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      // Also retry on transient network errors (DNS failure, TCP reset, etc.)
      const isNetworkError = error instanceof TypeError && String(error.message).includes('fetch failed');
      const isRetryable = isNetworkError || retryableStatuses.some((status) =>
        String(error?.message ?? '').includes(String(status)),
      );

      if (!isRetryable || attempt === maxAttempts) {
        break;
      }

      // Exponential backoff with ±10% jitter to avoid thundering herd
      const delay = baseDelayMs * 2 ** (attempt - 1) * (0.9 + Math.random() * 0.2);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}
