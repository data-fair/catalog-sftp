import type { CatalogPlugin } from '@data-fair/lib-common-types/catalog/index.js'
import { type SFTPConfig, configSchema, assertConfigValid } from '#types'
import capabilities from './lib/capabilities.ts'

// Since the plugin is very frequently imported, each function is imported on demand,
// instead of loading the entire plugin.
// This file should not contain any code, but only constants and dynamic imports of functions.

const plugin: CatalogPlugin<SFTPConfig, typeof capabilities> = {
  async prepare ({ catalogConfig, secrets }: { catalogConfig: SFTPConfig, secrets: Record<string, string> }) {
    switch (catalogConfig.connectionKey.key) {
      case 'sshKey':
        if (secrets?.sshKey && catalogConfig.connectionKey.sshKey === '') {
          delete secrets.sshKey
        } else {
          secrets.sshKey = catalogConfig.connectionKey.sshKey
          catalogConfig.connectionKey.sshKey = '********'
        }
        break
      case 'password':
        if (secrets?.password && catalogConfig.connectionKey.password === '') {
          delete secrets.password
        } else {
          secrets.password = catalogConfig.connectionKey.password
          catalogConfig.connectionKey.password = '********'
        }
        break
      default: break
    }
    return {
      catalogConfig,
      secrets
    }
  },

  async list (context) {
    const { list } = await import('./lib/imports.ts')
    return list(context)
  },

  async getResource (context) {
    const { getResource } = await import('./lib/download.ts')
    return getResource(context)
  },

  metadata: {
    title: 'Catalog SFTP',
    description: 'SFTP plugin for Data Fair Catalog',
    capabilities
  },
  configSchema,
  assertConfigValid
}
export default plugin
