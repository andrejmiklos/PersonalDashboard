/** Envelope of every `GET /api/v1/data/<type>` response (docs/07-api.md §3). */
export interface DataEnvelope<T> {
  /** When the provider was last called successfully (ISO, UTC). */
  updatedAt: string;
  /** Server cache lifetime in seconds. */
  ttl: number;
  /** Present when the provider failed and an older payload is served. */
  stale?: true;
  data: T;
}
