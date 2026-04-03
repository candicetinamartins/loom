import { spawn, ChildProcess } from 'child_process'
import * as fs from 'fs/promises'
import * as path from 'path'

export interface ServerLock {
  port: number
  pid: number
  startTime: number
}

export class LoomServerManager {
  private serverProcess: ChildProcess | null = null
  private defaultPort = 57321
  private lockFilePath = '.loom/server.lock'

  async startServer(port: number = this.defaultPort): Promise<number> {
    const lock = await this.readLockFile()
    
    if (lock && await this.checkProcessRunning(lock.pid)) {
      console.log(`Server already running on port ${lock.port} (PID: ${lock.pid})`)
      return lock.port
    }

    const serverPath = await this.findServerExecutable()
    
    this.serverProcess = spawn(serverPath, ['--port', port.toString()], {
      stdio: 'ignore',
      detached: true,
    })

    if (this.serverProcess.pid) {
      this.serverProcess.unref()
      
      await this.writeLockFile({
        port,
        pid: this.serverProcess.pid,
        startTime: Date.now(),
      })

      console.log(`Server started on port ${port} (PID: ${this.serverProcess.pid})`)
      
      await this.waitForServerReady(port)
      return port
    }

    throw new Error('Failed to start server')
  }

  async stopServer(): Promise<void> {
    const lock = await this.readLockFile()
    
    if (lock && await this.checkProcessRunning(lock.pid)) {
      process.kill(lock.pid, 'SIGTERM')
      await this.deleteLockFile()
      console.log(`Server stopped (PID: ${lock.pid})`)
    }
    
    this.serverProcess = null
  }

  async getServerPort(): Promise<number | null> {
    const lock = await this.readLockFile()
    
    if (lock && await this.checkProcessRunning(lock.pid)) {
      return lock.port
    }
    
    return null
  }

  async isServerRunning(pid?: number): Promise<boolean> {
    if (pid === undefined) {
      const lock = await this.readLockFile()
      if (!lock) return false
      pid = lock.pid
    }
    return this.checkProcessRunning(pid)
  }

  private async checkProcessRunning(pid: number): Promise<boolean> {
    try {
      process.kill(pid, 0)
      return true
    } catch {
      return false
    }
  }

  private async readLockFile(): Promise<ServerLock | null> {
    try {
      const content = await fs.readFile(this.lockFilePath, 'utf-8')
      return JSON.parse(content)
    } catch {
      return null
    }
  }

  private async writeLockFile(lock: ServerLock): Promise<void> {
    const lockDir = path.dirname(this.lockFilePath)
    await fs.mkdir(lockDir, { recursive: true })
    await fs.writeFile(this.lockFilePath, JSON.stringify(lock, null, 2))
  }

  private async deleteLockFile(): Promise<void> {
    try {
      await fs.unlink(this.lockFilePath)
    } catch {
      // Ignore if file doesn't exist
    }
  }

  private async findServerExecutable(): Promise<string> {
    const possiblePaths = [
      path.join(process.cwd(), 'node_modules', '.bin', 'opencode'),
      path.join(process.cwd(), 'node_modules', '@loom', 'cli', 'bin', 'opencode'),
      'opencode',
    ]

    for (const p of possiblePaths) {
      try {
        await fs.access(p)
        return p
      } catch {
        // Continue to next path
      }
    }

    throw new Error('Could not find OpenCode server executable')
  }

  private async waitForServerReady(port: number, timeout: number = 10000): Promise<void> {
    const startTime = Date.now()
    
    while (Date.now() - startTime < timeout) {
      try {
        await this.pingServer(port)
        return
      } catch {
        await new Promise(resolve => setTimeout(resolve, 100))
      }
    }

    throw new Error(`Server did not become ready within ${timeout}ms`)
  }

  private async pingServer(port: number): Promise<void> {
    const response = await fetch(`http://localhost:${port}/health`)
    if (!response.ok) {
      throw new Error('Server health check failed')
    }
  }
}
