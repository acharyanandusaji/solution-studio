import JSZip from 'jszip'
import { describe, expect, it } from 'vitest'
import {
  buildEditedPackage,
  generateDeploymentSettings,
  initialEdits,
  loadSolutionPackage,
} from './package'

const solutionXml = `<?xml version="1.0" encoding="utf-8"?>
<ImportExportXml>
  <SolutionManifest>
    <UniqueName>Contoso.Managed</UniqueName>
    <LocalizedNames>
      <LocalizedName description="Contoso Managed" languagecode="1033" />
    </LocalizedNames>
    <Version>1.0.0.0</Version>
    <Managed>1</Managed>
    <Publisher>
      <UniqueName>Contoso</UniqueName>
      <LocalizedNames>
        <LocalizedName description="Contoso Publisher" languagecode="1033" />
      </LocalizedNames>
      <CustomizationPrefix>con</CustomizationPrefix>
    </Publisher>
    <RootComponents />
  </SolutionManifest>
</ImportExportXml>`

const definitionXml = (schemaName: string, displayName: string, type: number, defaultValue: string) => `<?xml version="1.0" encoding="utf-8"?>
<environmentvariabledefinition schemaname="${schemaName}">
  <displayname>
    <label description="${displayName}" languagecode="1033" />
  </displayname>
  <type>${type}</type>
  <defaultvalue>${defaultValue}</defaultvalue>
</environmentvariabledefinition>`

const valueJson = (value: string) =>
  JSON.stringify({
    environmentvariablevalues: {
      environmentvariablevalue: {
        '@environmentvariablevalueid': '33333333-3333-3333-3333-333333333333',
        iscustomizable: '1',
        value,
      },
    },
  })

async function managedZip(): Promise<File> {
  const zip = new JSZip()
  zip.file('solution.xml', solutionXml)
  zip.file(
    'environmentvariabledefinitions/con_ApiBaseUrl/environmentvariabledefinition.xml',
    definitionXml('con_ApiBaseUrl', 'API base URL', 100000000, 'https://dev.example'),
  )
  zip.file(
    'environmentvariabledefinitions/con_ApiBaseUrl/environmentvariablevalues.json',
    valueJson('https://prod.example'),
  )
  zip.file(
    'environmentvariabledefinitions/con_Flag/environmentvariabledefinition.xml',
    definitionXml('con_Flag', 'Feature flag', 100000002, 'false'),
  )
  const bytes = await zip.generateAsync({ type: 'uint8array' })
  return new File([bytes.buffer as ArrayBuffer], 'Contoso.Managed_1.0.0.0_managed.zip', {
    type: 'application/zip',
  })
}

describe('managed solution environment variables', () => {
  it('reads definitions and values from sidecar files', async () => {
    const pkg = await loadSolutionPackage(await managedZip())
    expect(pkg.customizationsXml).toBe('')
    expect(pkg.environmentVariables).toHaveLength(2)

    const api = pkg.environmentVariables.find((item) => item.schemaName === 'con_ApiBaseUrl')!
    expect(api.displayName).toBe('API base URL')
    expect(api.currentValue).toBe('https://prod.example')
    expect(api.explicitValue).toBe(true)
    expect(pkg.environmentVariableValuePaths.con_ApiBaseUrl).toBe(
      'environmentvariabledefinitions/con_ApiBaseUrl/environmentvariablevalues.json',
    )

    const flag = pkg.environmentVariables.find((item) => item.schemaName === 'con_Flag')!
    expect(flag.currentValue).toBe('false')
    expect(flag.explicitValue).toBe(false)
    expect(pkg.environmentVariableValuePaths.con_Flag).toBeUndefined()
  })

  it('writes edits back to the sidecar value files without customizations.xml', async () => {
    const pkg = await loadSolutionPackage(await managedZip())
    const edits = initialEdits(pkg)
    edits.envVarValues = {
      con_ApiBaseUrl: 'https://staging.example',
      con_Flag: 'true',
    }

    const result = await buildEditedPackage(pkg, edits)
    expect(result.appliedEnvironmentVariables).toBe(2)

    const output = await JSZip.loadAsync(await result.blob.arrayBuffer())
    const apiJson = JSON.parse(
      await output
        .file('environmentvariabledefinitions/con_ApiBaseUrl/environmentvariablevalues.json')!
        .async('string'),
    )
    expect(apiJson.environmentvariablevalues.environmentvariablevalue.value).toBe(
      'https://staging.example',
    )

    const flagJson = JSON.parse(
      await output
        .file('environmentvariabledefinitions/con_Flag/environmentvariablevalues.json')!
        .async('string'),
    )
    expect(flagJson.environmentvariablevalues.environmentvariablevalue.value).toBe('true')
  })
})

