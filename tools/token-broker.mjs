#!/usr/bin/env node
/**
 * Solution Studio local token broker.
 *
 * Lets the static Solution Studio page call Power Platform and Dataverse on
 * your behalf without an Entra app registration. It reuses the Azure CLI
 * session you already have:
 *
 *   az login
 *   node tools/token-broker.mjs
 *
 * The broker binds to 127.0.0.1 only, requires a random key on every request,
 * allowlists the browser origins and API resources it will serve, and keeps
 * tokens in memory. Nothing is written to disk.
 *
 * This is a development helper, not a production service. Stop it with Ctrl+C.
 */

import { createServer } from 'node:http'
import { spawn } from 'node:child_process'
import { randomBytes, timingSafeEqual } from 'node:crypto'
import process from 'node:process'

const SERVICE = 'solution-studio-token-broker'
const VERSION = 1
const HOST = '127.0.0.1'
const DEFAULT_PORT = 4319
const AZ_TIMEOUT_MS = 45_000
const CACHE_SKEW_MS = 5 * 60_000

/** APIs the page is allowed to request. Dataverse orgs are matched separately. */
const STATIC_RESOURCES = new Set([
  'https://api.powerplatform.com',
  'https://service.powerapps.com',
  'https://api.bap.microsoft.com',
])

/** A Dataverse org host, for example org.crm9.dynamics.com. */
const DATAVERSE_HOST = /^[a-z0-9-]+(\.[a-z0-9-]+)*\.crm\d*\.dynamics\.com$/i

const LOOPBACK_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i

function parseArgs(argv) {
  const options = {
    port: Number(process.env.PORT) || DEFAULT_PORT,
    key: process.env.BROKER_KEY || '',
    origins: (process.env.BROKER_ORIGINS || '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean),
    help: false,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--help' || arg === '-h') {
      options.help = true
    } else if (arg === '--port') {
      options.port = Number(argv[index + 1])
      index += 1
    } else if (arg.startsWith('--port=')) {
      options.port = Number(arg.slice('--port='.length))
    } else if (arg === '--key') {
      options.key = argv[index + 1] || ''
      index += 1
    } else if (arg.startsWith('--key=')) {
      options.key = arg.slice('--key='.length)
    } else if (arg === '--origin') {
      options.origins.push(argv[index + 1] || '')
      index += 1
    } else if (arg.startsWith('--origin=')) {
      options.origins.push(arg.slice('--origin='.length))
    } else {
      console.error(`Unknown option: ${arg}`)
      options.help = true
    }
  }

  options.origins = options.origins.filter(Boolean)
  return options
}

function printHelp() {
  console.log(`Solution Studio token broker

Usage:
  node tools/token-broker.mjs [options]

Options:
  --port <number>     Port to bind on 127.0.0.1 (default ${DEFAULT_PORT})
  --key <string>      Reuse a fixed broker key instead of a random one
  --origin <url>      Extra browser origin to allow (repeatable)
  -h, --help          Show this help

Environment variables:
  PORT, BROKER_KEY, BROKER_ORIGINS (comma-separated)

Typical setup:
  az login
  node tools/token-broker.mjs

Then paste the printed URL and key into Solution Studio.
`)
}

function normalizeOrigin(value) {
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return ''
    return url.origin
  } catch {
    return ''
  }
}

function originAllowed(origin, extraOrigins) {
  if (!origin) return false
  if (LOOPBACK_ORIGIN.test(origin)) return true
  const normalized = normalizeOrigin(origin)
  if (!normalized) return false
  if (extraOrigins.some((allowed) => normalizeOrigin(allowed) === normalized)) return true
  // The public GitHub Pages site for this project. Forks can pass --origin.
  return normalized === 'https://acharyanandusaji.github.io'
}

/**
 * Validates and canonicalises an Azure resource URL. Anything outside the
 * allowlist is rejected before a token request is made.
 */
function normalizeResource(value) {
  if (!value) throw new BrokerRequestError(400, 'missing_resource', 'Add a resource query parameter.')
  let url
  try {
    url = new URL(value)
  } catch {
    throw new BrokerRequestError(400, 'invalid_resource', 'The resource must be an absolute URL.')
  }
  if (url.protocol !== 'https:') {
    throw new BrokerRequestError(400, 'invalid_resource', 'Only https resources are allowed.')
  }
  if (url.username || url.password || url.port) {
    throw new BrokerRequestError(400, 'invalid_resource', 'Credentials and ports are not allowed.')
  }
  const path = url.pathname.replace(/\/+$/, '')
  const resource = `${url.protocol}//${url.host.toLowerCase()}${path}`
  if (STATIC_RESOURCES.has(resource)) return resource
  if (DATAVERSE_HOST.test(url.hostname) && !path) return resource
  throw new BrokerRequestError(
    400,
    'resource_not_allowed',
    `The broker will not request a token for ${resource}. Allowed: api.powerplatform.com, service.powerapps.com, api.bap.microsoft.com and Dataverse org URLs.`,
  )
}

class BrokerRequestError extends Error {
  constructor(status, code, message) {
    super(message)
    this.status = status
    this.code = code
  }
}

