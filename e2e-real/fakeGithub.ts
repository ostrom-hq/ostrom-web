// SPDX-License-Identifier: AGPL-3.0-only
// A local stand-in for GitHub, so that the console's journeys never reach the real one (and never need a real
// account). After ostrom-e2e's `src/fake-github.ts`, trimmed to what a browser does on the console. ostrom-server's
// `console-journey.yml` points the server at two fixed ports, which the journeys that need GitHub start here:
//   OSTROM_E2E_FAKE_GITHUB_PORT (4610), the sign-in with GitHub (OSTROM_GITHUB_WEB_URL, OSTROM_GITHUB_API_URL):
//     GET  /login/oauth/authorize       sends the browser back to `redirect_uri` with a code, as the login prepared
//     POST /login/oauth/access_token    the code (once, with the PKCE verifier) for a token
//     GET  /user, /user/emails          who the token is
//   OSTROM_E2E_GITHUB_PORT (4700), the GitHub App (OSTROM_GITHUB_WEB, OSTROM_GITHUB_API):
//     GET  /apps/<slug>/installations/new   the install page: back to the server's callback with the installation
//                                           prepared, a web code and the server's `state`
//     POST /login/oauth/access_token        the web code (once, with the App's OAuth client) for a user token
//     GET  /user/installations              the installations that user administers
//     GET  /app/installations/<id>          the App's view of an installation (its JWT)
//     POST /app/installations/<id>/access_tokens   an installation token
//     GET  /installation/repositories       the repositories given to the installation
//     POST /graphql                         no GitHub organization: no teams
// Every request is recorded for the journey to assert on. Both ports share one state.
import { createHash } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';

/** The ports the server was started pointing at (ostrom-server `console-journey.yml`); 0 when not configured. */
export const SIGN_IN_PORT = Number(process.env['OSTROM_E2E_FAKE_GITHUB_PORT'] ?? '0');
export const APP_PORT = Number(process.env['OSTROM_E2E_GITHUB_PORT'] ?? '0');

/** The App's OAuth client in `console-journey.yml`: a web code is only exchanged with these. */
const APP_CLIENT = { id: 'Iv1.fake', secret: 'fake-client-secret' };

export interface Recorded {
  readonly port: number;
  readonly method: string;
  readonly path: string;
  readonly authorization: string;
}

interface Person {
  readonly login: string;
  readonly id: number;
  readonly email: string | undefined;
}

interface SignInCode {
  readonly person: Person;
  readonly challenge: string;
}

/** An installation of the App on `account`, which `admins` reach, with the repositories given to it. */
export interface FakeInstallation {
  readonly id: number;
  readonly account: string;
  readonly admins: readonly string[];
  readonly repos: readonly string[];
}

/** What the install page hands back to the server: this installation, as authorized by `login`. */
interface PreparedInstall {
  readonly installation: number;
  readonly login: string;
  readonly callback: string;
}

type Answer = readonly [number, unknown] | { readonly redirect: string };

/** A string field of a parsed body. */
function fieldOf(body: unknown, key: string): string | undefined {
  if (typeof body !== 'object' || body === null || !(key in body)) return undefined;
  const value: unknown = Reflect.get(body, key);
  return typeof value === 'string' ? value : undefined;
}

/** The PKCE `S256` challenge of a verifier. */
function challengeOf(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url');
}

export class FakeGitHub {
  readonly requests: Recorded[] = [];
  private readonly servers: Server[] = [];
  private readonly tokens = new Map<string, Person>();
  private readonly ids = new Map<string, number>();
  private readonly signInCodes = new Map<string, SignInCode>();
  private readonly webCodes = new Map<string, string>();
  private readonly installations = new Map<number, FakeInstallation>();
  private nextSignIn: Person | undefined;
  private nextInstall: PreparedInstall | undefined;
  private serial = 1;

  /** Listens on both ports, the server's sign-in one and its App one. */
  async start(): Promise<void> {
    for (const port of [SIGN_IN_PORT, APP_PORT]) {
      const server = createServer((request, response) => {
        void this.handle(port, request, response);
      });
      await new Promise<void>((resolve) => server.listen(port, '127.0.0.1', resolve));
      this.servers.push(server);
    }
  }

  async stop(): Promise<void> {
    await Promise.all(
      this.servers.splice(0).map(
        async (server) =>
          new Promise<void>((resolve) => {
            server.closeAllConnections();
            server.close(() => {
              resolve();
            });
          }),
      ),
    );
  }

