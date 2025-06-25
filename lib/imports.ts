import type { SFTPConfig } from '#types'
import type { SFTPWrapper } from 'ssh2'
import type capabilities from './capabilities.ts'
import type { ListContext, Folder, Resource } from '@data-fair/lib-common-types/catalog/index.js'
import { type Config, NodeSSH } from 'node-ssh'

/**
 * Stores the most recently used SFTP configuration.
 * This variable holds the last SFTPConfig object that was used,
 * allowing for reuse or reference in subsequent SFTP operations.
 */
let lastConfig: SFTPConfig

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
 * @returns An array of `Folder` or `Resource` objects representing the files and folders.
 */
const prepareFiles = (list: any[], path: string): (Folder | Resource)[] => {
  return list.map((file) => {
    const pointPos = file.filename.lastIndexOf('.')
    return {
      id: path + '/' + file.filename,
      title: file.filename,
      type: (file.longname.charAt(0) === 'd') ? 'folder' : 'resource',
      url: path + '/' + file.filename,
      format: (pointPos === -1) ? '' : (file.filename.substring(pointPos + 1))
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
export const list = async ({ catalogConfig, params }: ListContext<SFTPConfig, typeof capabilities>): Promise<{ count: number; results: (Folder | Resource)[]; path: Folder[] }> => {
  if (!(lastConfig && ssh && clientSFTP) || JSON.stringify(lastConfig) !== JSON.stringify(catalogConfig)) {
    lastConfig = catalogConfig
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
      console.error(err)
      throw new Error('Configuration invalide')
    }
    clientSFTP = await ssh.requestSFTP()
  }
  const path = params.currentFolderId ?? '.'
  const files: any[] = await new Promise((resolve, reject) => {
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

/**
 * Retrieves metadata for a specific resource (file) on the SFTP server.
 *
 * @param catalogConfig - The SFTP configuration object.
 * @param resourceId - The identifier (path) of the resource.
 * @returns A `Resource` object representing the file.
 */
export const getResource = async (catalogConfig: SFTPConfig, resourceId: string): Promise<Resource> => {
  const pointPos = resourceId.lastIndexOf('.')
  return {
    id: resourceId,
    title: resourceId.substring(resourceId.lastIndexOf('/') + 1),
    type: 'resource',
    format: (pointPos === -1) ? '' : (resourceId.substring(pointPos + 1)),
    url: resourceId
  }
}
