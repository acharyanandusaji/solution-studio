import {
  effectiveConnectionId,
  effectiveConnectionReferences,
  effectiveEnvironmentValue,
} from './package'
import { isValidVersion, validateXml } from './xml'
import type { HealthReport, SolutionEdits, SolutionPackage, ValidationCheck } from '../types'

export function buildHealthReport(
  pkg: SolutionPackage,
  edits: SolutionEdits,
): HealthReport {
  const checks: ValidationCheck[] = []
  const add = (check: ValidationCheck) => checks.push(check)

  add({
    id: 'solution-xml',
    label: 'solution.xml is valid',
    status: 'pass',
    detail: 'The solution manifest was parsed successfully.',
    category: 'package',
  })

  if (pkg.customizationsXml) {
    add({
      id: 'customizations-xml',
      label: 'customizations.xml is valid',
      status: 'pass',
      detail: 'Solution customizations and components were parsed successfully.',
      category: 'package',
    })
  } else if (pkg.environmentVariables.length > 0) {
    add({
      id: 'customizations-xml',
      label: 'Environment variables use sidecar files',
      status: 'pass',
      detail:
        'This package has no customizations.xml. Definitions and values are read from environmentvariabledefinitions/ sidecar files instead.',
      category: 'package',
    })
  } else {
    add({
      id: 'customizations-xml',
      label: 'customizations.xml is absent',
      status: 'info',
      detail:
        'This package has no customizations.xml, so customizations-based components cannot be inspected.',
      category: 'package',
    })
  }

  if (isValidVersion(edits.version)) {
    add({
      id: 'version',
      label: 'Version number is valid',
      status: 'pass',
      detail: `Target version is ${edits.version}.`,
      category: 'metadata',
    })
  } else {
    add({
      id: 'version',
      label: 'Version number is invalid',
      status: 'fail',
      detail: 'Use four numeric parts separated by dots, each from 0 to 65535.',
      category: 'metadata',
    })
  }

  if (edits.version !== pkg.solution.version) {
    add({
      id: 'version-change',
      label: 'Version will be updated',
      status: 'info',
      detail: `${pkg.solution.version} → ${edits.version}`,
      category: 'metadata',
    })
  }

  if (edits.managed !== pkg.solution.managed) {
    add({
      id: 'managed-flag',
      label: 'Managed flag change is metadata only',
      status: 'warn',
      detail:
        'Changing <Managed> does not convert a solution. Real managed/unmanaged conversion requires export or import in Dataverse.',
      category: 'metadata',
    })
  } else {
    add({
      id: 'managed-flag',
      label: `Package is marked ${edits.managed ? 'managed' : 'unmanaged'}`,
      status: 'pass',
      detail: 'The manifest flag matches the uploaded solution.',
      category: 'metadata',
    })
  }

  if (!pkg.solution.publisher.prefix) {
    add({
      id: 'publisher',
      label: 'Publisher prefix is missing',
      status: 'warn',
      detail: 'The publisher metadata does not include a customization prefix.',
      category: 'metadata',
    })
  }

  if (pkg.solution.missingDependencies.length > 0) {
    if (edits.removeMissingDependencies) {
      add({
        id: 'missing-dependencies',
        label: 'Missing dependencies will be removed',
        status: 'pass',
        detail: `${pkg.solution.missingDependencies.length} missing dependenc${
          pkg.solution.missingDependencies.length === 1 ? 'y' : 'ies'
        } will be stripped from solution.xml. Verify the target environment has them.`,
        category: 'deployment',
      })
    } else {
      add({
        id: 'missing-dependencies',
        label: 'Missing dependencies remain in the manifest',
        status: 'warn',
        detail: `${pkg.solution.missingDependencies.length} unresolved dependenc${
          pkg.solution.missingDependencies.length === 1 ? 'y' : 'ies'
        } may block import. Review them before deploying.`,
        category: 'deployment',
      })
    }
  } else {
    add({
      id: 'missing-dependencies',
      label: 'No missing dependencies',
      status: 'pass',
      detail: pkg.solution.hasMissingDependenciesNode
        ? 'The MissingDependencies element is present but empty.'
        : 'solution.xml has no MissingDependencies element.',
      category: 'deployment',
    })
  }

  const emptyEnvVars = pkg.environmentVariables.filter(
    (variable) =>
      !variable.secret &&
      effectiveEnvironmentValue(pkg, edits, variable.schemaName).trim() === '',
  )
  if (pkg.environmentVariables.length > 0) {
    if (emptyEnvVars.length > 0) {
      add({
        id: 'env-values',
        label: 'Some environment variables have no value',
        status: 'warn',
        detail: `${emptyEnvVars.length} of ${pkg.environmentVariables.length} variables are empty. Target values can also be supplied with DeploymentSettings.json.`,
        category: 'deployment',
      })
    } else {
      add({
        id: 'env-values',
        label: 'Environment variables have values',
        status: 'pass',
        detail: `${pkg.environmentVariables.length} environment variable definition${
          pkg.environmentVariables.length === 1 ? '' : 's'
        } found.`,
        category: 'deployment',
      })
    }
    const secrets = pkg.environmentVariables.filter((variable) => variable.secret)
    if (secrets.length > 0) {
      add({
        id: 'secret-values',
        label: 'Secret values are not exported',
        status: 'info',
        detail: `${secrets.length} secret variable${
          secrets.length === 1 ? '' : 's'
        } cannot carry exported values. Set them in the target environment or pipeline.`,
        category: 'security',
      })
    }
  }

  const effectiveConnections = effectiveConnectionReferences(pkg, edits)
  if (pkg.connectionReferences.length > 0) {
    const emptyConnections = effectiveConnections.filter(
      (reference) => effectiveConnectionId(edits, reference.logicalName).trim() === '',
    )
    if (emptyConnections.length > 0) {
      add({
        id: 'connection-refs',
        label: 'Connection IDs are not configured',
        status: 'warn',
        detail: `${emptyConnections.length} of ${effectiveConnections.length} connection references have no target connection ID. Fill these in the Deployment Settings tab.`,
        category: 'deployment',
      })
    } else {
      add({
        id: 'connection-refs',
        label: 'Connection references are configured',
        status: 'pass',
        detail: `${effectiveConnections.length} connection reference${
          effectiveConnections.length === 1 ? '' : 's'
        } ready for DeploymentSettings.json.`,
        category: 'deployment',
      })
    }
  }

  const mergedConnections = pkg.connectionReferences.filter((reference) => {
    const survivor = edits.connectionMerges?.[reference.logicalName]
    return Boolean(survivor && survivor !== reference.logicalName)
  })
  if (mergedConnections.length > 0) {
    add({
      id: 'connection-merges',
      label: 'Connection references will be merged',
      status: 'info',
      detail: `${mergedConnections.length} reference${
        mergedConnections.length === 1 ? '' : 's'
      } will be removed from the rebuilt ZIP and their cloud flows will use the surviving reference.`,
      category: 'deployment',
    })
    if (pkg.hasCanvasApps) {
      add({
        id: 'connection-merges-canvas',
        label: 'Canvas apps cannot be rewritten',
        status: 'warn',
        detail:
          'This package contains canvas apps (.msapp). Their binary definitions cannot be updated, so check their connections after import.',
        category: 'deployment',
      })
    }
  }

  if (edits.solutionXmlOverride) {
    const validation = validateXml(edits.solutionXmlOverride)
    add({
      id: 'solution-override',
      label: 'solution.xml raw edit is valid',
      status: validation.valid ? 'pass' : 'fail',
      detail: validation.valid
        ? 'Advanced XML edit will be used as the base for solution.xml.'
        : validation.error ?? 'The raw solution.xml edit is invalid.',
      category: 'package',
    })
  }

  if (edits.customizationsXmlOverride) {
    const validation = validateXml(edits.customizationsXmlOverride)
    add({
      id: 'customizations-override',
      label: 'customizations.xml raw edit is valid',
      status: validation.valid ? 'pass' : 'fail',
      detail: validation.valid
        ? 'Advanced XML edit will be used as the base for customizations.xml.'
        : validation.error ?? 'The raw customizations.xml edit is invalid.',
      category: 'package',
    })
  }

  const failed = checks.filter((check) => check.status === 'fail').length
  const warnings = checks.filter((check) => check.status === 'warn').length
  const passed = checks.filter((check) => check.status === 'pass').length
  const score = Math.max(0, Math.min(100, 100 - failed * 30 - warnings * 8))

  return { score, checks, passed, warnings, failed }
}
