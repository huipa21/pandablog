import { PassThrough } from 'node:stream'
import { readFile } from 'node:fs/promises'
import { createServer, request as httpsRequest } from 'node:https'
import type { TLSSocket } from 'node:tls'
import type { ClientRequest, IncomingMessage, RequestOptions } from 'node:http'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { isPrivateIp } from '../../server/utils/net/private-ip'
import { safeOutboundRequest, type OutboundConnector } from '../../server/utils/net/outbound'

afterEach(() => vi.restoreAllMocks())

const publicResolver = async () => [{ address: '93.184.216.34' }]
function connector(status = 200, headers = {}, body = ['fixture']) {
  const responses: PassThrough[] = []
  const options: RequestOptions[] = []
  const connect: OutboundConnector = (opts, callback) => {
    options.push(opts)
    const req = new PassThrough() as unknown as ClientRequest
    req.setTimeout = (() => req) as ClientRequest['setTimeout']
    req.end = (() => {
      queueMicrotask(() => {
        const response = new PassThrough() as PassThrough & IncomingMessage
        response.statusCode = status
        response.headers = headers
        responses.push(response)
        callback(response)
        if (body.length) response.end(body.join(''))
      })
      return req
    }) as ClientRequest['end']
    return req
  }
  return { connect, responses, options }
}

