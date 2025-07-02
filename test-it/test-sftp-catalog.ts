import type { SFTPConfig } from '#types'
import plugin from '../index.ts'
import type { CatalogPlugin } from '@data-fair/types-catalogs'
import { strict as assert } from 'node:assert'
import { describe, it, before, after, beforeEach } from 'node:test'
import fs from 'fs-extra'
import util from 'util'
import ssh2 from 'ssh2'
import { exec as execCallback } from 'child_process'

const exec = util.promisify(execCallback)
const { generateKeyPairSync } = ssh2.utils

const catalogPlugin: CatalogPlugin = plugin as CatalogPlugin
const list = catalogPlugin.list
const getResource = catalogPlugin.getResource
const prepare = catalogPlugin.prepare

// Generate the SSH keys
const keysUser = generateKeyPairSync('ed25519')
const keysHost = generateKeyPairSync('ed25519')

const catalogConfig: SFTPConfig = {
  url: 'localhost',
  port: 31022,
  login: 'test3',
  connectionKey: {
    sshKey: '********',
    key: 'sshKey'
  }
}

const secrets: Record<string, string> = {
  sshKey: keysUser.private
}

// conditions de tests
const invalidTestsConfigs: { description: string, config: SFTPConfig, secret: Record<string, string> }[] = [
  {
    description: 'should throw an error with an invalid url',
    config: {
      url: 'exemple',
      port: 31022,
      login: 'test3',
      connectionKey: {
        sshKey: '***',
        key: 'sshKey'
      }
    },
    secret: secrets
  },
  {
    description: 'should throw an error with an invalid port',
    config: {
      url: 'localhost',
      port: 0,
      login: 'test3',
      connectionKey: {
        sshKey: '***',
        key: 'sshKey'
      }
    },
    secret: secrets
  },
  {
    description: 'should throw an error with an invalid login',
    config: {
      url: 'localhost',
      port: 31022,
      login: 'wrongLogin',
      connectionKey: {
        password: '***',
        key: 'password'
      }
    },
    secret: secrets
  },
  {
    description: 'should throw an error with an invalid password',
    config: {
      url: 'localhost',
      port: 31022,
      login: 'test3',
      connectionKey: {
        password: '***',
        key: 'password'
      }
    },
    secret: { password: '0000' }
  },
  {
    description: 'should throw an error with an invalid sshKey',
    config: {
      url: 'localhost',
      port: 31022,
      login: 'test3',
      connectionKey: {
        sshKey: '***',
        key: 'sshKey'
      }
    },
    secret: { sshKey: '0000' }
  }
]

describe('test the sftp catalog', () => {
  before(async () => {
    try {
      if (!fs.existsSync('./test-it/config/user_keys')) {
        fs.mkdirSync('./test-it/config/user_keys', { recursive: true })
      }
      if (!fs.existsSync('./test-it/config/ssh_host_keys')) {
        fs.mkdirSync('./test-it/config/ssh_host_keys', { recursive: true })
      }

      await fs.writeFile('./test-it/config/ssh_host_keys/test_key.pub', keysHost.public)
      await fs.writeFile('./test-it/config/ssh_host_keys/test_key', keysHost.private)
      await fs.writeFile('./test-it/config/user_keys/test_key.pub', keysUser.public)
      await fs.writeFile('./test-it/config/user_keys/test_key', keysUser.private)

      const { stdout, stderr } = await exec('docker compose up -d', { cwd: './test-it' })
      console.log(stdout)
      console.error(stderr)

      // Temps d'attente pour permettre au conteneur de vraiment se lancer
      await new Promise(resolve => setTimeout(resolve, 5000))
    } catch (err) {
      console.error('Erreur pendant le demarrage :', err)
      throw err
    }
  })

  after(async () => {
    try {
      const { stdout, stderr } = await exec('docker compose down', { cwd: './test-it' })
      console.log(stdout)
      console.error(stderr)
    } catch (err) {
      console.error('Erreur pendant l\'arret', err)
    }
  })

  describe('test the list function', () => {
    it('should list resources and folder from landing-zone', async () => {
      const res = await list({ catalogConfig, secrets, params: { currentFolderId: './landing-zone' } })
      assert.strictEqual(res.count, res.results.length, 'la taille des resultats et du compte ne correspondent pas')
      assert.strictEqual(res.count, 3)
      assert.strictEqual(res.path.length, 1)
      assert.strictEqual(res.path[0].title, 'landing-zone')
      assert.ok(res.results.some((val) => val.title === 'test.txt'))
      assert.ok(res.results.some((val) => val.id === './landing-zone/test.txt'))
      assert.ok(res.results.some((val) => val.type === 'resource'))

      assert.ok(res.results.some((val) => val.title === 'donnees'))
      assert.ok(res.results.some((val) => val.id === './landing-zone/donnees'))
      assert.ok(res.results.some((val) => val.type === 'folder'))
    })

    it('should list resources and folder from a sub-folder', async () => {
      const res = await list({ catalogConfig, secrets, params: { currentFolderId: './landing-zone/donnees' } })
      assert.strictEqual(res.count, res.results.length, 'la taille des resultats et du compte ne correspondent pas')
      assert.strictEqual(res.count, 2)
      assert.strictEqual(res.path.length, 2)
      assert.strictEqual(res.path[1].title, 'donnees')
      assert.ok(res.results.some((val) => val.title === 'donnees.csv'))
      assert.ok(res.results.some((val) => val.id === './landing-zone/donnees/donnees.csv'))
      assert.ok(res.results.some((val) => val.type === 'resource'))
    })

    describe('SFTP list erreur', () => {
      invalidTestsConfigs.forEach(({ description, config, secret }) => {
        it('list ' + description, async () => {
          await assert.rejects(
            async () => {
              await list({ catalogConfig: config, secrets: secret, params: { currentFolderId: './' } })
            },
            /Configuration invalide|Connection error/,
            'Doit renvoyer une erreur'
          )
        })
      })
    })
  })

  describe('test the getResource function', () => {
    before(() => {
      if (!fs.existsSync('./test-it/test-dl')) {
        fs.mkdirSync('./test-it/test-dl', { recursive: true })
      }
    })
    beforeEach(() => fs.emptyDirSync('./test-it/test-dl'))
    after(() => fs.removeSync('./test-it/test-dl'))

    it('should return the resource test.txt', async () => {
      const res = await getResource({
        catalogConfig,
        secrets,
        resourceId: './landing-zone/test.txt',
        importConfig: {},
        tmpDir: './test-it/test-dl'
      })
      assert.ok(res)
      assert.strictEqual(res.title, 'test.txt')
      assert.strictEqual(res.id, './landing-zone/test.txt')
      assert.strictEqual(res.format, 'txt')
      assert.strictEqual(res.origin, catalogConfig.url + ':' + catalogConfig.port)
      assert.strictEqual(res.filePath, './test-it/test-dl/test.txt')
      const fileExists = await fs.pathExists(res.filePath)
      assert.ok(fileExists, 'The downloaded file should exist')
    })
  })

  describe('SFTP getResource erreur', () => {
    invalidTestsConfigs.forEach(({ description, secret, config }) => {
      it('getResource ' + description, async () => {
        await assert.rejects(
          async () => {
            await getResource({ catalogConfig: config, secrets: secret, resourceId: './landing-zone/test.txt', tmpDir: './test-it/test-dl', importConfig: {} })
          },
          /Configuration invalide|Connection error/,
          'Doit renvoyer une erreur'
        )
      })
    })

    it('getResource should throw an error with an invalid resourceId', async () => {
      await assert.rejects(
        async () => {
          await getResource({ catalogConfig, secrets, resourceId: './landing-zone/something-wrong', tmpDir: './test-it/test-dl', importConfig: {} })
        },
        /No such file/,
        'Doit renvoyer une erreur'
      )
    })
  })
})

