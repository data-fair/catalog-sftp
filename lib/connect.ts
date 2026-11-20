import type { SFTPConfig } from '#types'
import { type Config, NodeSSH } from 'node-ssh'
import { resolvePublicAddress } from '@data-fair/lib-node/ssrf.js'
import Debug from 'debug'

const debug = Debug('catalog-sftp')

export const connectionParams = (catalogConfig: SFTPConfig, secrets: Record<string, string>): Config => {
  const params: Config = {
    host: catalogConfig.url,
    username: catalogConfig.login,
    port: catalogConfig.port
  }
  if (catalogConfig.connectionKey.key === 'sshKey') {
    params.privateKey = secrets.sshKey
  } else if (catalogConfig.connectionKey.key === 'password') {
    params.password = secrets.password
  } else {
    throw new Error('Unsupported connection format')
  }
  return params
}

export const connect = async (catalogConfig: SFTPConfig, secrets: Record<string, string>): Promise<NodeSSH> => {
  const params = connectionParams(catalogConfig, secrets)
  const ssh = new NodeSSH()
  try {
    // the host is chosen by the user: refuse non public addresses (SSRF) and connect to
    // the checked IP, resolving the host again could give another address (DNS rebinding)
    await ssh.connect({ ...params, host: await resolvePublicAddress(catalogConfig.url) })
  } catch (err) {
    ssh.dispose()
    throw err
  }
  ssh.connection?.on('error', (err) => debug('connection error after connect', err))
  return ssh
}