const dataverseConnector = '/providers/Microsoft.PowerApps/apis/shared_commondataserviceforapps'
const outlookConnector = '/providers/Microsoft.PowerApps/apis/shared_office365'

const mergeSolutionXml = `<?xml version="1.0" encoding="utf-8"?>
<ImportExportXml>
  <SolutionManifest>
    <UniqueName>Contoso.Merge</UniqueName>
    <LocalizedNames>
      <LocalizedName description="Contoso Merge" languagecode="1033" />
    </LocalizedNames>
    <Version>1.0.0.0</Version>
    <Managed>0</Managed>
    <Publisher>
      <UniqueName>Contoso</UniqueName>
      <LocalizedNames>
        <LocalizedName description="Contoso Publisher" languagecode="1033" />
      </LocalizedNames>
      <CustomizationPrefix>con</CustomizationPrefix>
    </Publisher>
    <RootComponents>
      <RootComponent type="372" id="{11111111-1111-1111-1111-111111111111}" />
      <RootComponent type="372" id="{22222222-2222-2222-2222-222222222222}" />
      <RootComponent type="372" id="{33333333-3333-3333-3333-333333333333}" />
      <RootComponent type="372" id="{44444444-4444-4444-4444-444444444444}" />
    </RootComponents>
  </SolutionManifest>
</ImportExportXml>`

const mergeCustomizationsXml = `<?xml version="1.0" encoding="utf-8"?>
<ImportExportXml>
  <connectionreferences>
    <connectionreference connectionreferencelogicalname="con_DvKeep">
      <connectorid>${dataverseConnector}</connectorid>
      <connectionreferencedisplayname>Dataverse Keep</connectionreferencedisplayname>
      <connectionreferenceid>{11111111-1111-1111-1111-111111111111}</connectionreferenceid>
    </connectionreference>
    <connectionreference connectionreferencelogicalname="con_DvDropA">
      <connectorid>${dataverseConnector}</connectorid>
      <connectionreferencedisplayname>Dataverse Drop A</connectionreferencedisplayname>
      <connectionreferenceid>{22222222-2222-2222-2222-222222222222}</connectionreferenceid>
    </connectionreference>
    <connectionreference connectionreferencelogicalname="con_DvDropB">
      <connectorid>${dataverseConnector}</connectorid>
      <connectionreferencedisplayname>Dataverse Drop B</connectionreferencedisplayname>
      <connectionreferenceid>{33333333-3333-3333-3333-333333333333}</connectionreferenceid>
    </connectionreference>
    <connectionreference connectionreferencelogicalname="con_Outlook">
      <connectorid>${outlookConnector}</connectorid>
      <connectionreferencedisplayname>Outlook</connectionreferencedisplayname>
      <connectionreferenceid>{44444444-4444-4444-4444-444444444444}</connectionreferenceid>
    </connectionreference>
  </connectionreferences>
</ImportExportXml>`

const mergeFlowPath =
  'Workflows/MergeFlow-55555555-5555-5555-5555-555555555555.json'

async function mergeZip(): Promise<File> {
  const zip = new JSZip()
  zip.file('solution.xml', mergeSolutionXml)
  zip.file('customizations.xml', mergeCustomizationsXml)
  zip.file(
    mergeFlowPath,
    JSON.stringify({
      properties: {
        connectionReferences: {
          con_DvDropA: { connectionReferenceLogicalName: 'con_DvDropA' },
          con_DvDropB: { connectionReferenceLogicalName: 'con_DvDropB' },
          con_Outlook: { connectionReferenceLogicalName: 'con_Outlook' },
        },
      },
    }),
  )
  const bytes = await zip.generateAsync({ type: 'uint8array' })
  return new File([bytes.buffer as ArrayBuffer], 'Contoso.Merge_1.0.0.0_unmanaged.zip', {
    type: 'application/zip',
  })
}

