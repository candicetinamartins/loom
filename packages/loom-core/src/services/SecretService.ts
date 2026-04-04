import * as keytar from 'keytar'

export class SecretService {
  private serviceName = 'loom-ide'

  async setSecret(key: string, value: string): Promise<void> {
    await keytar.setPassword(this.serviceName, key, value)
  }

  async getSecret(key: string): Promise<string | null> {
    return await keytar.getPassword(this.serviceName, key)
  }

  async get(key: string): Promise<string | null> {
    return this.getSecret(key)
  }

  async deleteSecret(key: string): Promise<boolean> {
    return await keytar.deletePassword(this.serviceName, key)
  }

  async hasSecret(key: string): Promise<boolean> {
    const secret = await this.getSecret(key)
    return secret !== null
  }

  async listSecrets(): Promise<string[]> {
    const secrets = await keytar.findCredentials(this.serviceName)
    return secrets.map((s) => s.account)
  }

  async clearAllSecrets(): Promise<void> {
    const secrets = await this.listSecrets()
    for (const key of secrets) {
      await this.deleteSecret(key)
    }
  }
}