  /** The next GitHub sign-in is authorized as `login`, whose verified primary address is `email`. */
  signInAs(login: string, email?: string): void {
    this.nextSignIn = { login, id: this.idOf(login), email };
  }

  /** Installs the App on `account` for `admins`, with `repos` (short names) given to it. */
  installation(installation: FakeInstallation): void {
    this.installations.set(installation.id, installation);
  }

  /** The next install page sends the browser back to `callback` with `installation`, authorized by `login`. */
  installs(installation: number, login: string, callback: string): void {
    this.nextInstall = { installation, login, callback };
  }

  private idOf(login: string): number {
    const known = this.ids.get(login);
    if (known !== undefined) return known;
    const id = 5000 + this.ids.size;
    this.ids.set(login, id);
    return id;
  }

  private token(prefix: string, person: Person): string {
    const token = `${prefix}_${person.login}_${String(this.serial++)}`;
    this.tokens.set(token, person);
    return token;
  }

  private async handle(port: number, request: IncomingMessage, response: ServerResponse): Promise<void> {
    const raw = await new Promise<string>((resolve) => {
      let text = '';
      request.setEncoding('utf8');
      request.on('data', (part: string) => {
        text += part;
      });
      request.on('end', () => {
        resolve(text);
      });
    });
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');
    const method = request.method ?? 'GET';
    const authorization = request.headers.authorization ?? '';
    this.requests.push({ port, method, path: url.pathname, authorization });
    let body: unknown = {};
    try {
      if ((request.headers['content-type'] ?? '').includes('json') && raw !== '') body = JSON.parse(raw);
      else body = Object.fromEntries(new URLSearchParams(raw));
    } catch {
      body = {};
    }
    // The helm demo's fake serves its API under /api: both spellings are read the same.
    const path = url.pathname.replace(/^\/api(?=\/)/, '');
    const answer = this.route(port, method, path, url.searchParams, body, authorization);
    if ('redirect' in answer) {
      response.writeHead(302, { location: answer.redirect });
      response.end();
      return;
    }
    response.writeHead(answer[0], { 'content-type': 'application/json' });
    response.end(JSON.stringify(answer[1]));
  }

  private route(
    port: number,
    method: string,
    path: string,
    query: URLSearchParams,
    body: unknown,
    authorization: string,
  ): Answer {
    if (method === 'GET' && path === '/login/oauth/authorize') return this.authorize(query);
    if (method === 'GET' && /^\/apps\/[^/]+\/installations\/new$/.test(path)) return this.installPage(query);
    if (method === 'POST' && path === '/login/oauth/access_token') {
      return port === APP_PORT ? this.exchangeWebCode(body) : this.exchangeSignIn(body);
    }
    if (method === 'POST' && path === '/graphql') return [200, { data: { organization: null } }];
    const app = /^\/app\/installations\/(\d+)(\/access_tokens)?$/.exec(path);
    if (app !== null) return this.app(method, Number(app[1]), app[2] !== undefined, authorization);
    const person = this.tokens.get(authorization.replace(/^(token|bearer)\s+/i, ''));
    if (person === undefined) return [401, { message: 'Bad credentials' }];
    if (method === 'GET' && path === '/user')
      return [200, { login: person.login, id: person.id, type: 'User' }];
    if (method === 'GET' && path === '/user/emails') {
      return [
        200,
        person.email === undefined ? [] : [{ email: person.email, primary: true, verified: true }],
      ];
    }
    if (method === 'GET' && path === '/user/installations') {
      const mine = [...this.installations.values()].filter((item) => item.admins.includes(person.login));
      return [
        200,
        { total_count: mine.length, installations: mine.map((item) => this.installationView(item)) },
      ];
    }
    if (method === 'GET' && path === '/installation/repositories')
      return this.repositories(person.login, query);
    return [404, { message: 'Not Found' }];
  }

  /** GitHub's consent, given at once as the login prepared: back to the server with a code and its state. */
  private authorize(query: URLSearchParams): Answer {
    const person = this.nextSignIn;
    const back = query.get('redirect_uri');
    if (person === undefined || back === null) return [400, { message: 'no sign-in prepared (signInAs)' }];
    this.nextSignIn = undefined;
    const code = `code_${String(this.serial++)}`;
    this.signInCodes.set(code, { person, challenge: query.get('code_challenge') ?? '' });
    const to = new URL(back);
    to.searchParams.set('code', code);
    to.searchParams.set('state', query.get('state') ?? '');
    return { redirect: to.href };
  }

