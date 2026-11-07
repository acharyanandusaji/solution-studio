import JSZip from 'jszip'

const SOLUTION_XML = `<?xml version="1.0" encoding="utf-8"?>
<ImportExportXml version="9.2.24011.118" generatedBy="SolutionStudioSample" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <SolutionManifest>
    <UniqueName>Contoso.SampleSolution</UniqueName>
    <LocalizedNames>
      <LocalizedName description="Contoso Field Service" languagecode="1033" />
    </LocalizedNames>
    <Descriptions>
      <LocalizedDescription description="Sample solution used to try Solution Studio. Safe to edit and re-import." languagecode="1033" />
    </Descriptions>
    <Version>1.0.0.42</Version>
    <Managed>0</Managed>
    <Publisher>
      <UniqueName>Contoso</UniqueName>
      <LocalizedNames>
        <LocalizedName description="Contoso" languagecode="1033" />
      </LocalizedNames>
      <Descriptions>
        <LocalizedDescription description="Contoso publisher" languagecode="1033" />
      </Descriptions>
      <CustomizationPrefix>con</CustomizationPrefix>
      <CustomizationOptionValuePrefix>24180</CustomizationOptionValuePrefix>
      <EMailAddress>alm@contoso.example</EMailAddress>
      <SupportingWebsiteUrl>https://contoso.example</SupportingWebsiteUrl>
    </Publisher>
    <RootComponents>
      <RootComponent type="1" id="{A5B9C1D2-1111-4A2B-9C3D-000000000001}" behavior="0" />
      <RootComponent type="26" id="{A5B9C1D2-1111-4A2B-9C3D-000000000002}" behavior="0" />
      <RootComponent type="60" id="{A5B9C1D2-1111-4A2B-9C3D-000000000003}" behavior="0" />
      <RootComponent type="61" id="{A5B9C1D2-1111-4A2B-9C3D-000000000004}" behavior="0" />
      <RootComponent type="29" id="{A5B9C1D2-1111-4A2B-9C3D-000000000005}" behavior="0" />
      <RootComponent type="80" id="{A5B9C1D2-1111-4A2B-9C3D-000000000006}" behavior="0" />
      <RootComponent type="372" id="{A5B9C1D2-1111-4A2B-9C3D-000000000007}" behavior="0" />
      <RootComponent type="380" id="{A5B9C1D2-1111-4A2B-9C3D-000000000008}" behavior="0" />
      <RootComponent type="380" id="{A5B9C1D2-1111-4A2B-9C3D-000000000009}" behavior="0" />
      <RootComponent type="380" id="{A5B9C1D2-1111-4A2B-9C3D-000000000010}" behavior="0" />
      <RootComponent type="380" id="{A5B9C1D2-1111-4A2B-9C3D-000000000011}" behavior="0" />
    </RootComponents>
    <MissingDependencies>
      <MissingDependency>
        <Required type="1" schemaName="msdyn_workorder" displayName="Work Order" />
        <Dependency type="1" schemaName="con_inspection" displayName="Inspection" />
      </MissingDependency>
      <MissingDependency>
        <Required type="1" schemaName="msdyn_customerasset" displayName="Customer Asset" />
        <Dependency type="2" schemaName="con_asset_condition" displayName="Asset Condition" parentSchemaName="con_inspection" />
      </MissingDependency>
      <MissingDependency>
        <Required type="371" schemaName="shared_commondataserviceforapps" displayName="Microsoft Dataverse" />
        <Dependency type="372" schemaName="con_dataverse_reference" displayName="Dataverse connection reference" />
      </MissingDependency>
    </MissingDependencies>
  </SolutionManifest>
</ImportExportXml>`

