// Cloud backup to a private GitHub Gist. The player pastes a personal access
// token that can only touch Gists; the game keeps one secret Gist holding the
// latest save. GitHub keeps every revision of a Gist, so earlier backups stay
// recoverable from the Gist's history too.

export const GIST_FILENAME = 'valehalla-save.json';
export const GIST_DESCRIPTION = 'Valehalla save backup (written by the game, do not edit)';
const API = 'https://api.github.com';

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export type GistFailure = 'bad-token' | 'forbidden' | 'not-found' | 'rate-limited' | 'offline' | 'unexpected';

export class GistError extends Error {
  readonly failure: GistFailure;
  readonly status: number | null;
  constructor(failure: GistFailure, status: number | null, message: string) {
    super(message);
    this.name = 'GistError';
    this.failure = failure;
    this.status = status;
  }
}

interface GistFile {
  filename?: string;
  content?: string;
  truncated?: boolean;
  raw_url?: string;
}

interface Gist {
  id: string;
  updated_at?: string;
  files: Record<string, GistFile | null>;
}

function failureFor(status: number, remaining: string | null): GistFailure {
  if (status === 401) return 'bad-token';
  if (status === 403 || status === 429) return remaining === '0' || status === 429 ? 'rate-limited' : 'forbidden';
  if (status === 404) return 'not-found';
  return 'unexpected';
}

export class GistBackup {
  private readonly token: string;
  private readonly fetchImpl: FetchLike;
  constructor(token: string, fetchImpl: FetchLike) {
    this.token = token.trim();
    this.fetchImpl = fetchImpl;
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    let response: Response;
    try {
      response = await this.fetchImpl(API + path, {
        method,
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${this.token}`,
          'X-GitHub-Api-Version': '2022-11-28',
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch (error) {
      throw new GistError('offline', null, `Could not reach GitHub: ${String(error)}`);
    }
    if (!response.ok) {
      const failure = failureFor(response.status, response.headers.get('x-ratelimit-remaining'));
      throw new GistError(failure, response.status, `GitHub answered ${response.status} for ${method} ${path}`);
    }
    return (await response.json()) as T;
  }

  /** The id of this account's backup Gist, or null if there is none yet. */
  async find(): Promise<string | null> {
    for (let page = 1; page <= 10; page++) {
      const gists = await this.request<Gist[]>('GET', `/gists?per_page=100&page=${page}`);
      const match = gists.find((g) => g.files && GIST_FILENAME in g.files);
      if (match) return match.id;
      if (gists.length < 100) break;
    }
    return null;
  }

  async create(saveText: string): Promise<string> {
    const gist = await this.request<Gist>('POST', '/gists', {
      description: GIST_DESCRIPTION,
      public: false,
      files: { [GIST_FILENAME]: { content: saveText } },
    });
    return gist.id;
  }

  async update(gistId: string, saveText: string): Promise<void> {
    await this.request<Gist>('PATCH', `/gists/${gistId}`, { files: { [GIST_FILENAME]: { content: saveText } } });
  }

  /**
   * Upload a save, creating the backup Gist on first use. Returns the Gist id
   * to remember. If the remembered Gist was deleted, a new one is found or made.
   */
  async upload(saveText: string, knownGistId: string | null): Promise<string> {
    if (knownGistId) {
      try {
        await this.update(knownGistId, saveText);
        return knownGistId;
      } catch (error) {
        if (!(error instanceof GistError) || error.failure !== 'not-found') throw error;
      }
    }
    const existing = await this.find();
    if (existing) {
      await this.update(existing, saveText);
      return existing;
    }
    return this.create(saveText);
  }

  /** The backed-up save text, or null if this account has no backup. */
  async download(knownGistId: string | null): Promise<{ gistId: string; text: string } | null> {
    let gistId = knownGistId;
    let gist: Gist | null = null;
    if (gistId) {
      try {
        gist = await this.request<Gist>('GET', `/gists/${gistId}`);
      } catch (error) {
        if (!(error instanceof GistError) || error.failure !== 'not-found') throw error;
        gistId = null;
      }
    }
    if (!gist) {
      gistId = await this.find();
      if (!gistId) return null;
      gist = await this.request<Gist>('GET', `/gists/${gistId}`);
    }
    const file = gist.files[GIST_FILENAME];
    if (!file) return null;
    if (file.truncated && file.raw_url) {
      // Files over about 1 MB come back cut short; the raw link has all of it.
      let raw: Response;
      try {
        raw = await this.fetchImpl(file.raw_url);
      } catch (error) {
        throw new GistError('offline', null, `Could not reach GitHub: ${String(error)}`);
      }
      if (!raw.ok) throw new GistError('unexpected', raw.status, `GitHub answered ${raw.status} for the raw save`);
      return { gistId: gistId!, text: await raw.text() };
    }
    if (typeof file.content !== 'string') return null;
    return { gistId: gistId!, text: file.content };
  }
}

export function describeGistFailure(error: unknown): string {
  if (!(error instanceof GistError)) return 'Something unexpected went wrong with the cloud backup.';
  switch (error.failure) {
    case 'bad-token':
      return 'GitHub rejected the token. It may have expired or been mistyped.';
    case 'forbidden':
      return 'The token does not have permission to use Gists.';
    case 'not-found':
      return 'The backup could not be found on GitHub.';
    case 'rate-limited':
      return 'GitHub is limiting requests right now. The backup will retry later.';
    case 'offline':
      return 'No connection to GitHub. The backup will retry when you are online.';
    default:
      return `GitHub returned an unexpected error (${error.status ?? 'no status'}).`;
  }
}
