import { Task } from '@anabranch/anabranch'
import { type Event, EventLog } from '../index.ts'
import { createInMemory } from '../in-memory.ts'

const TOPIC = 'bank-transactions'

if (import.meta.main) {
  await main()
}

async function main() {
  console.log('🏦 Starting Event Sourced Bank Example...\n')

  const connector = createInMemory()
  const log = await EventLog.connect(connector).run()
  const ac = new AbortController()

  const [balanceCursor, alertCursor] = await Task.all([
    log.getCommittedCursor(TOPIC, 'balance-projector'),
    log.getCommittedCursor(TOPIC, 'alert-monitor'),
  ]).run()

  const balances = new Map<string, number>()

  const balanceStream = log
    .consume<BankEvent>(TOPIC, 'balance-projector', {
      cursor: balanceCursor,
      signal: ac.signal,
    })
    .tap((batch) => {
      for (const { data } of batch.events) {
        if (data.type === 'AccountOpened') {
          balances.set(data.accountId, 0)
        } else if (data.type === 'MoneyDeposited') {
          balances.set(
            data.accountId,
            (balances.get(data.accountId) ?? 0) + data.amount,
          )
        } else if (data.type === 'MoneyWithdrawn') {
          balances.set(
            data.accountId,
            (balances.get(data.accountId) ?? 0) - data.amount,
          )
        }
      }
    })
    .map(async (batch) => {
      await log.commit(TOPIC, 'balance-projector', batch.cursor).run()
    })
    .tapErr((err) => console.error('❌ Balance projector failed:', err))
    .partition()

  const alertStream = log
    .consume<BankEvent>(TOPIC, 'alert-monitor', {
      cursor: alertCursor,
      signal: ac.signal,
    })
    .map((batch) => {
      const alerts = batch.events.filter(
        (e): e is Event<MoneyWithdrawnEvent> =>
          e.data.type === 'MoneyWithdrawn' && e.data.amount > 500,
      )
      return { batch, alerts }
    })
    .tap(({ alerts }) => {
      for (const { data, timestamp } of alerts) {
        const time = new Date(timestamp).toLocaleTimeString()
        console.log(
          `🚨 ALERT: Large withdrawal of $${data.amount} from ${data.accountId} at ${time}`,
        )
      }
    })
    .map(async ({ batch }) => {
      await log.commit(TOPIC, 'alert-monitor', batch.cursor).run()
    })
    .tapErr((err) => console.error('❌ Alert monitor failed:', err))
    .partition()

  console.log('📝 Emitting transactions...\n')

  await Task.all([
    log.append(TOPIC, {
      type: 'AccountOpened',
      accountId: 'acc-1',
      ownerName: 'Alice',
    }, { partitionKey: 'acc-1' }),
    log.append(TOPIC, {
      type: 'AccountOpened',
      accountId: 'acc-2',
      ownerName: 'Bob',
    }, { partitionKey: 'acc-2' }),
  ]).run()

  await Task.all([
    log.append(TOPIC, {
      type: 'MoneyDeposited',
      accountId: 'acc-1',
      amount: 1000,
    }, { partitionKey: 'acc-1' }),
    log.append(TOPIC, {
      type: 'MoneyDeposited',
      accountId: 'acc-2',
      amount: 50,
    }, { partitionKey: 'acc-2' }),
  ]).run()

  await log.append(TOPIC, {
    type: 'MoneyWithdrawn',
    accountId: 'acc-1',
    amount: 800,
  }, { partitionKey: 'acc-1' }).run()

  await new Promise((resolve) => setTimeout(resolve, 200))

  console.log('\n🛑 Shutting down processors...')
  ac.abort()

  await Promise.all([balanceStream, alertStream])
  await log.close().run()

  console.log('\n📊 Final Materialized Balances:')
  for (const [acc, bal] of balances.entries()) {
    console.log(`  - ${acc}: $${bal}`)
  }
}

type BankEvent = MoneyWithdrawnEvent | AccountOpenedEvent | MoneyDepositedEvent

type MoneyWithdrawnEvent = {
  type: 'MoneyWithdrawn'
  accountId: string
  amount: number
}
type AccountOpenedEvent = {
  type: 'AccountOpened'
  accountId: string
  ownerName: string
}
type MoneyDepositedEvent = {
  type: 'MoneyDeposited'
  accountId: string
  amount: number
}
