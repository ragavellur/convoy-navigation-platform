import * as mediasoup from 'mediasoup'

const workers: any[] = []

interface WorkerOptions {
  numWorkers: number
  listenIp: string
  portRange: { min: number; max: number }
}

export async function createWorkers(opts: WorkerOptions): Promise<void> {
  const { numWorkers, portRange } = opts

  for (let i = 0; i < numWorkers; i++) {
    const worker = await mediasoup.createWorker({
      rtcMinPort: portRange.min,
      rtcMaxPort: portRange.max,
    })

    worker.on('died', () => {
      console.error(`[mediasoup] Worker ${worker.pid} died, restarting in 2s...`)
      setTimeout(() => process.exit(1), 2000)
    })

    workers.push(worker)
    console.log(`[mediasoup] Worker ${worker.pid} created`)
  }
}

export function getWorker(): any {
  if (workers.length === 0) throw new Error('No mediasoup workers available')
  const idx = Math.floor(Math.random() * workers.length)
  return workers[idx]
}
