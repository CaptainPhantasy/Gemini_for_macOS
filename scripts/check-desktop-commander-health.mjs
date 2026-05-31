#!/usr/bin/env node
import { execFile } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const LABEL = 'com.floydslabs.gemini.desktop-commander-mcp';
const PORT = 13001;
const HOST = '127.0.0.1';
const BASE_URL = `http://${HOST}:${PORT}`;
const STATUS_PATH = '/tmp/gemini-desktop-commander-health.json';
const LOG_DIR = '/tmp/gemini-desktop-commander-health';
const WARN_RSS_MIB = 1100;
const RESTART_RSS_MIB = 1500;
const REQUEST_TIMEOUT_MS = 5000;

function nowIso() {
  return new Date().toISOString();
}

function withTimeout(promise, timeoutMs, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function checkTcp() {
  return withTimeout(new Promise((resolve, reject) => {
    const socket = net.connect(PORT, HOST);
    socket.once('connect', () => {
      socket.end();
      resolve({ ok: true });
    });
    socket.once('error', (error) => reject(error));
  }), REQUEST_TIMEOUT_MS, 'tcp check');
}

async function fetchJson(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    const text = await response.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }
    return { response, text, json };
  } finally {
    clearTimeout(timer);
  }
}

async function checkHealthEndpoint() {
  const { response, text, json } = await fetchJson(`${BASE_URL}/api/health`);
  if (!response.ok) throw new Error(`/api/health returned HTTP ${response.status}: ${text.slice(0, 200)}`);
  return { ok: true, status: response.status, result: json?.result ?? text.slice(0, 200) };
}

async function checkToolsEndpoint() {
  const { response, text, json } = await fetchJson(`${BASE_URL}/api/tools`);
  if (!response.ok) throw new Error(`/api/tools returned HTTP ${response.status}: ${text.slice(0, 200)}`);
  const tools = json?.advanced?.tools ?? [];
  const toolNames = tools.map((tool) => tool?.name).filter(Boolean);
  for (const required of ['read_file', 'write_file', 'list_directory']) {
    if (!toolNames.includes(required)) throw new Error(`/api/tools missing ${required}`);
  }
  return { ok: true, status: response.status, toolCount: toolNames.length, requiredPresent: true };
}

async function checkReadFileExecution() {
  const { response, text, json } = await fetchJson(`${BASE_URL}/api/execute?action=read_file&path=package.json`, { method: 'POST' });
  if (!response.ok) throw new Error(`/api/execute returned HTTP ${response.status}: ${text.slice(0, 200)}`);
  const result = String(json?.result ?? '');
  if (json?.status !== 'success') throw new Error(`/api/execute status was ${json?.status ?? 'missing'}: ${result.slice(0, 200)}`);
  if (!result.includes('gemini-for-macos')) throw new Error('/api/execute read_file did not return package.json content');
  return { ok: true, status: response.status, containsPackageName: true };
}

async function listeningPids() {
  try {
    const { stdout } = await execFileAsync('/usr/sbin/lsof', ['-tiTCP:13001', '-sTCP:LISTEN'], { timeout: REQUEST_TIMEOUT_MS });
    return stdout.split(/\s+/).filter(Boolean).map((value) => Number(value)).filter(Number.isFinite);
  } catch {
    return [];
  }
}

async function processTable() {
  const { stdout } = await execFileAsync('/bin/ps', ['-axo', 'pid=,ppid=,rss=,%mem=,command='], { timeout: REQUEST_TIMEOUT_MS });
  return stdout.split('\n').flatMap((line) => {
    const parts = line.trim().split(/\s+/, 5);
    if (parts.length < 5) return [];
    const [pid, ppid, rss, mem, command] = parts;
    return [{ pid: Number(pid), ppid: Number(ppid), rss: Number(rss), mem: Number(mem), command }];
  }).filter((proc) => Number.isFinite(proc.pid));
}

