// SPDX-License-Identifier: Apache-2.0
// Registered runners on the job's Docker, for line 6.2 against a server whose cloud sessions run on registered runners
// (`OSTROM_RUNNERS_DRIVER=registered`, ostrom-server console-journey.yml). Each machine is `ostrom-runner machine`, in
// its own container on the host network, with the Engine API of the job's socket proxy: it takes the sessions the
// server hands its organization's runners. Without `OSTROM_E2E_MACHINE_IMAGE`, the server runs sessions on its own
// Docker driver and no machine is needed.
import { execFileSync, spawnSync } from 'node:child_process';
import { expect, test, type Page } from '@playwright/test';
import { z } from 'zod';
import { callFromPage } from './real';

/** The runner image the machines run (by digest), set when the server hands sessions to registered runners. */
export const machineImage = process.env['OSTROM_E2E_MACHINE_IMAGE'];

const SERVER_URL = process.env['OSTROM_E2E_MACHINE_SERVER_URL'] ?? 'http://127.0.0.1:4600';
const DOCKER_API_URL = process.env['OSTROM_E2E_MACHINE_DOCKER_API'] ?? 'http://127.0.0.1:2375';
const RUNNER_LABEL = 'ostrom.run/runner';

const zRegistered = z.object({ id: z.string(), token: z.string() });

/** A registered runner and the container of its machine. */
export interface Machine {
  id: string;
  container: string;
}

const started: Machine[] = [];

function docker(...args: string[]): string {
  return execFileSync('docker', args, { encoding: 'utf8' }).trim();
}

/**
 * Registers a runner in `org` (the CLI's `POST /runners`, played through the owner's session) and starts its machine.
 * The key goes to the container through the docker CLI's environment, never on a command line.
 */
export async function startMachine(page: Page, org: string, name: string): Promise<Machine> {
  if (machineImage === undefined) throw new Error('OSTROM_E2E_MACHINE_IMAGE is not set');
  const registered = await callFromPage(page, 'POST', '/api/v1/runners', { name, labels: ['docker'] }, org);
  expect(registered.status, JSON.stringify(registered.body)).toBe(201);
  const { id, token } = zRegistered.parse(registered.body);
  const container = `ostrom-machine-${id.slice(0, 8)}`;
  execFileSync(
    'docker',
    [
      'run',
      '-d',
      '--name',
      container,
      '--network',
      'host',
      '-e',
      `OSTROM_SERVER_URL=${SERVER_URL}`,
      '-e',
      `OSTROM_RUNNER_ID=${id}`,
      '-e',
      'OSTROM_RUNNER_KEY',
      '-e',
      'OSTROM_RUNNER_INTERVAL_SECONDS=5',
      '-e',
      `OSTROM_DOCKER_API_URL=${DOCKER_API_URL}`,
      '-e',
      `OSTROM_RUNNER_SESSION_IMAGE=${machineImage}`,
      machineImage,
      'machine',
    ],
    { encoding: 'utf8', env: { ...process.env, OSTROM_RUNNER_KEY: token } },
  );
  const machine = { id, container };
  started.push(machine);
  return machine;
}

/** Waits until the organization's API lists every one of `machines` online. */
export async function online(page: Page, org: string, machines: Machine[]): Promise<void> {
  await expect
    .poll(
      async () => {
        const listed = await callFromPage(page, 'GET', '/api/v1/runners', undefined, org);
        const items = z
          .object({ items: z.array(z.object({ id: z.string(), status: z.string() })) })
          .parse(listed.body).items;
        return machines.every((machine) =>
          items.some((item) => item.id === machine.id && item.status === 'online'),
        );
      },
      { timeout: 60_000, intervals: [2_000] },
    )
    .toBe(true);
}

/** The runner whose machine holds a session's containers, or undefined when none does. */
export function holder(sessionId: string): string | undefined {
  const hex = sessionId.replaceAll('-', '');
  const runners = docker(
    'ps',
    '--filter',
    `label=ostrom.run/session=${hex}`,
    '--format',
    `{{.Label "${RUNNER_LABEL}"}}`,
  )
    .split('\n')
    .filter((line) => line !== '');
  return runners[0];
}

/**
 * The machine is lost with everything on it: its own process, the session containers it started and their volumes.
 * The server sees it silent; nothing on it answers again.
 */
export function lose(machine: Machine): void {
  docker('rm', '-f', machine.container);
  const containers = docker('ps', '-aq', '--filter', `label=${RUNNER_LABEL}=${machine.id}`).split('\n');
  for (const container of containers.filter((line) => line !== '')) docker('rm', '-f', container);
  const volumes = docker('volume', 'ls', '-q', '--filter', `label=${RUNNER_LABEL}=${machine.id}`).split('\n');
  for (const volume of volumes.filter((line) => line !== '')) docker('volume', 'rm', '-f', volume);
}

/** Attaches the machines' logs to the test, then removes them and what they left: called after each test. */
export async function removeMachines(): Promise<void> {
  for (const machine of started.splice(0)) {
    // The runner logs on stderr; a machine the test lost has none left.
    const read = spawnSync('docker', ['logs', '--tail', '80', machine.container], { encoding: 'utf8' });
    const logs = read.status === 0 ? `${read.stdout}${read.stderr}` : 'lost by the test';
    await test.info().attach(machine.container, { body: logs, contentType: 'text/plain' });
    lose(machine);
  }
}
