import type { CatalogPlugin } from '@data-fair/lib-common-types/catalog/index.js'
import { type SFTPConfig, configSchema, assertConfigValid } from '#types'
import capabilities from './lib/capabilities.ts'

// Since the plugin is very frequently imported, each function is imported on demand,
// instead of loading the entire plugin.
// This file should not contain any code, but only constants and dynamic imports of functions.

const plugin: CatalogPlugin<SFTPConfig, typeof capabilities> = {

  async list (context) {
    const { list } = await import('./lib/imports.ts')
    return list(context)
  },

  async getResource (catalogConfig, resourceId) {
    const { getResource } = await import('./lib/imports.ts')
    return getResource(catalogConfig, resourceId)
  },

  async downloadResource (context) {
    const { downloadResource } = await import('./lib/download.ts')
    return downloadResource(context)
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
