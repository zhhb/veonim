// TODO: worried about what happens if we import the worker module again...?
import { activateExtension } from '../extensions/extensions'
import { Extension } from '../workers/extension-host'
import pleaseGet from '../support/please-get'

export interface DebugConfiguration {
  name: string
  request: string
  type: string
}

export interface DebugConfigurationProvider {
  // TODO: better param types here pls
  provideDebugConfigurations: (folder: string, token?: any) => DebugConfiguration[]
  resolveDebugConfiguration: (folder: string, debugConfig: DebugConfiguration, token?: any) => DebugConfiguration
}

interface Debugger {
  type: string
  label: string
  program: string
  runtime?: 'node' | 'mono'
  initialConfigurations?: any[]
  hasInitialConfiguration: boolean
  hasConfigurationProvider: boolean
  extension: Extension
  debugConfigProviders: Set<DebugConfigurationProvider>
}

const debuggers = new Map<string, Debugger>()

const getExtensionDebuggers = (extension: Extension): Debugger[] => {
  const debuggers = pleaseGet(extension.config).contributes.debuggers([]) as any[]

  return debuggers.map(d => ({
    extension,
    type: d.type,
    label: d.label,
    program: d.program,
    runtime: d.runtime,
    initialConfigurations: d.initialConfigurations,
    debugConfigProviders: new Set(),
    hasInitialConfiguration: !!d.initialConfigurations,
    hasConfigurationProvider: false,
  }))
}

export const collectDebuggersFromExtensions = (extensions: Extension[]): void => {
  // this function should only be called when we load extensions.  loading
  // extensions reloads ALL extensions whether they were loaded before or not.
  // this means we should reset the collection of debuggers from any previous
  // extension loadings
  debuggers.clear()

  extensions.forEach(ext => {
    const dbgs = getExtensionDebuggers(ext)
    dbgs.forEach(dbg => debuggers.set(dbg.type, dbg))
  })
}

export const registerDebugConfigProvider = (type: string, provider: DebugConfigurationProvider) => {
  if (!provider) return

  const dbg = debuggers.get(type)
  if (!dbg) return console.error(`can't register debug config provider. debugger ${type} does not exist.`)

  dbg.debugConfigProviders.add(provider)
  // TODO: in the vsc source, this flag gets set to true if 'provideDebugConfigurations' exists
  // i'm not sure how the filter works later, because we never track the existnce of 'resolveDebugConfiguration'
  dbg.hasConfigurationProvider = true
}

const activateDebuggersByEvent = async (eventType: string) => {
  const activations = [...debuggers.values()]
    .filter(d => d.extension.activationEvents.some(ae => ae.type === eventType))
    .map(d => activateExtension(d.extension))

  return Promise.all(activations)
}

export const getAvailableDebuggers = async (): Promise<Debugger[]> => {
  await activateDebuggersByEvent('onDebugInitialConfigurations')
  await activateDebuggersByEvent('onDebug')
  return [...debuggers.values()].filter(d => d.hasInitialConfiguration || d.hasConfigurationProvider)
}

export const getLaunchConfigs = async (): Promise<any> => {
  // TODO: get launch.json configs
}

export const resolveConfigurationByProviders = async (type: string) => {
  await activateDebuggersByEvent(`onDebugResolve:${type}`)

  return [...debuggers.values()]
    .filter(d => d.hasConfigurationProvider)
    .reduce((res, dbg) => {
      const configProviders = [...dbg.debugConfigProviders.values()]
      // TODO: provide cwd here
      // TODO: why calling provideDebugConfigurations, the analysis and func name
      // inidicates that we should be calling resolveDebugConfiguration here.
      // the problem is that we need to have some debug configurations before
      // calling "resolve..." (via "resolveDebugConfiguration")
      const configs = configProviders.map(cp => cp.provideDebugConfigurations('/Users/a/proj/veonim'))
      return [...res, ...configs]
    }, [] as DebugConfiguration)
}
