import { describe, expect, it } from 'vitest'
import type { ConnectionReference } from '../types'
import {
  connectionMergeCandidates,
  connectorDisplayName,
  detectConnectionUsage,
  effectiveConnectionReferences,
  flowLabel,
  groupConnectionReferences,
  isWorkflowJson,
  replaceConnectionReferenceNames,
} from './connections'

function reference(
  logicalName: string,
  connectorId: string,
  displayName = logicalName,
): ConnectionReference {
  return { logicalName, connectorId, displayName, connectionId: '' }
}

const dataverse = '/providers/Microsoft.PowerApps/apis/shared_commondataserviceforapps'
const outlook = '/providers/Microsoft.PowerApps/apis/shared_office365'

describe('connectorDisplayName', () => {
  it('uses known connector labels', () => {
    expect(connectorDisplayName(dataverse)).toBe('Microsoft Dataverse')
    expect(connectorDisplayName(outlook)).toBe('Office 365 Outlook')
  })

  it('derives a readable label for unknown connectors', () => {
    expect(
      connectorDisplayName('/providers/Microsoft.PowerApps/apis/shared_my_custom-connector'),
    ).toBe('My Custom Connector')
  })

  it('handles empty connector ids', () => {
    expect(connectorDisplayName('')).toBe('Unknown connector')
  })
})

describe('groupConnectionReferences', () => {
  it('groups references that share a connector regardless of case and trailing slash', () => {
    const groups = groupConnectionReferences([
      reference('cr_one', dataverse),
      reference('cr_two', `${dataverse}/`),
      reference('cr_three', outlook.toUpperCase()),
    ])

    expect(groups).toHaveLength(2)
    expect(groups[0].references.map((item) => item.logicalName)).toEqual([
      'cr_one',
      'cr_two',
    ])
    expect(groups[0].connectorName).toBe('Microsoft Dataverse')
    expect(groups[1].references).toHaveLength(1)
  })

  it('sorts larger groups first and leaves out references without a connector', () => {
    const groups = groupConnectionReferences([
      reference('cr_only', outlook),
      reference('cr_one', dataverse),
      reference('cr_two', dataverse),
      reference('cr_unknown', ''),
    ])

    expect(groups.map((group) => group.connectorName)).toEqual([
      'Microsoft Dataverse',
      'Office 365 Outlook',
    ])
    expect(groups.flatMap((group) => group.references).map((item) => item.logicalName)).not.toContain(
      'cr_unknown',
    )
  })
})

describe('workflow scanning', () => {
  it('recognises workflow JSON paths', () => {
    expect(isWorkflowJson('Workflows/MyFlow-123.json')).toBe(true)
    expect(isWorkflowJson('Workflows/MyFlow.json')).toBe(true)
    expect(isWorkflowJson('CanvasApps/App.msapp')).toBe(false)
    expect(isWorkflowJson('WebResources/flow.json')).toBe(false)
    expect(isWorkflowJson('Workflows/MyFlow.xml')).toBe(false)
  })

  it('strips the trailing flow GUID from labels', () => {
    expect(
      flowLabel('Workflows/InspectionApproval-22222222-3333-4444-5555-666666666666.json'),
    ).toBe('InspectionApproval')
    expect(flowLabel('Workflows/SimpleFlow.json')).toBe('SimpleFlow')
  })

  it('detects logical names inside flow definitions and deduplicates per file', () => {
    const references = [
      reference('cr_dataverse_a', dataverse),
      reference('cr_dataverse_b', dataverse),
      reference('cr_outlook', outlook),
    ]

    const usage = detectConnectionUsage(
      [
        {
          path: 'Workflows/FlowOne-11111111-1111-1111-1111-111111111111.json',
          text: JSON.stringify({
            connectionReferences: {
              cr_dataverse_a: { connectionName: 'shared-x' },
              CR_DATAVERSE_B: { connectionName: 'shared-y' },
            },
          }),
        },
        {
          path: 'Workflows/FlowOne-copy.json',
          text: JSON.stringify({
            connectionReferences: {
              cr_dataverse_a: { connectionName: 'shared-x' },
            },
          }),
        },
        { path: 'WebResources/readme.json', text: 'cr_outlook' },
      ],
      references,
    )

    expect(usage.flowFileCount).toBe(2)
    expect(usage.flows.cr_dataverse_a).toEqual(['FlowOne', 'FlowOne-copy'])
    expect(usage.flows.cr_dataverse_b).toEqual(['FlowOne'])
    expect(usage.flows.cr_outlook).toEqual([])
  })

  it('reports canvas apps and skipped files when known', () => {
    const usage = detectConnectionUsage([], [reference('cr_one', dataverse)], {
      hasCanvasApps: true,
      skippedFiles: 2,
    })

    expect(usage.flowFileCount).toBe(0)
    expect(usage.hasCanvasApps).toBe(true)
    expect(usage.skippedFiles).toBe(2)
  })
})

describe('connection merges', () => {
  const references = [
    reference('cr_dv_one', dataverse),
    reference('cr_dv_two', `${dataverse}/`),
    reference('cr_dv_three', dataverse.toUpperCase()),
    reference('cr_outlook', outlook),
    reference('cr_untracked', ''),
  ]

  it('returns only other references on the same connector', () => {
    const candidates = connectionMergeCandidates(references, 'cr_dv_one')
    expect(candidates.map((item) => item.logicalName)).toEqual(['cr_dv_two', 'cr_dv_three'])
  })

  it('returns nothing for unknown or connector-less survivors', () => {
    expect(connectionMergeCandidates(references, 'missing')).toEqual([])
    expect(connectionMergeCandidates(references, 'cr_untracked')).toEqual([])
  })

  it('filters merged references out of the effective list', () => {
    const effective = effectiveConnectionReferences(references, {
      cr_dv_two: 'cr_dv_one',
      cr_dv_three: 'cr_dv_one',
    })
    expect(effective.map((item) => item.logicalName)).toEqual([
      'cr_dv_one',
      'cr_outlook',
      'cr_untracked',
    ])
    expect(effectiveConnectionReferences(references, undefined)).toBe(references)
  })

  it('rewrites logical names inside flow JSON keys and values', () => {
    const flow = JSON.stringify({
      properties: {
        connectionReferences: {
          cr_dv_two: { connectionReferenceLogicalName: 'cr_dv_three' },
          cr_outlook: {},
        },
      },
    })
    const result = replaceConnectionReferenceNames(flow, {
      cr_dv_two: 'cr_dv_one',
      cr_dv_three: 'cr_dv_one',
    })
    expect(result.replacements).toBe(2)
    expect(result.text).toContain('cr_dv_one')
    expect(result.text).not.toContain('cr_dv_two')
    expect(result.text).not.toContain('cr_dv_three')
    expect(result.text).toContain('cr_outlook')
  })

  it('does not replace partial matches or same-name mappings', () => {
    const partial = replaceConnectionReferenceNames('cr_dv_two_extra cr_dv_two', {
      cr_dv_two: 'cr_dv_one',
    })
    expect(partial.replacements).toBe(1)
    expect(partial.text).toBe('cr_dv_two_extra cr_dv_one')

    const same = replaceConnectionReferenceNames('cr_dv_two', { cr_dv_two: 'cr_dv_two' })
    expect(same.replacements).toBe(0)
    expect(same.text).toBe('cr_dv_two')
  })
})
