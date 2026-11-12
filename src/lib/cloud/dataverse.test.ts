import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DeploymentSettings } from '../../types'
import { buildComponentParameters, listSolutions, normalizeOrgUrl } from './dataverse'

afterEach(() => {
  vi.unstubAllGlobals()
})

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

describe('listSolutions', () => {
  it('queries parent solutions without the non-existent isparent field', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        value: [
          {
            solutionid: '1',
            uniquename: 'ContosoFlow',
            friendlyname: 'Contoso Flow',
            version: '1.0.0.1',
            ismanaged: true,
            isvisible: true,
            _parentsolutionid_value: null,
          },
          {
            solutionid: '2',
            uniquename: 'ContosoFlowPatch',
            friendlyname: 'Contoso Flow Patch',
            version: '1.0.0.2',
            ismanaged: false,
            isvisible: true,
            _parentsolutionid_value: '1',
          },
          {
            solutionid: '3',
            uniquename: 'HiddenSolution',
            friendlyname: 'Hidden Solution',
            version: '1.0.0.0',
            ismanaged: false,
            isvisible: false,
            _parentsolutionid_value: null,
          },
          {
            solutionid: '4',
            uniquename: 'System',
            friendlyname: 'System',
            version: '1.0.0.0',
            ismanaged: false,
            isvisible: true,
            _parentsolutionid_value: null,
          },
        ],
      }),
    }))
    vi.stubGlobal('fetch', fetchMock)

    const solutions = await listSolutions('https://org.crm.dynamics.com', 'token')

    expect(solutions).toEqual([
      {
        solutionId: '1',
        uniqueName: 'ContosoFlow',
        displayName: 'Contoso Flow',
        version: '1.0.0.1',
        managed: true,
        isParent: true,
      },
    ])

    const [url] = fetchMock.mock.calls[0] as unknown as [string]
    expect(url).toContain('_parentsolutionid_value')
    expect(url).not.toContain('isparent')
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
