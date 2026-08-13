import { vi } from 'vitest'

/**
 * Shared in-memory mock for the Supabase client used by the web app services.
 *
 * The harness records every query into `ops`, exposes the `postgres_changes`
 * handlers registered through `channel()`, and lets each test control query
 * results per table+op via `mockFor(table, op)`.
 *
 * Test files wire it up with:
 *   vi.mock('../supabaseClient', async () => {
 *     const { harness } = await import('./helpers/supabaseTest')
 *     return { default: harness.supabase }
 *   })
 */
export type SupabaseOp = 'select' | 'insert' | 'upsert' | 'update' | 'delete'

export interface RecordedOp {
  table: string
  op?: SupabaseOp
  columns?: string
  filters: Record<string, unknown>
  payload?: Record<string, unknown>
  options?: Record<string, unknown>
  order?: { column: string; options?: Record<string, boolean> }
  limit?: number
  single?: 'single' | 'maybe'
}

export interface SupabaseResult {
  data: unknown
  error: unknown
}

export interface ChannelHandler {
  event: string
  config: Record<string, unknown>
  handler: (payload: Record<string, unknown>) => void | Promise<void>
}

export interface ChannelAPI {
  name: string
  on: (
    event: string,
    config: Record<string, unknown>,
    handler: ChannelHandler['handler'],
  ) => ChannelAPI
  subscribe: () => ChannelAPI
  unsubscribe: () => Promise<void>
}

export interface ChannelMock {
  name: string
  handlers: ChannelHandler[]
  removed: boolean
}

export interface AuthMock {
  session: { access_token: string } | null
  user: { id: string } | null
}

export interface QueryBuilder {
  select: (columns: string) => QueryBuilder
  eq: (column: string, value: unknown) => QueryBuilder
  in: (column: string, values: unknown[]) => QueryBuilder
  lt: (column: string, value: unknown) => QueryBuilder
  order: (column: string, options?: Record<string, boolean>) => QueryBuilder
  limit: (count: number) => QueryBuilder
  single: () => QueryBuilder
  maybeSingle: () => QueryBuilder
  insert: (payload: Record<string, unknown>) => QueryBuilder
  upsert: (payload: Record<string, unknown>, options?: Record<string, unknown>) => QueryBuilder
  update: (payload: Record<string, unknown>) => QueryBuilder
  delete: () => QueryBuilder
  then: <TResult1 = SupabaseResult, TResult2 = never>(
    onfulfilled?: ((value: SupabaseResult) => TResult1 | PromiseLike<TResult1>) | null | undefined,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null | undefined,
  ) => Promise<TResult1 | TResult2>
}

export interface SupabaseHarness {
  supabase: {
    from: (table: string) => QueryBuilder
    channel: (name: string) => ChannelAPI
    removeChannel: (channel: ChannelAPI) => void
    removeAllChannels: () => void
    auth: {
      getSession: () => Promise<{ data: { session: AuthMock['session'] } }>
      getUser: () => Promise<{ data: { user: AuthMock['user'] } }>
    }
  }
  ops: RecordedOp[]
  channels: ChannelMock[]
  auth: AuthMock
  reset: () => void
  mockFor: (table: string, op: SupabaseOp) => ReturnType<typeof vi.fn>
  findOps: (table: string, op?: SupabaseOp) => RecordedOp[]
  lastOp: (table: string, op?: SupabaseOp) => RecordedOp | undefined
  lastPayload: (table: string, op: SupabaseOp) => RecordedOp['payload'] | undefined
}

const defaultResult = (): SupabaseResult => ({ data: null, error: null })

export function createHarness(): SupabaseHarness {
  const handlers = new Map<string, ReturnType<typeof vi.fn>>()
  const ops: RecordedOp[] = []
  const channels: ChannelMock[] = []
  const auth: AuthMock = { session: null, user: null }

  const createBuilder = (table: string): QueryBuilder => {
    const recorded: RecordedOp = { table, filters: {} }

    const builder: QueryBuilder = {
      select(columns: string): QueryBuilder {
        if (recorded.op === undefined) {
          recorded.op = 'select'
        }
        recorded.columns = columns
        return builder
      },
      eq(column: string, value: unknown): QueryBuilder {
        recorded.filters[column] = value
        return builder
      },
      in(column: string, values: unknown[]): QueryBuilder {
        recorded.filters[column] = values
        return builder
      },
      lt(column: string, value: unknown): QueryBuilder {
        recorded.filters[column] = value
        return builder
      },
      order(column: string, options?: Record<string, boolean>): QueryBuilder {
        recorded.order = { column, options }
        return builder
      },
      limit(count: number): QueryBuilder {
        recorded.limit = count
        return builder
      },
      single(): QueryBuilder {
        recorded.single = 'single'
        return builder
      },
      maybeSingle(): QueryBuilder {
        recorded.single = 'maybe'
        return builder
      },
      insert(payload: Record<string, unknown>): QueryBuilder {
        recorded.op = 'insert'
        recorded.payload = payload
        return builder
      },
      upsert(payload: Record<string, unknown>, options?: Record<string, unknown>): QueryBuilder {
        recorded.op = 'upsert'
        recorded.payload = payload
        recorded.options = options
        return builder
      },
      update(payload: Record<string, unknown>): QueryBuilder {
        recorded.op = 'update'
        recorded.payload = payload
        return builder
      },
      delete(): QueryBuilder {
        recorded.op = 'delete'
        return builder
      },
      then(onfulfilled, onrejected) {
        ops.push(recorded)
        const key = `${table}|${recorded.op}`
        const handler = (handlers.get(key) ?? defaultResult) as (op: RecordedOp) => SupabaseResult
        return Promise.resolve(handler(recorded)).then(onfulfilled, onrejected)
      },
    }

    return builder
  }

  const supabase: SupabaseHarness['supabase'] = {
    from: (table: string) => createBuilder(table),
    channel(name: string): ChannelAPI {
      const record: ChannelMock = { name, handlers: [], removed: false }
      channels.push(record)

      const api: ChannelAPI = {
        name,
        on(event, config, handler) {
          record.handlers.push({ event, config, handler })
          return api
        },
        subscribe() {
          return api
        },
        unsubscribe() {
          record.removed = true
          return Promise.resolve()
        },
      }
      return api
    },
    removeChannel(channel: ChannelAPI) {
      const record = channels.find((c) => c.name === channel.name)
      if (record) record.removed = true
    },
    removeAllChannels() {
      for (const record of channels) {
        record.removed = true
      }
    },
    auth: {
      getSession: () => Promise.resolve({ data: { session: auth.session } }),
      getUser: () => Promise.resolve({ data: { user: auth.user } }),
    },
  }

  return {
    supabase,
    ops,
    channels,
    auth,
    reset() {
      ops.length = 0
      channels.length = 0
      handlers.clear()
      auth.session = null
      auth.user = null
    },
    mockFor(table: string, op: SupabaseOp) {
      const key = `${table}|${op}`
      let mock = handlers.get(key)
      if (!mock) {
        mock = vi.fn(() => defaultResult())
        handlers.set(key, mock)
      }
      return mock
    },
    findOps(table: string, op?: SupabaseOp) {
      return ops.filter((o) => o.table === table && (op === undefined || o.op === op))
    },
    lastOp(table: string, op?: SupabaseOp) {
      const matches = ops.filter((o) => o.table === table && (op === undefined || o.op === op))
      return matches[matches.length - 1]
    },
    lastPayload(table: string, op: SupabaseOp) {
      return this.lastOp(table, op)?.payload
    },
  }
}

/** Single shared harness instance per test file (module is cached per worker). */
export const harness = createHarness()