describe('shared outbound policy (no real destination probes)', () => {
  it.each(['::ffff:127.0.0.1', '::ffff:7f00:1', '::ffff:a9fe:a9fe', 'fe80::1', 'fe90::1', 'febf:ffff::1', 'fc00::1', 'fdff::1', 'ff02::1', '::', '::1', '100.64.0.1', '100.127.255.255', '192.0.0.1', '198.19.255.255', '203.0.113.1', '2001:db8::1', '2002:7f00:1::1', 'invalid', 'fe80::1%eth0'])('denies %s', ip => expect(isPrivateIp(ip)).toBe(true))
  it.each(['8.8.8.8', '93.184.216.34', '2001:4860:4860::8888', '2606:4700:4700::1111', '::ffff:0808:0808'])('allows global %s', ip => expect(isPrivateIp(ip)).toBe(false))
  it.each(['http://[::ffff:127.0.0.1]/', 'http://[::ffff:169.254.169.254]/', 'http://[fe90::1]/', 'http://2130706433/', 'http://0x7f000001/', 'http://localhost./', 'http://admin:secret@example.com/', 'ftp://example.com/', 'http://service.local/'])('rejects %s before connecting', async (url) => {
    const connect = vi.fn()
    await expect(safeOutboundRequest(url, {}, { connect, resolve: publicResolver })).rejects.toThrow()
    expect(connect).not.toHaveBeenCalled()
  })
  it('rejects mixed DNS answers before connecting', async () => {
    const connect = vi.fn()
    await expect(safeOutboundRequest('https://example.com/', {}, { connect, resolve: async () => [{address: '8.8.8.8'}, {address: '127.0.0.1'}] })).rejects.toThrow()
    expect(connect).not.toHaveBeenCalled()
  })
  it('pins exactly one lookup and retains Host/TLS identity; no per-host agent cache', async () => {
    const fake = connector()
    const resolve = vi.fn().mockResolvedValueOnce([{address: '93.184.216.34'}]).mockResolvedValue([{address: '127.0.0.1'}])
    const result = await safeOutboundRequest('https://example.com:8443/a?b=1', {}, { connect: fake.connect, resolve })
    expect(result.body.toString()).toBe('fixture')
    expect(resolve).toHaveBeenCalledTimes(1)
    expect(fake.options[0]).toMatchObject({ hostname: '93.184.216.34', port: 8443, servername: 'example.com', agent: false, rejectUnauthorized: true, headers: { Host: 'example.com:8443' } })
    expect(fake.responses[0]?.destroyed).toBe(true)
  })
  it('destroys redirects and validates each hop', async () => {
    const fake = connector(302, {location: 'http://127.0.0.1/private'}, [])
    await expect(safeOutboundRequest('http://example.com/', {maxRedirects: 3}, {connect: fake.connect, resolve: publicResolver})).rejects.toThrow()
    expect(fake.options).toHaveLength(1)
    expect(fake.responses[0]?.destroyed).toBe(true)
  })
  it('webhook status-only mode disposes an endless response without buffering', async () => {
    const fake = connector(200, {}, [])
    const result = await safeOutboundRequest('https://example.com/', {method: 'POST', body: '{}', statusOnly: true}, {connect: fake.connect, resolve: publicResolver})
    expect(result.body).toHaveLength(0)
    expect(fake.responses[0]?.destroyed).toBe(true)
  })
  it('bounds actual body bytes and cleans oversized responses', async () => {
    const fake = connector(200, {}, ['x'.repeat(20)])
    await expect(safeOutboundRequest('http://example.com/', {maxBytes: 10}, {connect: fake.connect, resolve: publicResolver})).rejects.toThrow(/large/)
    expect(fake.responses[0]?.destroyed).toBe(true)
  })
  it('synchronously caps concurrent outbound work without a waiting queue', async () => {
    const fake = connector(200, {}, [])
    const controllers = Array.from({length: 4}, () => new AbortController())
    const results = controllers.map(controller => safeOutboundRequest('http://example.com/', {signal: controller.signal}, {connect: fake.connect, resolve: publicResolver}).catch(error => error))
    await expect(safeOutboundRequest('http://example.com/', {}, {connect: fake.connect, resolve: publicResolver})).rejects.toThrow(/capacity/)
    controllers.forEach(controller => controller.abort())
    await Promise.all(results)
    await expect(safeOutboundRequest('http://example.com/', {}, {connect: connector().connect, resolve: publicResolver})).resolves.toHaveProperty('status', 200)
  })
  it('overall deadline covers stalled DNS; never connects later', async () => {
    const connect = vi.fn()
    await expect(safeOutboundRequest('http://example.com/', {timeoutMs: 20}, {connect, resolve: () => new Promise(() => {})})).rejects.toThrow(/deadline/)
    expect(connect).not.toHaveBeenCalled()
  })
  it('overall deadline terminates an active response even without inactivity', async () => {
    const fake = connector(200, {}, [])
    const pending = safeOutboundRequest('http://example.com/', {timeoutMs: 30}, {connect: fake.connect, resolve: publicResolver})
    const timer = setInterval(() => fake.responses[0]?.write('x'), 5)
    try { await expect(pending).rejects.toThrow(/deadline/) } finally { clearInterval(timer) }
    expect(fake.responses[0]?.destroyed).toBe(true)
  })
  it('real loopback-only HTTPS fixture verifies original Host/SNI and rejects bad certificates/names', async () => {
    const cert = await readFile('tests/fixtures/outbound/cert.pem')
    const key = await readFile('tests/fixtures/outbound/key.pem') // public test-only key
    const observed: Array<{host: string | undefined, sni: string | false}> = []
    const server = createServer({cert, key}, (req, res) => {
      observed.push({host: req.headers.host, sni: (req.socket as TLSSocket & {servername: string | false}).servername})
      res.end('two fixture bytes')
    })
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    const port = (server.address() as {port: number}).port
    const connect: OutboundConnector = (options, callback) => httpsRequest({...options, hostname: '127.0.0.1', port, ca: cert}, callback)
    try {
      const result = await safeOutboundRequest('https://example.com:8443/', {}, {resolve: publicResolver, connect})
      expect(result.body.toString()).toBe('two fixture bytes')
      expect(observed).toEqual([{host: 'example.com:8443', sni: 'example.com'}])
      await expect(safeOutboundRequest('https://wrong.example.com/', {}, {resolve: publicResolver, connect})).rejects.toThrow(/altname|certificate/i)
      const untrusted: OutboundConnector = (options, callback) => httpsRequest({...options, hostname: '127.0.0.1', port}, callback)
      await expect(safeOutboundRequest('https://example.com/', {}, {resolve: publicResolver, connect: untrusted})).rejects.toThrow(/certificate/i)
    } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())) }
  })
  it('abort destroys request/response and rejects once', async () => {
    const fake = connector(200, {}, [])
    const controller = new AbortController()
    const pending = safeOutboundRequest('http://example.com/', {signal: controller.signal}, {connect: fake.connect, resolve: publicResolver})
    setTimeout(() => controller.abort(), 5)
    await expect(pending).rejects.toThrow(/abort/i)
    expect(fake.responses[0]?.destroyed).toBe(true)
  })
})
