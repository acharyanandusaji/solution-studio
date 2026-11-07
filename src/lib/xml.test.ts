import { describe, expect, it } from 'vitest'
import {
  bumpVersion,
  isValidVersion,
  parseConnectionReferences,
  parseEnvironmentVariables,
  parseSolutionXml,
  removeMissingDependencies,
  setEnvironmentVariableValue,
  setManagedFlag,
  setSolutionVersion,
} from './xml'

const solutionXml = `<?xml version="1.0" encoding="utf-8"?>
<ImportExportXml>
  <SolutionManifest>
    <UniqueName>Contoso.Sample</UniqueName>
    <LocalizedNames>
      <LocalizedName description="Contoso Sample" languagecode="1033" />
    </LocalizedNames>
    <Descriptions>
      <LocalizedDescription description="A sample solution." languagecode="1033" />
    </Descriptions>
    <Version>1.2.3.4</Version>
    <Managed>0</Managed>
    <Publisher>
      <UniqueName>Contoso</UniqueName>
      <LocalizedNames>
        <LocalizedName description="Contoso Publisher" languagecode="1033" />
      </LocalizedNames>
      <CustomizationPrefix>con</CustomizationPrefix>
    </Publisher>
    <RootComponents>
      <RootComponent type="1" id="{11111111-1111-1111-1111-111111111111}" />
    </RootComponents>
    <MissingDependencies>
      <MissingDependency id="dep-1">
        <Required type="1" schemaName="msdyn_workorder" displayName="Work Order" />
        <Dependency type="2" schemaName="con_inspection" displayName="Inspection" parentSchemaName="con_parent" />
      </MissingDependency>
    </MissingDependencies>
  </SolutionManifest>
</ImportExportXml>`

const customizationsXml = `<?xml version="1.0" encoding="utf-8"?>
<ImportExportXml>
  <environmentvariabledefinitions>
    <environmentvariabledefinition schemaname="con_Url">
      <displayname default="Service URL" />
      <description default="Base URL." />
      <type>100000000</type>
      <defaultvalue>https://dev.example</defaultvalue>
    </environmentvariabledefinition>
    <environmentvariabledefinition schemaname="con_Enabled">
      <displayname default="Enabled" />
      <type>100000002</type>
      <defaultvalue>true</defaultvalue>
    </environmentvariabledefinition>
    <environmentvariabledefinition schemaname="con_Secret">
      <displayname default="Secret" />
      <type>100000005</type>
      <defaultvalue />
    </environmentvariabledefinition>
  </environmentvariabledefinitions>
  <environmentvariablevalues>
    <environmentvariablevalue schemaname="con_Url">
      <value>https://qa.example</value>
    </environmentvariablevalue>
  </environmentvariablevalues>
  <connectionreferences>
    <connectionreference connectionreferencelogicalname="con_Dataverse">
      <connectorid>/providers/Microsoft.PowerApps/apis/shared_commondataserviceforapps</connectorid>
      <connectionreferencedisplayname>Dataverse</connectionreferencedisplayname>
      <connectionreferenceid>{22222222-2222-2222-2222-222222222222}</connectionreferenceid>
    </connectionreference>
  </connectionreferences>
</ImportExportXml>`

describe('parseSolutionXml', () => {
  it('reads the manifest metadata', () => {
    const info = parseSolutionXml(solutionXml)
    expect(info.uniqueName).toBe('Contoso.Sample')
    expect(info.displayName).toBe('Contoso Sample')
    expect(info.description).toBe('A sample solution.')
    expect(info.version).toBe('1.2.3.4')
    expect(info.managed).toBe(false)
    expect(info.publisher.displayName).toBe('Contoso Publisher')
    expect(info.publisher.prefix).toBe('con')
    expect(info.rootComponents).toHaveLength(1)
  })

  it('reads missing dependencies', () => {
    const info = parseSolutionXml(solutionXml)
    expect(info.hasMissingDependenciesNode).toBe(true)
    expect(info.missingDependencies).toHaveLength(1)
    expect(info.missingDependencies[0].required.schemaName).toBe('msdyn_workorder')
    expect(info.missingDependencies[0].dependency.parentSchemaName).toBe('con_parent')
  })
})

describe('solution.xml edits', () => {
  it('writes version and managed flag without touching the rest', () => {
    const updated = setManagedFlag(setSolutionVersion(solutionXml, '2.3.4.5'), true)
    expect(updated).toContain('<Version>2.3.4.5</Version>')
    expect(updated).toContain('<Managed>1</Managed>')
    expect(updated).toContain('<UniqueName>Contoso.Sample</UniqueName>')
  })

  it('adds a managed element when one is absent', () => {
    const xml = solutionXml.replace(/\s*<Managed>0<\/Managed>/, '')
    expect(setManagedFlag(xml, true)).toContain('<Managed>1</Managed>')
  })

  it('removes the MissingDependencies block and its indentation', () => {
    const updated = removeMissingDependencies(solutionXml)
    expect(updated).not.toContain('MissingDependencies')
    expect(updated).not.toContain('msdyn_workorder')
    expect(updated).toContain('</SolutionManifest>')
  })
})

describe('environment variables', () => {
  it('reads definitions, explicit values and secrets', () => {
    const variables = parseEnvironmentVariables(customizationsXml)
    expect(variables).toHaveLength(3)
    const url = variables.find((item) => item.schemaName === 'con_Url')!
    expect(url.displayName).toBe('Service URL')
    expect(url.currentValue).toBe('https://qa.example')
    expect(url.explicitValue).toBe(true)
    const enabled = variables.find((item) => item.schemaName === 'con_Enabled')!
    expect(enabled.currentValue).toBe('true')
    expect(enabled.explicitValue).toBe(false)
    expect(variables.find((item) => item.schemaName === 'con_Secret')!.secret).toBe(true)
  })

  it('updates an existing value and escapes XML characters', () => {
    const updated = setEnvironmentVariableValue(
      customizationsXml,
      'con_Url',
      'https://example.test/?a=1&b=<2>',
    )
    expect(updated).toContain('<value>https://example.test/?a=1&amp;b=&lt;2&gt;</value>')
    expect(updated).not.toContain('https://qa.example')
  })

  it('adds a value row when the variable has no explicit value', () => {
    const updated = setEnvironmentVariableValue(customizationsXml, 'con_Enabled', 'false')
    expect(updated).toContain('<environmentvariablevalue schemaname="con_Enabled">')
    expect(updated).toContain('<value>false</value>')
  })
})

describe('connection references', () => {
  it('reads logical name, connector and display name', () => {
    const references = parseConnectionReferences(customizationsXml)
    expect(references).toHaveLength(1)
    expect(references[0].logicalName).toBe('con_Dataverse')
    expect(references[0].displayName).toBe('Dataverse')
    expect(references[0].connectorId).toContain('shared_commondataserviceforapps')
  })
})

describe('version helpers', () => {
  it('validates four numeric parts up to 65535', () => {
    expect(isValidVersion('1.0.0.0')).toBe(true)
    expect(isValidVersion('65535.65535.65535.65535')).toBe(true)
    expect(isValidVersion('65536.0.0.0')).toBe(false)
    expect(isValidVersion('1.0.0')).toBe(false)
    expect(isValidVersion('1.0.0.a')).toBe(false)
  })

  it('bumps a part and resets the following parts', () => {
    expect(bumpVersion('1.2.3.4', 1)).toBe('1.3.0.0')
    expect(bumpVersion('1.2.3.4', 3)).toBe('1.2.3.5')
    expect(bumpVersion('1.2.3.4', 0)).toBe('2.0.0.0')
  })
})
