// Dev-only seeder. Generates a synthetic story tree with lorem ipsum
// content for testing the AppView at scale. Reset-and-reseed; see docker/seed.sh.
//
// Required env:
//   DEMO_DID, FRIEND_DID         - DIDs of the two seeded PDS accounts
//   DEMO_HANDLE, FRIEND_HANDLE   - handles of the two seeded PDS accounts
//   DATABASE_URL                 - branchline postgres
// Optional env (defaults in parens):
//   SEED_ROOTS=5           number of independent root stories
//   SEED_TOTAL=1000        total bud count across all trees
//   SEED_MAX_DEPTH=20      maximum tree depth (each tree gets a guaranteed
//                          spine of this length so the cap is actually hit)
//   SEED_POLLEN_RATE=0.25  fraction of buds that get a pollen grain
//   SEED_RNG_SEED=42       faker seed for reproducible runs

import { faker } from '@faker-js/faker'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../src/generated/prisma/client.ts'

const DEMO_DID = process.env.DEMO_DID
const FRIEND_DID = process.env.FRIEND_DID
const DEMO_HANDLE = process.env.DEMO_HANDLE
const FRIEND_HANDLE = process.env.FRIEND_HANDLE
if (!DEMO_DID || !FRIEND_DID || !DEMO_HANDLE || !FRIEND_HANDLE) {
  console.error(
    'DEMO_DID, FRIEND_DID, DEMO_HANDLE, FRIEND_HANDLE env vars are required',
  )
  process.exit(1)
}

const ROOTS = Number(process.env.SEED_ROOTS ?? 5)
const TOTAL = Number(process.env.SEED_TOTAL ?? 1000)
const MAX_DEPTH = Number(process.env.SEED_MAX_DEPTH ?? 20)
const POLLEN_RATE = Number(process.env.SEED_POLLEN_RATE ?? 0.25)
const RNG_SEED = Number(process.env.SEED_RNG_SEED ?? 42)

faker.seed(RNG_SEED)

const AUTHORS = [DEMO_DID, FRIEND_DID]

type BudRow = {
  uri: string
  cid: string
  authorDid: string
  rootUri: string
  parentUri: string | null
  parentCid: string | null
  seedUri: string
  seedCid: string
  depth: number
  title: string
  text: string
  pathUris: string[]
  createdAt: Date
}

type SeedRow = {
  uri: string
  cid: string
  authorDid: string
  granteeDid: string
  grantorUri: string | null
  chainUris: string[]
  expiresAt: Date | null
  createdAt: Date
}

type PollenRow = {
  uri: string
  authorDid: string
  subjectUri: string
  subjectCid: string
  createdAt: Date
}

let rkeyCounter = 0
const rkey = () => {
  // Real atproto rkeys are 13-char base32 TIDs. Shape-only fake — we just
  // need uniqueness within (did, collection).
  return (rkeyCounter++).toString(32).padStart(13, '0')
}

const cid = () =>
  'bafyrei' + faker.string.alphanumeric({ length: 52, casing: 'lower' })

const pickAuthor = () => faker.helpers.arrayElement(AUTHORS)

const fakeTitle = () =>
  faker.lorem.sentence({ min: 3, max: 8 }).replace(/\.$/, '')
const fakeText = () => faker.lorem.paragraphs({ min: 1, max: 4 }, '\n\n')

const startTime = new Date('2026-04-01T00:00:00Z').getTime()
let timeCursor = startTime
const nextDate = () => {
  timeCursor += faker.number.int({ min: 60_000, max: 600_000 })
  return new Date(timeCursor)
}

const buds: BudRow[] = []
const seeds: SeedRow[] = []
const pollenGrains: PollenRow[] = []

function makeSeedFor(did: string, now: Date): SeedRow {
  const uri = `at://${did}/ink.branchline.seed/${rkey()}`
  const row: SeedRow = {
    uri,
    cid: cid(),
    authorDid: did,
    granteeDid: did,
    grantorUri: null,
    chainUris: [uri],
    expiresAt: null,
    createdAt: now,
  }
  seeds.push(row)
  return row
}