  /** The sign-in code, once, and with the verifier of its challenge when one was sent. */
  private exchangeSignIn(body: unknown): Answer {
    const code = fieldOf(body, 'code') ?? '';
    const prepared = this.signInCodes.get(code);
    this.signInCodes.delete(code);
    if (prepared === undefined) return [200, { error: 'bad_verification_code' }];
    const verifier = fieldOf(body, 'code_verifier');
    if (
      prepared.challenge !== '' &&
      (verifier === undefined || challengeOf(verifier) !== prepared.challenge)
    ) {
      return [200, { error: 'bad_verification_code' }];
    }
    return [
      200,
      {
        access_token: this.token('gho', prepared.person),
        token_type: 'bearer',
        scope: 'read:user,user:email',
      },
    ];
  }

  /** The install page: back to the server's callback with the installation prepared, a web code and its state. */
  private installPage(query: URLSearchParams): Answer {
    const prepared = this.nextInstall;
    if (prepared === undefined) return [400, { message: 'no install prepared (installs)' }];
    this.nextInstall = undefined;
    const code = `web_${String(this.serial++)}`;
    this.webCodes.set(code, prepared.login);
    const to = new URL(prepared.callback);
    to.searchParams.set('installation_id', String(prepared.installation));
    to.searchParams.set('setup_action', 'install');
    to.searchParams.set('code', code);
    to.searchParams.set('state', query.get('state') ?? '');
    return { redirect: to.href };
  }

  /** The install's web code, once, with the App's OAuth client: a user token. */
  private exchangeWebCode(body: unknown): Answer {
    if (
      fieldOf(body, 'client_id') !== APP_CLIENT.id ||
      fieldOf(body, 'client_secret') !== APP_CLIENT.secret
    ) {
      return [200, { error: 'incorrect_client_credentials' }];
    }
    const code = fieldOf(body, 'code') ?? '';
    const login = this.webCodes.get(code);
    this.webCodes.delete(code);
    if (login === undefined) return [200, { error: 'bad_verification_code' }];
    const person = { login, id: this.idOf(login), email: undefined };
    return [200, { access_token: this.token('ghu', person), token_type: 'bearer', scope: '' }];
  }

  /** The App's own calls, with its JWT: an installation, and a token to act on its repositories. */
  private app(method: string, id: number, wantsToken: boolean, authorization: string): Answer {
    if (!/^bearer ey/i.test(authorization))
      return [401, { message: 'A JSON web token could not be decoded' }];
    const installation = this.installations.get(id);
    if (installation === undefined) return [404, { message: 'Not Found' }];
    if (!wantsToken)
      return method === 'GET' ? [200, this.installationView(installation)] : [404, { message: 'Not Found' }];
    if (method !== 'POST') return [404, { message: 'Not Found' }];
    const bot = {
      login: `installation-${String(id)}`,
      id: this.idOf(`installation-${String(id)}`),
      email: undefined,
    };
    const expires = new Date(Date.now() + 3_600_000).toISOString().replace(/\.\d+Z$/, 'Z');
    return [201, { token: this.token('ghs', bot), expires_at: expires }];
  }

  private installationView(installation: FakeInstallation): unknown {
    return { id: installation.id, account: { login: installation.account, type: 'Organization' } };
  }

  /** `GET /installation/repositories`, with an installation's token: its repositories, a page at a time. */
  private repositories(bot: string, query: URLSearchParams): Answer {
    const id = /^installation-(\d+)$/.exec(bot)?.[1];
    const installation = id === undefined ? undefined : this.installations.get(Number(id));
    if (installation === undefined) return [403, { message: 'Resource not accessible by integration' }];
    const perPage = Math.min(Number(query.get('per_page') ?? '30'), 100);
    const page = Number(query.get('page') ?? '1');
    const repos = installation.repos.slice((page - 1) * perPage, page * perPage).map((name, index) => ({
      id: installation.id * 1000 + index,
      name,
      full_name: `${installation.account}/${name}`,
      description: `The ${name} repository`,
      language: 'TypeScript',
      default_branch: 'main',
      archived: false,
      pushed_at: '2026-11-02T10:00:00Z',
      private: true,
    }));
    return [200, { total_count: installation.repos.length, repositories: repos }];
  }
}