describe('connection reference merge', () => {
  it('removes merged references and rewrites flows in the rebuilt ZIP', async () => {
    const pkg = await loadSolutionPackage(await mergeZip())
    expect(pkg.connectionReferences).toHaveLength(4)

    const edits = initialEdits(pkg)
    edits.connectionMerges = {
      con_DvDropA: 'con_DvKeep',
      con_DvDropB: 'con_DvKeep',
    }

    const result = await buildEditedPackage(pkg, edits)
    expect(result.mergedConnectionReferences).toBe(2)
    expect(result.rewrittenFlowFiles).toBe(1)

    const output = await JSZip.loadAsync(await result.blob.arrayBuffer())
    const customizations = await output.file('customizations.xml')!.async('string')
    expect(customizations).toContain('con_DvKeep')
    expect(customizations).toContain('con_Outlook')
    expect(customizations).not.toContain('con_DvDropA')
    expect(customizations).not.toContain('con_DvDropB')

    const solution = await output.file('solution.xml')!.async('string')
    expect(solution).toContain('11111111-1111-1111-1111-111111111111')
    expect(solution).toContain('44444444-4444-4444-4444-444444444444')
    expect(solution).not.toContain('22222222-2222-2222-2222-222222222222')
    expect(solution).not.toContain('33333333-3333-3333-3333-333333333333')

    const flow = await output.file(mergeFlowPath)!.async('string')
    expect(flow).toContain('con_DvKeep')
    expect(flow).toContain('con_Outlook')
    expect(flow).not.toContain('con_DvDropA')
    expect(flow).not.toContain('con_DvDropB')

    const settings = generateDeploymentSettings(pkg, edits)
    expect(settings.ConnectionReferences.map((item) => item.LogicalName)).toEqual([
      'con_DvKeep',
      'con_Outlook',
    ])
  })

  it('flattens merge chains to the final survivor', async () => {
    const pkg = await loadSolutionPackage(await mergeZip())
    const edits = initialEdits(pkg)
    edits.connectionMerges = {
      con_DvDropA: 'con_DvDropB',
      con_DvDropB: 'con_DvKeep',
    }

    const result = await buildEditedPackage(pkg, edits)
    expect(result.mergedConnectionReferences).toBe(2)

    const output = await JSZip.loadAsync(await result.blob.arrayBuffer())
    const flow = await output.file(mergeFlowPath)!.async('string')
    expect(flow).toContain('con_DvKeep')
    expect(flow).not.toContain('con_DvDropA')
    expect(flow).not.toContain('con_DvDropB')
  })
})

const dependenciesSolutionXml = `<?xml version="1.0" encoding="utf-8"?>
<ImportExportXml>
  <SolutionManifest>
    <UniqueName>Contoso.Dependencies</UniqueName>
    <LocalizedNames>
      <LocalizedName description="Contoso Dependencies" languagecode="1033" />
    </LocalizedNames>
    <Version>1.0.0.0</Version>
    <Managed>0</Managed>
    <Publisher>
      <UniqueName>Contoso</UniqueName>
      <LocalizedNames>
        <LocalizedName description="Contoso Publisher" languagecode="1033" />
      </LocalizedNames>
      <CustomizationPrefix>con</CustomizationPrefix>
    </Publisher>
    <RootComponents />
    <MissingDependencies>
      <MissingDependency>
        <Required type="1" schemaName="msdyn_workorder" displayName="Work Order" />
        <Dependency type="1" schemaName="con_inspection" displayName="Inspection" />
      </MissingDependency>
    </MissingDependencies>
  </SolutionManifest>
</ImportExportXml>`

describe('missing dependencies', () => {
  it('clears the list but keeps an empty element in the rebuilt ZIP', async () => {
    const zip = new JSZip()
    zip.file('solution.xml', dependenciesSolutionXml)
    const bytes = await zip.generateAsync({ type: 'uint8array' })
    const file = new File(
      [bytes.buffer as ArrayBuffer],
      'Contoso.Dependencies_1.0.0.0_unmanaged.zip',
      { type: 'application/zip' },
    )

    const pkg = await loadSolutionPackage(file)
    expect(pkg.solution.missingDependencies).toHaveLength(1)

    const edits = initialEdits(pkg)
    edits.removeMissingDependencies = true
    const result = await buildEditedPackage(pkg, edits)

    const output = await JSZip.loadAsync(await result.blob.arrayBuffer())
    const solution = await output.file('solution.xml')!.async('string')
    expect(solution).toContain('<MissingDependencies />')
    expect(solution).not.toContain('</MissingDependencies>')
    expect(solution).not.toContain('msdyn_workorder')
  })
})
