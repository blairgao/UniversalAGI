/** Send binary STL to a stateless mesh endpoint; the processed STL comes back. */
export async function meshOperation(
  path: string,
  stl: ArrayBuffer,
  signal: AbortSignal,
  params?: Record<string, string | number>,
): Promise<ArrayBuffer> {
  const query = params
    ? "?" + new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)]))
    : "";
  const response = await fetch(`/api/mesh/${path}${query}`, {
    method: "POST",
    headers: { "Content-Type": "application/octet-stream" },
    body: stl,
    signal,
  });
  if (!response.ok) {
    let detail = `${response.status} ${response.statusText}`;
    try {
      const body = await response.json();
      if (body.detail) detail = body.detail;
    } catch {
      // non-JSON error body; keep status text
    }
    throw new Error(`Server operation failed: ${detail}`);
  }
  return response.arrayBuffer();
}
