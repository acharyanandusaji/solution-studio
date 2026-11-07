import JSZip from 'jszip'
import { describe, expect, it } from 'vitest'
import { buildEditedPackage, initialEdits, loadSolutionPackage } from './package'

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
