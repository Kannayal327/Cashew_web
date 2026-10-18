export const apiBase = (
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"
).replace(/\/$/, "");
export const demoCatalog =
  process.env.NEXT_PUBLIC_DEMO_CATALOG === "true" ||
  (!process.env.NEXT_PUBLIC_API_URL &&
    process.env.NEXT_PUBLIC_DEMO_CATALOG !== "false");

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

export async function api<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  let response: Response;
  try {
    const timeout = AbortSignal.timeout(20000);
    response = await fetch(`${apiBase}${path}`, {
      ...options,
      cache: "no-store",
      signal: options.signal
        ? AbortSignal.any([options.signal, timeout])
        : timeout,
      headers: { "Content-Type": "application/json", ...options.headers },
    });
  } catch (error) {
    if (options.signal?.aborted) throw error;
    throw new ApiError(
      "We couldn’t reach the store. Please check your connection and try again.",
      0,
    );
  }
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const message =
      typeof body.detail === "string"
        ? body.detail
        : response.status === 429
          ? "Too many attempts. Please try again in a minute."
          : "We couldn’t complete that request. Please try again.";
    throw new ApiError(message, response.status);
  }
  return response.json();
}
