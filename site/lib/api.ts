import { API_BASE } from './site';
import type { ProfileEnvelope, RawPayload } from './types';

class ApiRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
  }
}

async function get<T>(path: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, { headers: { Accept: 'application/json' } });
  } catch {
    throw new ApiRequestError('Could not reach the API. It may be waking up — try again.', 0);
  }
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ApiRequestError(
      body?.error?.message ?? `Request failed (${res.status}).`,
      res.status,
      body?.error?.code,
    );
  }
  return body as T;
}

export function fetchProfile(linkedinUrl: string, full: boolean): Promise<ProfileEnvelope> {
  const q = new URLSearchParams({ url: linkedinUrl });
  if (full) q.set('full', '1');
  return get<ProfileEnvelope>(`/profile?${q}`);
}

export function fetchProfileRaw(linkedinUrl: string, full: boolean): Promise<RawPayload> {
  const q = new URLSearchParams({ url: linkedinUrl });
  if (full) q.set('full', '1');
  return get<RawPayload>(`/profile/raw?${q}`);
}

export function fetchSample(full: boolean): Promise<ProfileEnvelope> {
  return get<ProfileEnvelope>(full ? '/profile/sample?full=1' : '/profile/sample');
}

export function fetchSampleRaw(full: boolean): Promise<RawPayload> {
  return get<RawPayload>(full ? '/profile/sample/raw?full=1' : '/profile/sample/raw');
}

export { ApiRequestError };
