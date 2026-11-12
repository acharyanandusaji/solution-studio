import { describe, expect, it } from 'vitest'
import type { DeploymentSettings } from '../../types'
import { buildComponentParameters, normalizeOrgUrl } from './dataverse'

describe('normalizeOrgUrl', () => {
  it('adds a scheme and removes trailing slashes', () => {
    expect(normalizeOrgUrl('org.crm.dynamics.com')).toBe('https://org.crm.dynamics.com')
    expect(normalizeOrgUrl('https://org.crm.dynamics.com/')).toBe('https://org.crm.dynamics.com')
    expect(normalizeOrgUrl('  https://org.crm.dynamics.com///  ')).toBe('https://org.crm.dynamics.com')
  })

  it('keeps the origin and drops paths', () => {
    expect(normalizeOrgUrl('https://org.crm.dynamics.com/main.aspx')).toBe(
      'https://org.crm.dynamics.com',
    )
    expect(normalizeOrgUrl('http://org.crm.dynamics.com/api/data/v9.2')).toBe(
      'http://org.crm.dynamics.com',
    )
  })

  it('rejects empty and non-Dataverse values', () => {
    expect(() => normalizeOrgUrl('')).toThrow(/environment URL/i)
    expect(() => normalizeOrgUrl('   ')).toThrow(/environment URL/i)
    expect(() => normalizeOrgUrl('localhost')).toThrow(/Dataverse environment URL/i)
  })
})

describe('buildComponentParameters', () => {
  const settings: DeploymentSettings = {
    EnvironmentVariables: [],
    ConnectionReferences: [
      {
        LogicalName: 'cr_sharedcommondataserviceforapps_abc',
        ConnectionId: '  /providers/Microsoft.PowerApps/apis/shared_commondataserviceforapps/connections/123  ',
        ConnectorId: '/providers/Microsoft.PowerApps/apis/shared_commondataserviceforapps',
      },
      {
        LogicalName: 'cr_sharedoffice365_def',
        ConnectionId: '',
        ConnectorId: '/providers/Microsoft.PowerApps/apis/shared_office365',
      },
    ],
  }

  it('maps bound connection references to Dataverse component parameters', () => {
    expect(buildComponentParameters(settings)).toEqual([
      {
        '@odata.type': 'Microsoft.Dynamics.CRM.connectionreference',
        connectionreferencelogicalname: 'cr_sharedcommondataserviceforapps_abc',
        connectionid:
          '/providers/Microsoft.PowerApps/apis/shared_commondataserviceforapps/connections/123',
        connectorid: '/providers/Microsoft.PowerApps/apis/shared_commondataserviceforapps',
      },
    ])
  })

  it('returns nothing when no connection is bound', () => {
    expect(
      buildComponentParameters({ EnvironmentVariables: [], ConnectionReferences: [] }),
    ).toEqual([])
  })
})