function makeBud(parent: BudRow | null): BudRow {
  const did = pickAuthor()
  const uri = `at://${did}/ink.branchline.bud/${rkey()}`
  const c = cid()
  const depth = parent ? parent.depth + 1 : 0
  const rootUri = parent ? parent.rootUri : uri
  const pathUris = parent ? [...parent.pathUris, uri] : [uri]
  const createdAt = nextDate()
  const seed = parent
    ? { uri: parent.seedUri, cid: parent.seedCid }
    : (() => {
        const s = makeSeedFor(did, createdAt)
        return { uri: s.uri, cid: s.cid }
      })()

  const row: BudRow = {
    uri,
    cid: c,
    authorDid: did,
    rootUri,
    parentUri: parent?.uri ?? null,
    parentCid: parent?.cid ?? null,
    seedUri: seed.uri,
    seedCid: seed.cid,
    depth,
    title: fakeTitle(),
    text: fakeText(),
    pathUris,
    createdAt,
  }
  buds.push(row)

  if (faker.number.float({ min: 0, max: 1 }) < POLLEN_RATE) {
    const pollenAuthor = pickAuthor()
    pollenGrains.push({
      uri: `at://${pollenAuthor}/ink.branchline.pollen/${rkey()}`,
      authorDid: pollenAuthor,
      subjectUri: uri,
      subjectCid: c,
      createdAt: nextDate(),
    })
  }

  return row
}

// Build ROOTS independent trees. Each tree gets a guaranteed root-to-MAX_DEPTH
// spine first so deep-path code paths are actually exercised — random parent
// selection alone almost never reaches the cap. Remaining budget is then
// scattered across random parents to give each tree some organic width.
if (TOTAL < ROOTS * (MAX_DEPTH + 1)) {
  console.error(
    `SEED_TOTAL=${TOTAL} too small to fit ${ROOTS} spines of length ${MAX_DEPTH + 1}; need at least ${ROOTS * (MAX_DEPTH + 1)}`,
  )
  process.exit(1)
}

const trees: BudRow[][] = []
for (let r = 0; r < ROOTS; r++) {
  const tree: BudRow[] = []
  let parent: BudRow | null = null
  for (let d = 0; d <= MAX_DEPTH; d++) {
    parent = makeBud(parent)
    tree.push(parent)
  }
  trees.push(tree)
}

while (buds.length < TOTAL) {
  const tree = faker.helpers.arrayElement(trees)
  const candidates = tree.filter((b) => b.depth < MAX_DEPTH)
  if (candidates.length === 0) continue
  const parent = faker.helpers.arrayElement(candidates)
  tree.push(makeBud(parent))
}

// Sort buds by depth so parents always insert before children (FK).
buds.sort(
  (a, b) =>
    a.depth - b.depth || a.createdAt.getTime() - b.createdAt.getTime(),
)

console.log(
  `Generated ${buds.length} buds, ${pollenGrains.length} pollen grains across ${ROOTS} trees`,
)

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma = new PrismaClient({ adapter })

console.log('Clearing existing bud/pollen rows...')
await prisma.pollen.deleteMany()
await prisma.bud.deleteMany()

// Pre-populate the handle cache for the local PDS accounts. Their `.test`
// handles and local DIDs can't be verified via the real PLC directory or
// the atproto handle resolver, so resolveHandles() would otherwise store
// negative entries and render raw DIDs in the UI.
console.log('Seeding handle cache...')
for (const [did, handle] of [
  [DEMO_DID, DEMO_HANDLE],
  [FRIEND_DID, FRIEND_HANDLE],
] as const) {
  await prisma.handleCache.upsert({
    where: { did },
    create: { did, handle, verified: true },
    update: { handle, verified: true, fetchedAt: new Date() },
  })
}

const CHUNK = 1000
async function insertChunked<T>(
  label: string,
  rows: T[],
  insert: (chunk: T[]) => Promise<unknown>,
) {
  console.log(`Inserting ${rows.length} ${label}...`)
  for (let i = 0; i < rows.length; i += CHUNK) {
    await insert(rows.slice(i, i + CHUNK))
  }
}

await insertChunked('seeds', seeds, (chunk) =>
  prisma.seed.createMany({ data: chunk }),
)
await insertChunked('buds', buds, (chunk) =>
  prisma.bud.createMany({ data: chunk }),
)
await insertChunked('pollen grains', pollenGrains, (chunk) =>
  prisma.pollen.createMany({ data: chunk }),
)

console.log('Done.')
await prisma.$disconnect()