/**
 * Windows ships `az` as a .cmd shim, which cannot be spawned directly. Run it
 * through cmd.exe with explicit quoting instead of `shell: true`, so Node does
 * not warn about unescaped arguments.
 */
function quoteCmdArg(value) {
  if (!/[\s"&|<>^]/.test(value)) return value
  return `"${value.replace(/"/g, '""')}"`
}

function azInvocation(args) {
  if (process.platform !== 'win32') return { command: 'az', args }
  const line = ['az', ...args].map(quoteCmdArg).join(' ')
  return { command: process.env.ComSpec || 'cmd.exe', args: ['/d', '/s', '/c', line] }
}

function runAz(args) {
  return new Promise((resolve, reject) => {
    const { command, args: commandArgs } = azInvocation(args)
    let child
    try {
      child = spawn(command, commandArgs, {
        windowsHide: true,
        env: process.env,
      })
    } catch (error) {
      reject(new BrokerRequestError(503, 'az_not_found', `Could not start the Azure CLI: ${error.message}`))
      return
    }

    let stdout = ''
    let stderr = ''
    let settled = false
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      child.kill()
      reject(new BrokerRequestError(504, 'az_timeout', 'The Azure CLI did not respond in time. Run az login and retry.'))
    }, AZ_TIMEOUT_MS)

    child.stdout?.on('data', (chunk) => {
      stdout += chunk.toString()
    })
    child.stderr?.on('data', (chunk) => {
      stderr += chunk.toString()
    })
    child.on('error', (error) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      const code = error && error.code === 'ENOENT' ? 'az_not_found' : 'az_failed'
      reject(
        new BrokerRequestError(
          503,
          code,
          code === 'az_not_found'
            ? 'Azure CLI (az) is not installed or not on PATH. Install it from https://aka.ms/installazurecliwindows.'
            : `Could not run the Azure CLI: ${error.message}`,
        ),
      )
    })
    child.on('close', (exitCode) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      if (exitCode === 0) {
        resolve(stdout)
        return
      }
      const detail = stderr.trim() || stdout.trim() || `az exited with code ${exitCode}`
      const needsLogin = /az login|not logged in|no subscription|AADSTS\d+/i.test(detail)
      reject(
        new BrokerRequestError(
          needsLogin ? 401 : 502,
          needsLogin ? 'az_login_required' : 'az_failed',
          needsLogin
            ? `Azure CLI is not signed in. Run "az login" in a terminal, then retry. (${detail.slice(0, 240)})`
            : `Azure CLI failed: ${detail.slice(0, 400)}`,
        ),
      )
    })
  })
}

async function runAzJson(args) {
  const stdout = await runAz([...args, '--output', 'json'])
  try {
    return JSON.parse(stdout)
  } catch {
    throw new BrokerRequestError(502, 'az_invalid_output', 'Azure CLI returned output that is not valid JSON.')
  }
}

function tokenExpiryMs(payload) {
  const epoch = Number(payload?.expires_on ?? payload?.expiresOnEpoch ?? Number.NaN)
  if (Number.isFinite(epoch) && epoch > 0) return epoch < 1e12 ? epoch * 1000 : epoch
  const text = payload?.expiresOn
  if (typeof text === 'string' && text.trim()) {
    const normalized = text.includes('T') ? text : text.replace(' ', 'T')
    const parsed = Date.parse(normalized)
    if (!Number.isNaN(parsed)) return parsed
  }
  return Date.now() + 30 * 60_000
}

/** resource -> { accessToken, expiresOn, expiresAt } */
const tokenCache = new Map()

async function getToken(resource) {
  const cached = tokenCache.get(resource)
  if (cached && cached.expiresAt - CACHE_SKEW_MS > Date.now()) {
    return { ...cached, cached: true }
  }

  const payload = await runAzJson(['account', 'get-access-token', '--resource', resource])
  const accessToken = typeof payload?.accessToken === 'string' ? payload.accessToken : ''
  if (!accessToken) {
    throw new BrokerRequestError(502, 'az_empty_token', 'Azure CLI returned no access token.')
  }
  const entry = {
    accessToken,
    expiresOn: typeof payload.expiresOn === 'string' ? payload.expiresOn : undefined,
    expiresAt: tokenExpiryMs(payload),
  }
  tokenCache.set(resource, entry)
  return { ...entry, cached: false }
}

async function getAccount() {
  const payload = await runAzJson(['account', 'show'])
  const user = payload?.user && typeof payload.user === 'object' ? payload.user : {}
  return {
    name: typeof user.name === 'string' ? user.name : '',
    username: typeof user.name === 'string' ? user.name : '',
    tenantId: typeof payload?.tenantId === 'string' ? payload.tenantId : '',
    userType: typeof user.type === 'string' ? user.type : '',
  }
}