describe('prepare', () => {
  it('should mask sshKey and set secret when sshKey is provided', async () => {
    const catalogConfig: SFTPConfig = {
      url: 'localhost',
      port: 22,
      login: 'user',
      connectionKey: {
        sshKey: 'PRIVATE_KEY',
        key: 'sshKey'
      }
    }
    const secrets: Record<string, string> = {}

    const { catalogConfig: newConfig, secrets: newSecrets } = await prepare({
      catalogConfig: deepClone(catalogConfig),
      secrets,
      capabilities: []
    })

    assert.strictEqual((newConfig as SFTPConfig).connectionKey.sshKey, '********')
    assert.strictEqual(newSecrets?.sshKey, 'PRIVATE_KEY')
  })

  it('should remove sshKey from secrets if sshKey is empty', async () => {
    const catalogConfig: SFTPConfig = {
      url: 'localhost',
      port: 22,
      login: 'user',
      connectionKey: {
        sshKey: '',
        key: 'sshKey'
      }
    }
    const secrets: Record<string, string> = { sshKey: 'PRIVATE_KEY' }

    const { secrets: newSecrets } = await prepare({
      catalogConfig: deepClone(catalogConfig),
      secrets,
      capabilities: []
    })

    assert.ok(newSecrets && !('sshKey' in newSecrets))
  })

  it('should mask password and set secret when password is provided', async () => {
    const catalogConfig: SFTPConfig = {
      url: 'localhost',
      port: 22,
      login: 'user',
      connectionKey: {
        password: 'mypassword',
        key: 'password'
      }
    }
    const secrets: Record<string, string> = {}

    const { catalogConfig: newConfig, secrets: newSecrets } = await prepare({
      catalogConfig: deepClone(catalogConfig),
      secrets,
      capabilities: []
    })

    assert.ok(newConfig, 'newConfig should not be undefined')
    assert.strictEqual((newConfig as SFTPConfig).connectionKey.password, '********')
    assert.strictEqual(newSecrets?.password, 'mypassword')
  })

  it('should remove password from secrets if password is empty', async () => {
    const catalogConfig: SFTPConfig = {
      url: 'localhost',
      port: 22,
      login: 'user',
      connectionKey: {
        password: '',
        key: 'password'
      }
    }
    const secrets: Record<string, string> = { password: 'mypassword' }

    const { secrets: newSecrets } = await prepare({
      catalogConfig: deepClone(catalogConfig),
      secrets,
      capabilities: []
    })

    assert.ok(newSecrets && !('password' in newSecrets))
  })
})

function deepClone<T> (obj: T): T {
  return JSON.parse(JSON.stringify(obj))
}
