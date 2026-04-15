import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import startHandler from './dist/server/server.js'

const app = new Hono()

app.all('*', (c) => startHandler.fetch(c.req.raw))

const port = Number(process.env.PORT ?? 3000)

serve({ fetch: app.fetch, port }, ({ address, port }) => {
  console.log(`branchline listening on http://${address}:${port}`)
})
