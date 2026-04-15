import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { Hono } from 'hono'
import startHandler from './dist/server/server.js'

const app = new Hono()

app.use('/*', serveStatic({ root: './dist/client' }))
app.all('*', (c) => startHandler.fetch(c.req.raw))

const port = Number(process.env.PORT ?? 3000)

serve({ fetch: app.fetch, port }, ({ address, port }) => {
  console.log(`branchline listening on http://${address}:${port}`)
})
