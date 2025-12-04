export function createLoggingFetch(context: { requestId?: string }): typeof fetch {
  return async (url, options) => {
    const startTime = Date.now();

    // Log outgoing request (sanitize auth headers)
    const method = options?.method || 'GET';
    console.log(`[HTTP ${context.requestId}] → ${method} ${url}`);

    const response = await fetch(url, options);
    const duration = Date.now() - startTime;

    // Extract critical headers
    const headers = {
      'x-request-id': response.headers.get('x-request-id'),
      'x-ratelimit-limit': response.headers.get('x-ratelimit-limit'),
      'x-ratelimit-remaining': response.headers.get('x-ratelimit-remaining'),
      'x-ratelimit-reset': response.headers.get('x-ratelimit-reset'),
      'retry-after': response.headers.get('retry-after'),
      'content-type': response.headers.get('content-type'),
    };

    // Log response metadata
    console.log(`[HTTP ${context.requestId}] ← ${response.status} ${response.statusText} (${duration}ms)`);
    console.log(`[HTTP ${context.requestId}] Headers:`, JSON.stringify(headers, null, 2));

    // Log non-200 responses with body
    if (!response.ok) {
      console.error(`[HTTP ${context.requestId}] HTTP Error ${response.status}: ${response.statusText}`);
      const cloned = response.clone();
      try {
        const text = await cloned.text();
        console.error(`[HTTP ${context.requestId}] Response body:`, text.substring(0, 500));
      } catch (e) {
        console.error(`[HTTP ${context.requestId}] Could not read response body`);
      }
    }

    // For SSE streams (text/event-stream), intercept and log the stream data
    const contentType = response.headers.get('content-type');
    if (contentType?.includes('text/event-stream')) {
      // Clone the response to read the body without consuming it
      const cloned = response.clone();

      // Read and log SSE data in the background (don't await to avoid blocking)
      (async () => {
        try {
          const reader = cloned.body?.getReader();
          const decoder = new TextDecoder();
          let sseEventCount = 0;
          let buffer = '';

          if (!reader) {
            console.warn(`[HTTP ${context.requestId}] SSE stream has no body reader`);
            return;
          }

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });

            // Split by double newline (SSE event separator)
            const events = buffer.split('\n\n');
            buffer = events.pop() || ''; // Keep incomplete event in buffer

            for (const event of events) {
              if (!event.trim()) continue;

              sseEventCount++;

              // Log first few events and any error/blocked events
              if (sseEventCount <= 3 || event.includes('blockReason') || event.includes('finishReason')) {
                console.log(`[HTTP ${context.requestId}] SSE Event #${sseEventCount}:`, event.substring(0, 500));
              }

              // Check for content filtering or blocks
              if (event.includes('blockReason') || event.includes('BLOCK_REASON')) {
                console.warn(`[HTTP ${context.requestId}] ⚠️  Content blocked in SSE stream!`, event);
              }
            }
          }

          console.log(`[HTTP ${context.requestId}] SSE stream complete. Total events: ${sseEventCount}`);
        } catch (e) {
          console.error(`[HTTP ${context.requestId}] Error reading SSE stream:`, e);
        }
      })();
    }

    return response;
  };
}