function collectTree(rootPids, table) {
  const children = new Map();
  for (const proc of table) {
    const list = children.get(proc.ppid) ?? [];
    list.push(proc.pid);
    children.set(proc.ppid, list);
  }
  const seen = new Set();
  const visit = (pid) => {
    if (seen.has(pid)) return;
    seen.add(pid);
    for (const child of children.get(pid) ?? []) visit(child);
  };
  for (const pid of rootPids) visit(pid);
  return table.filter((proc) => seen.has(proc.pid));
}

async function measureMemory() {
  const roots = await listeningPids();
  const table = await processTable();
  const tree = collectTree(roots, table);
  const totalRssMiB = tree.reduce((sum, proc) => sum + proc.rss, 0) / 1024;
  return {
    ok: totalRssMiB < RESTART_RSS_MIB,
    rootPids: roots,
    totalRssMiB: Number(totalRssMiB.toFixed(1)),
    warnThresholdMiB: WARN_RSS_MIB,
    restartThresholdMiB: RESTART_RSS_MIB,
    processes: tree.map((proc) => ({
      pid: proc.pid,
      ppid: proc.ppid,
      rssMiB: Number((proc.rss / 1024).toFixed(1)),
      mem: proc.mem,
      command: proc.command.slice(0, 160),
    })),
  };
}

async function kickstart(reason) {
  const target = `gui/${process.getuid?.() ?? os.userInfo().uid}/${LABEL}`;
  try {
    const { stdout, stderr } = await execFileAsync('/bin/launchctl', ['kickstart', '-k', target], { timeout: 10000 });
    return { ok: true, reason, stdout: stdout.trim(), stderr: stderr.trim() };
  } catch (error) {
    return { ok: false, reason, error: error instanceof Error ? error.message : String(error) };
  }
}

async function writeStatus(status) {
  await mkdir(LOG_DIR, { recursive: true });
  await writeFile(STATUS_PATH, `${JSON.stringify(status, null, 2)}\n`);
  await writeFile(path.join(LOG_DIR, `${Date.now()}.json`), `${JSON.stringify(status, null, 2)}\n`);
}

async function runChecks() {
  const checks = {};
  checks.tcp = await checkTcp();
  checks.health = await checkHealthEndpoint();
  checks.tools = await checkToolsEndpoint();
  checks.readFile = await checkReadFileExecution();
  checks.memory = await measureMemory();
  if (!checks.memory.ok) {
    throw new Error(`MCP process tree RSS ${checks.memory.totalRssMiB}MiB exceeded ${RESTART_RSS_MIB}MiB`);
  }
  return checks;
}

async function waitForRecovery(timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      return await runChecks();
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
  throw lastError ?? new Error('Recovery check timed out');
}

async function main() {
  const startedAt = nowIso();
  let status;
  try {
    const checks = await runChecks();
    status = {
      status: checks.memory.totalRssMiB >= WARN_RSS_MIB ? 'warning' : 'healthy',
      startedAt,
      finishedAt: nowIso(),
      label: LABEL,
      port: PORT,
      checks,
    };
  } catch (error) {
    const restart = await kickstart(error instanceof Error ? error.message : String(error));
    let postRestart = null;
    try {
      postRestart = await waitForRecovery();
    } catch (postError) {
      postRestart = { error: postError instanceof Error ? postError.message : String(postError) };
    }
    status = {
      status: postRestart && !postRestart.error ? 'recovered' : 'unhealthy',
      startedAt,
      finishedAt: nowIso(),
      label: LABEL,
      port: PORT,
      error: error instanceof Error ? error.message : String(error),
      restart,
      postRestart,
    };
  }

  await writeStatus(status);
  console.log(JSON.stringify(status));
  if (status.status === 'unhealthy') process.exit(1);
}

main().catch(async (error) => {
  const status = {
    status: 'unhealthy',
    startedAt: nowIso(),
    finishedAt: nowIso(),
    label: LABEL,
    port: PORT,
    fatal: error instanceof Error ? error.message : String(error),
  };
  await writeStatus(status).catch(() => {});
  console.error(JSON.stringify(status));
  process.exit(1);
});