function safeEqual(left, right) {
  const a = Buffer.from(left)
  const b = Buffer.from(right)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

function sendJson(response, status, body, origin, extraHeaders = {}) {
  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...extraHeaders,
  }
  if (origin) {
    headers['Access-Control-Allow-Origin'] = origin
    headers['Access-Control-Allow-Methods'] = 'GET, OPTIONS'
    headers['Access-Control-Allow-Headers'] = 'X-Broker-Key, Content-Type'
    headers['Access-Control-Max-Age'] = '600'
    headers.Vary = 'Origin'
  }
  response.writeHead(status, headers)
  if (status === 204) {
    response.end()
    return
  }
  response.end(JSON.stringify(body))
}

function errorBody(error) {
  const status = error instanceof BrokerRequestError ? error.status : 500
  const code = error instanceof BrokerRequestError ? error.code : 'internal_error'
  const message =
    error instanceof BrokerRequestError
      ? error.message
      : `Unexpected broker error: ${error instanceof Error ? error.message : String(error)}`
  return { status, body: { error: { code, message } } }
}

function createBroker(options) {
  const brokerKey = options.key || randomBytes(24).toString('base64url')
  if (brokerKey.length < 16) {
    console.error('The broker key must be at least 16 characters. Use --key or leave it unset for a random key.')
    process.exit(1)
  }

  const server = createServer(async (request, response) => {
    const origin = request.headers.origin || ''
    const allowedOrigin = originAllowed(origin, options.origins) ? origin : ''

    if (request.method === 'OPTIONS') {
      if (!allowedOrigin) {
        sendJson(response, 403, { error: { code: 'origin_not_allowed', message: 'This origin is not allowed to use the broker.' } })
        return
      }
      sendJson(response, 204, {}, allowedOrigin)
      return
    }

    if (request.method !== 'GET') {
      sendJson(response, 405, { error: { code: 'method_not_allowed', message: 'Use GET.' } }, allowedOrigin)
      return
    }

    if (origin && !allowedOrigin) {
      console.warn(`[origin] blocked ${origin}. Restart the broker with: --origin ${origin}`)
      sendJson(response, 403, { error: { code: 'origin_not_allowed', message: `Origin ${origin} is not allowed. Restart the broker with --origin ${origin}` } })
      return
    }

    const suppliedKey = request.headers['x-broker-key']
    if (typeof suppliedKey !== 'string' || !safeEqual(suppliedKey, brokerKey)) {
      sendJson(response, 401, { error: { code: 'invalid_key', message: 'Missing or invalid broker key. Copy the key printed by the broker.' } }, allowedOrigin)
      return
    }

    let url
    try {
      url = new URL(request.url || '/', `http://${HOST}:${options.port}`)
    } catch {
      sendJson(response, 400, { error: { code: 'bad_request', message: 'Malformed request URL.' } }, allowedOrigin)
      return
    }

    try {
      if (url.pathname === '/health') {
        sendJson(response, 200, { ok: true, service: SERVICE, version: VERSION }, allowedOrigin)
        return
      }

      if (url.pathname === '/account') {
        const account = await getAccount()
        sendJson(response, 200, { account }, allowedOrigin)
        return
      }

      if (url.pathname === '/token') {
        const resource = normalizeResource(url.searchParams.get('resource'))
        const token = await getToken(resource)
        console.log(`[token] ${resource} ${token.cached ? '(cached)' : '(fresh)'}`)
        sendJson(
          response,
          200,
          {
            accessToken: token.accessToken,
            expiresOn: token.expiresOn,
            resource,
            cached: token.cached,
          },
          allowedOrigin,
        )
        return
      }

      sendJson(response, 404, { error: { code: 'not_found', message: `Unknown endpoint ${url.pathname}` } }, allowedOrigin)
    } catch (error) {
      const { status, body } = errorBody(error)
      if (status >= 500) console.error(`[error] ${body.error.message}`)
      sendJson(response, status, body, allowedOrigin)
    }
  })

  server.on('error', (error) => {
    if (error && error.code === 'EADDRINUSE') {
      console.error(`Port ${options.port} is already in use. Try: node tools/token-broker.mjs --port ${options.port + 1}`)
    } else {
      console.error(`Broker failed: ${error.message}`)
    }
    process.exit(1)
  })

  return { server, brokerKey }
}

function main() {
  const options = parseArgs(process.argv.slice(2))
  if (options.help) {
    printHelp()
    return
  }
  if (!Number.isInteger(options.port) || options.port < 1 || options.port > 65535) {
    console.error('The port must be an integer between 1 and 65535.')
    process.exit(1)
  }

  const { server, brokerKey } = createBroker(options)
  server.listen(options.port, HOST, () => {
    const brokerUrl = `http://${HOST}:${options.port}`
    console.log('')
    console.log('  Solution Studio token broker')
    console.log('  -----------------------------')
    console.log(`  Broker URL: ${brokerUrl}`)
    console.log(`  Broker key: ${brokerKey}`)
    console.log('')
    console.log('  Paste both values into Solution Studio → Microsoft account → Local token broker.')
    console.log('  Uses your existing Azure CLI session (az login). Tokens stay in memory.')
    console.log('  Press Ctrl+C to stop.')
    console.log('')
  })

  const shutdown = () => {
    console.log('\nStopping broker…')
    server.close(() => process.exit(0))
    setTimeout(() => process.exit(0), 2000).unref()
  }
  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}

main()
