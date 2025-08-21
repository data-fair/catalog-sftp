import type { CatalogPlugin } from '@data-fair/types-catalogs'
import { type SFTPConfig, configSchema, assertConfigValid } from '#types'
import capabilities, { type SFTPCapabilities } from './lib/capabilities.ts'

// Since the plugin is very frequently imported, each function is imported on demand,
// instead of loading the entire plugin.
// This file should not contain any code, but only constants and dynamic imports of functions.

const plugin: CatalogPlugin<SFTPConfig, SFTPCapabilities> = {
  async prepare (context) {
    const prepare = (await import('./lib/prepare.ts')).default
    return prepare(context)
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