const CUSTOMIZATIONS_XML = `<?xml version="1.0" encoding="utf-8"?>
<ImportExportXml xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <Entities>
    <Entity>
      <Name LocalizedName="Inspection" OriginalName="Inspection">con_inspection</Name>
      <EntityInfo>
        <entity Name="con_inspection">
          <LocalizedNames>
            <LocalizedName description="Inspection" languagecode="1033" />
          </LocalizedNames>
        </entity>
      </EntityInfo>
    </Entity>
  </Entities>
  <environmentvariabledefinitions>
    <environmentvariabledefinition schemaname="con_ApiBaseUrl">
      <displayname default="API Base URL" />
      <description default="Base URL for the Contoso inspection API." />
      <type>100000000</type>
      <defaultvalue>https://api.dev.contoso.example</defaultvalue>
    </environmentvariabledefinition>
    <environmentvariabledefinition schemaname="con_EnableOfflineMode">
      <displayname default="Enable Offline Mode" />
      <description default="Turns offline inspection support on or off." />
      <type>100000002</type>
      <defaultvalue>true</defaultvalue>
    </environmentvariabledefinition>
    <environmentvariabledefinition schemaname="con_FeatureFlags">
      <displayname default="Feature Flags" />
      <description default="JSON feature flags consumed by the model-driven app." />
      <type>100000003</type>
      <defaultvalue>{"newInspectionUi":true,"maxPhotos":5}</defaultvalue>
    </environmentvariabledefinition>
    <environmentvariabledefinition schemaname="con_StorageShare">
      <displayname default="Storage Share" />
      <description default="SharePoint document location used by the inspection app." />
      <type>100000004</type>
      <defaultvalue>/sites/FieldService/Inspections</defaultvalue>
    </environmentvariabledefinition>
    <environmentvariabledefinition schemaname="con_ApiClientSecret">
      <displayname default="API Client Secret" />
      <description default="Secret used by the integration flow. Never exported in plain text." />
      <type>100000005</type>
      <defaultvalue />
    </environmentvariabledefinition>
  </environmentvariabledefinitions>
  <environmentvariablevalues>
    <environmentvariablevalue schemaname="con_ApiBaseUrl">
      <value>https://api.qa.contoso.example</value>
    </environmentvariablevalue>
    <environmentvariablevalue schemaname="con_EnableOfflineMode">
      <value>true</value>
    </environmentvariablevalue>
    <environmentvariablevalue schemaname="con_FeatureFlags">
      <value>{"newInspectionUi":true,"maxPhotos":10}</value>
    </environmentvariablevalue>
  </environmentvariablevalues>
  <connectionreferences>
    <connectionreference connectionreferencelogicalname="con_DataverseReference">
      <connectorid>/providers/Microsoft.PowerApps/apis/shared_commondataserviceforapps</connectorid>
      <connectionreferencedisplayname>Dataverse - Contoso</connectionreferencedisplayname>
      <connectionreferenceid>{B4B7E8E4-2222-4C3D-8E4F-000000000001}</connectionreferenceid>
    </connectionreference>
    <connectionreference connectionreferencelogicalname="con_Office365Reference">
      <connectorid>/providers/Microsoft.PowerApps/apis/shared_office365</connectorid>
      <connectionreferencedisplayname>Office 365 Outlook</connectionreferencedisplayname>
      <connectionreferenceid>{B4B7E8E4-2222-4C3D-8E4F-000000000002}</connectionreferenceid>
    </connectionreference>
  </connectionreferences>
</ImportExportXml>`

const CONTENT_TYPES_XML = `<?xml version="1.0" encoding="utf-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="xml" ContentType="application/octet-stream" />
  <Override PartName="/solution.xml" ContentType="application/octet-stream" />
  <Override PartName="/customizations.xml" ContentType="application/octet-stream" />
</Types>`

const README = `Contoso Field Service
=====================

This is a sample Power Platform solution package generated inside Solution Studio.
It contains environment variables, connection references, root components and
missing dependencies so you can explore every feature without uploading a real
customer solution.

Upload your own unmanaged solution export to work on real metadata.
`

export async function createSampleSolutionFile(): Promise<File> {
  const zip = new JSZip()
  zip.file('[Content_Types].xml', CONTENT_TYPES_XML)
  zip.file('solution.xml', SOLUTION_XML)
  zip.file('customizations.xml', CUSTOMIZATIONS_XML)
  zip.file('README.txt', README)
  zip.file(
    'WebResources/con_inspection.js',
    `// Sample web resource\nfunction openInspection(id) {\n  Xrm.Navigation.openForm({ entityName: 'con_inspection', entityId: id })\n}\n`,
  )
  zip.file(
    'Workflows/InspectionApproval-22222222-3333-4444-5555-666666666666.json',
    JSON.stringify({ name: 'Inspection Approval', category: 5, state: 'activated' }, null, 2),
  )
  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' })
  return new File([blob], 'Contoso.SampleSolution_1.0.0.42_unmanaged.zip', {
    type: 'application/zip',
    lastModified: Date.now(),
  })
}
