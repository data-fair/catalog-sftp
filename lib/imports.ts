import type { SFTPConfig } from '#types'
import type { FileEntryWithStats, SFTPWrapper } from 'ssh2'
import type capabilities from './capabilities.ts'
import type { ListContext, Folder, CatalogPlugin } from '@data-fair/types-catalogs'
import { type Config, NodeSSH } from 'node-ssh'

type ResourceList = Awaited<ReturnType<CatalogPlugin['list']>>['results']

/**
 * Stores the most recently used SFTP configuration.
 * This variable holds the last SFTPConfig object that was used,
 * allowing for reuse or reference in subsequent SFTP operations.
 */
let lastConfig: SFTPConfig | undefined
let lastSecrets: Record<string, string>

/**
 * Store the ssh instance for SFTP operations.
 */
const ssh = new NodeSSH()
/**
 * SFTP client instance used for managing SFTP operations.
 */
let clientSFTP: SFTPWrapper

/**
 * Prepares a list of files and folders from the SFTP directory listing.
 *
 * @param list - The array of file objects returned by the SFTP `readdir` method.
 * @param path - The current directory path.
 * @returns An array of `Folder` or `ResourceList` objects representing the files and folders.
 */
const prepareFiles = (list: FileEntryWithStats[], path: string): (Folder[] | ResourceList) => {
  return list.map((file: FileEntryWithStats) => {
    const pointPos = file.filename.lastIndexOf('.')
    if (file.longname.charAt(0) === 'd') {
      // Folder
      return {
        id: path + '/' + file.filename,
        title: file.filename,
        type: 'folder'
      } as Folder
    } else {
      // ResourceList
      return {
        id: path + '/' + file.filename,
        title: file.filename,
        description: '',
        format: (pointPos === -1) ? '' : (file.filename.substring(pointPos + 1)),
        mimeType: '',
        origin: path + '/' + file.filename,
        size: file.attrs.size,
        type: 'resource'
      } as ResourceList[number]
    }
  })
}

/**
 * Lists the contents of a folder on an SFTP server.
 *
 * @param context - The context containing catalog configuration and parameters.
 * @returns An object containing the count of items, the list of results (folders and resources), and the path as an array of folders.
 * @throws Will throw an error if the connection configuration is invalid or not supported.
 */
export const list = async ({ catalogConfig, secrets, params }: ListContext<SFTPConfig, typeof capabilities>): ReturnType<CatalogPlugin['list']> => {
  if (!(lastConfig && ssh && clientSFTP) ||
    JSON.stringify(lastConfig) !== JSON.stringify(catalogConfig) ||
    JSON.stringify(lastSecrets) !== JSON.stringify(secrets)) {
    lastConfig = catalogConfig
    lastSecrets = secrets
    const paramsConnection: Config = {
      host: catalogConfig.url,
      username: catalogConfig.login,
      port: catalogConfig.port
    }
    if (catalogConfig.connectionKey.key === 'sshKey') {
      paramsConnection.privateKey = secrets.sshKey
    } else if (catalogConfig.connectionKey.key === 'password') {
      paramsConnection.password = secrets.password
    } else {
      throw new Error('format non pris en charge')
    }

    try {
      await ssh.connect(paramsConnection)
    } catch (err) {
      console.error(err)
      lastConfig = undefined
      throw new Error('Configuration invalide')
    }
    clientSFTP = await ssh.requestSFTP()
  }
  const path = params.currentFolderId ?? '.'
  const files: FileEntryWithStats[] = await new Promise((resolve, reject) => {
    if (!clientSFTP) {
      throw new Error('Configuration invalide')
    }
    clientSFTP.readdir(path, (err: any, list: any) => {
      if (err) {
        console.error('Error reading directory:', err)
        return reject(err)
      }
      resolve(list)
    })
  })

  const results = prepareFiles(files, path)

  const pathFolder: Folder[] = []
  let parentId: string | undefined = (params.currentFolderId?.indexOf('./')) === -1 ? params.currentFolderId : params.currentFolderId?.substring(params.currentFolderId.indexOf('./') + 2)
  while (parentId && parentId !== '') {
    pathFolder.unshift({
      id: parentId,
      title: parentId.substring(parentId.lastIndexOf('/') + 1),
      type: 'folder'
    })
    parentId = parentId.substring(0, parentId.lastIndexOf('/'))
  }

  return {
    count: results.length,
    results,
    path: pathFolder
  }
}
