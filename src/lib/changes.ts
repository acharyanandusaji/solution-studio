import { effectiveConnectionId, effectiveEnvironmentValue } from './package'
import type { ChangeItem, SolutionEdits, SolutionPackage } from '../types'

export function buildChangeList(
  pkg: SolutionPackage,
  edits: SolutionEdits,
): ChangeItem[] {
  const changes: ChangeItem[] = []

  if (edits.version !== pkg.solution.version) {
    changes.push({
      id: 'version',
      label: 'Solution version',
      before: pkg.solution.version,
      after: edits.version,
      category: 'solution',
    })
  }

  if (edits.managed !== pkg.solution.managed) {
    changes.push({
      id: 'managed',
      label: 'Managed flag',
      before: pkg.solution.managed ? 'Managed' : 'Unmanaged',
      after: edits.managed ? 'Managed' : 'Unmanaged',
      category: 'solution',
    })
  }

  if (edits.removeMissingDependencies && pkg.solution.hasMissingDependenciesNode) {
    changes.push({
      id: 'missing-dependencies',
      label: 'MissingDependencies block',
      before: `${pkg.solution.missingDependencies.length} entries`,
      after: 'Removed',
      category: 'solution',
    })
  }

  for (const variable of pkg.environmentVariables) {
    if (!Object.prototype.hasOwnProperty.call(edits.envVarValues, variable.schemaName)) {
      continue
    }
    const value = effectiveEnvironmentValue(pkg, edits, variable.schemaName)
    if (value === variable.currentValue && variable.explicitValue) continue
    changes.push({
      id: `env-${variable.schemaName}`,
      label: variable.displayName || variable.schemaName,
      before: variable.explicitValue
        ? variable.currentValue
        : variable.currentValue
          ? `${variable.currentValue} (default)`
          : 'No value',
      after: value || '(empty)',
      category: 'environment',
    })
  }

  for (const [from, to] of Object.entries(edits.connectionMerges ?? {})) {
    if (!from || !to || from === to) continue
    const reference = pkg.connectionReferences.find((item) => item.logicalName === from)
    if (!reference) continue
    changes.push({
      id: `merge-${from}`,
      label: `${reference.displayName || from} connection reference`,
      before: from,
      after: `Merged into ${to}`,
      category: 'solution',
    })
  }

  const mergedNames = new Set(
    Object.entries(edits.connectionMerges ?? {})
      .filter(([from, to]) => from && to && from !== to)
      .map(([from]) => from),
  )

  for (const reference of pkg.connectionReferences) {
    if (mergedNames.has(reference.logicalName)) continue
    const id = effectiveConnectionId(edits, reference.logicalName)
    if (id === reference.connectionId) continue
    if (!id && !reference.connectionId) continue
    changes.push({
      id: `connection-${reference.logicalName}`,
      label: `${reference.displayName || reference.logicalName} connection`,
      before: reference.connectionId || 'Not set',
      after: id || 'Not set',
      category: 'environment',
    })
  }

  if (edits.solutionXmlOverride && edits.solutionXmlOverride !== pkg.solutionXml) {
    changes.push({
      id: 'solution-xml-override',
      label: 'solution.xml (advanced raw edit)',
      after: 'Custom XML override',
      category: 'package',
    })
  }

  if (
    edits.customizationsXmlOverride &&
    edits.customizationsXmlOverride !== pkg.customizationsXml
  ) {
    changes.push({
      id: 'customizations-xml-override',
      label: 'customizations.xml (advanced raw edit)',
      after: 'Custom XML override',
      category: 'package',
    })
  }

  return changes
}

export function countPackageChanges(changes: ChangeItem[]): number {
  return changes.filter((change) => change.category !== 'environment' || !change.id.startsWith('connection-'))
    .length
}
