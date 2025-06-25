import type { DownloadResourceContext } from '@data-fair/lib-common-types/catalog/index.js'
import type { SFTPConfig } from '#types'
import { type Config, NodeSSH } from 'node-ssh'

/**
 * Downloads a resource (file) from the SFTP server to a temporary directory.
 *
 * @param context - The context containing catalog configuration, resource ID, import configuration, and temporary directory path.
 * @returns The local path to the downloaded file, or `undefined` if the download fails.
 * @throws Will throw an error if the connection configuration is invalid or not supported.
 */
export const downloadResource = async ({ catalogConfig, resourceId, importConfig, tmpDir }: DownloadResourceContext<SFTPConfig>) => {
  const ssh = new NodeSSH()

  const paramsConnection: Config = {
    host: catalogConfig.url,
    username: catalogConfig.login,
    port: catalogConfig.port
  }
  if (catalogConfig.connectionKey.key === 'sshKey') {
    paramsConnection.privateKey = catalogConfig.connectionKey.sshKey
  } else if (catalogConfig.connectionKey.key === 'password') {
    paramsConnection.password = catalogConfig.connectionKey.password
  } else {
    throw new Error('format non pris en charge')
  }

  try {
    await ssh.connect(paramsConnection)
  } catch (err) {
    throw new Error('Configuration invalide')
  }

  const fs = await import('node:fs/promises')
  resourceId = resourceId.substring(resourceId.indexOf('./') + 2)
  const destinationPath = tmpDir + '/' + resourceId

  // creation du dossier pour stocker le fichier distant
  await fs.mkdir(destinationPath.substring(0, destinationPath.lastIndexOf('/')), { recursive: true })

  try {
    await ssh.getFile(destinationPath, resourceId)
    return destinationPath
  } catch (error) {
    console.error('Error downloading file:', error)
    throw error
  }
}
