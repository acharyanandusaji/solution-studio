import { useMemo, useState } from 'react'
import {
  Archive,
  Braces,
  CheckCircle2,
  Download,
  Eye,
  FileArchive,
  FileCode2,
  FileJson,
  FileText,
  FolderArchive,
  Image,
  Search,
  ShieldCheck,
  TriangleAlert,
  XCircle,
} from 'lucide-react'
import type { SolutionPackage, ZipFileInfo } from '../types'
import { formatBytes, formatDate } from '../lib/format'
import {
  downloadBlob,
  isPreviewable,
  previewZipEntry,
  verifyZipIntegrity,
} from '../lib/package'
import {
  Badge,
  Button,
  CopyButton,
  EmptyState,
  Modal,
  SearchInput,
  SectionCard,
} from './ui'

export function FilesTab({
  pkg,
  onNotify,
}: {
  pkg: SolutionPackage
  onNotify: (kind: 'success' | 'error' | 'info', title: string, detail?: string) => void
}) {
  const [search, setSearch] = useState('')
  const [extension, setExtension] = useState('all')
  const [verifying, setVerifying] = useState(false)
  const [integrity, setIntegrity] = useState<{
    valid: boolean
    entries: number
    error?: string
  } | null>(null)
  const [preview, setPreview] = useState<{
    file: ZipFileInfo
    loading: boolean
    text?: string
    binary?: boolean
    truncated?: boolean
    error?: string
  } | null>(null)

  const extensions = useMemo(
    () =>
      Array.from(new Set(pkg.files.map((file) => file.extension || 'other'))).sort((a, b) =>
        a.localeCompare(b),
      ),
    [pkg.files],
  )

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase()
    return pkg.files.filter((file) => {
      if (extension !== 'all' && (file.extension || 'other') !== extension) return false
      return !query || file.path.toLowerCase().includes(query)
    })
  }, [pkg.files, search, extension])

  const totalSize = pkg.files.reduce((sum, file) => sum + file.size, 0)
  const requiredFiles = ['solution.xml', 'customizations.xml', '[Content_Types].xml']

  const verify = async () => {
    setVerifying(true)
    setIntegrity(null)
    const result = await verifyZipIntegrity(pkg)
    setIntegrity(result)
    setVerifying(false)
    if (result.valid) {
      onNotify('success', 'ZIP integrity verified', `${result.entries} entries passed CRC32 checks.`)
    } else {
      onNotify('error', 'ZIP integrity check failed', result.error)
    }
  }

  const openPreview = async (file: ZipFileInfo) => {
    if (!isPreviewable(file)) {
      setPreview({ file, loading: false, binary: true })
      return
    }
    setPreview({ file, loading: true })
    try {
      const result = await previewZipEntry(pkg, file.path)
      setPreview({
        file,
        loading: false,
        text: result.text,
        binary: result.binary,
        truncated: result.truncated,
      })
    } catch (error) {
      setPreview({ file, loading: false, error: (error as Error).message })
    }
  }

  const downloadSingle = async (path: string) => {
    const entry = pkg.zip.file(path)
    if (!entry) return
    const blob = await entry.async('blob')
    downloadBlob(blob, path.split('/').pop() ?? 'file')
    onNotify('success', 'File extracted', path)
  }

  return (
    <div className="tab-stack">
      <div className="tab-heading">
        <div>
          <h1>ZIP explorer</h1>
          <p>
            Inspect every entry inside the original solution package. Nothing here is modified unless you edit it.
          </p>
        </div>
        <div className="heading-actions">
          <Button
            variant="secondary"
            size="sm"
            icon={<ShieldCheck size={15} />}
            loading={verifying}
            onClick={verify}
          >
            Verify ZIP
          </Button>
          <Button
            variant="ghost"
            size="sm"
            icon={<Download size={15} />}
            onClick={() => {
              downloadBlob(pkg.sourceFile, pkg.fileName)
              onNotify('success', 'Original ZIP downloaded', pkg.fileName)
            }}
          >
            Original backup
          </Button>
        </div>
      </div>

      {integrity ? (
        <div className={`notice ${integrity.valid ? 'notice-success' : 'notice-danger'}`}>
          {integrity.valid ? <CheckCircle2 size={19} /> : <XCircle size={19} />}
          <div>
            <strong>
              {integrity.valid ? 'Archive integrity confirmed' : 'Archive integrity check failed'}
            </strong>
            <p>
              {integrity.valid
                ? `${integrity.entries} files passed CRC32 validation. The source ZIP is readable and complete.`
                : integrity.error}
            </p>
          </div>
        </div>
      ) : null}

      <div className="zip-summary">
        <div className="zip-summary-main">
          <div className="zip-summary-icon">
            <FolderArchive size={24} />
          </div>
          <div>
            <strong>{pkg.fileName}</strong>
            <span>
              {pkg.files.length} files · {formatBytes(totalSize)} uncompressed · {formatBytes(pkg.fileSize)} ZIP
            </span>
          </div>
        </div>
        <div className="required-files">
          {requiredFiles.map((name) => {
            const present = pkg.files.some((file) => file.path.toLowerCase().endsWith(name.toLowerCase()))
            return (
              <span className={`required-file ${present ? 'is-present' : 'is-optional'}`} key={name}>
                {present ? <CheckCircle2 size={13} /> : <TriangleAlert size={13} />} {name}
              </span>
            )
          })}
        </div>
      </div>

      <SectionCard
        title="Package contents"
        description="Search the archive, preview text files, or extract a single entry."
        icon={<FileArchive size={18} />}
        bodyClassName="no-pad"
      >
        <div className="table-toolbar">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Search file paths…"
            ariaLabel="Search ZIP contents"
          />
          <div className="toolbar-controls">
            <select
              className="select-input"
              value={extension}
              onChange={(event) => setExtension(event.target.value)}
              aria-label="Filter by file extension"
            >
              <option value="all">All file types</option>
              {extensions.map((ext) => (
                <option value={ext} key={ext}>
                  .{ext}
                </option>
              ))}
            </select>
            <Badge tone="neutral">{filtered.length} shown</Badge>
          </div>
        </div>

        {filtered.length === 0 ? (
          <EmptyState
            icon={<Search size={22} />}
            title="No files match"
            description="Try a different search or file type."
            action={
              <Button
                size="sm"
                onClick={() => {
                  setSearch('')
                  setExtension('all')
                }}
              >
                Clear filters
              </Button>
            }
          />
        ) : (
          <div className="table-wrap">
            <table className="data-table file-table">
              <thead>
                <tr>
                  <th>File</th>
                  <th>Type</th>
                  <th>Size</th>
                  <th>Modified</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((file) => {
                  const Icon = iconFor(file)
                  return (
                    <tr key={file.path} className="clickable-row" onClick={() => void openPreview(file)}>
                      <td>
                        <div className="file-cell">
                          <span className="file-type-icon">
                            <Icon size={16} />
                          </span>
                          <span className="file-path" title={file.path}>
                            {file.path}
                          </span>
                        </div>
                      </td>
                      <td>
                        <Badge tone="neutral">{file.extension ? `.${file.extension}` : 'file'}</Badge>
                      </td>
                      <td className="mono-cell">{formatBytes(file.size)}</td>
                      <td className="muted-cell">{formatDate(file.date)}</td>
                      <td className="row-actions-cell">
                        <Button
                          size="sm"
                          variant="ghost"
                          icon={<Eye size={14} />}
                          onClick={(event) => {
                            event.stopPropagation()
                            void openPreview(file)
                          }}
                        >
                          {isPreviewable(file) ? 'Preview' : 'Info'}
                        </Button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      <div className="info-footnote">
        <Archive size={15} />
        <span>
          Original file contents are copied into the rebuilt ZIP. Only{' '}
          <code>solution.xml</code> and <code>customizations.xml</code> are rewritten.
        </span>
      </div>

      <Modal
        open={preview !== null}
        onClose={() => setPreview(null)}
        title={preview?.file.path.split('/').pop() ?? 'File preview'}
        description={
          preview ? (
            <span className="modal-path">
              {preview.file.path} · {formatBytes(preview.file.size)}
            </span>
          ) : undefined
        }
        size="xl"
        footer={
          preview ? (
            <>
              <span className="modal-footer-note">
                {preview.truncated ? 'Preview truncated to 256 KB.' : 'Preview is read-only.'}
              </span>
              {preview.text !== undefined ? (
                <CopyButton text={preview.text} onCopied={(ok) => onNotify(ok ? 'success' : 'error', ok ? 'Copied file contents' : 'Copy failed')} />
              ) : null}
              <Button
                variant="secondary"
                size="sm"
                icon={<Download size={14} />}
                onClick={() => void downloadSingle(preview.file.path)}
              >
                Extract file
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setPreview(null)}>
                Close
              </Button>
            </>
          ) : null
        }
      >
        {preview?.loading ? (
          <div className="preview-loading">Reading file…</div>
        ) : preview?.error ? (
          <div className="notice notice-danger">
            <XCircle size={18} />
            <div>
              <strong>Preview unavailable</strong>
              <p>{preview.error}</p>
            </div>
          </div>
        ) : preview?.binary ? (
          <div className="binary-preview">
            <Image size={30} />
            <strong>Binary file</strong>
            <p>This file type cannot be shown as text. Extract it to inspect it locally.</p>
          </div>
        ) : (
          <pre className="text-preview" tabIndex={0}>
            <code>{preview?.text}</code>
          </pre>
        )}
      </Modal>
    </div>
  )
}

function iconFor(file: ZipFileInfo) {
  switch (file.extension) {
    case 'xml':
      return FileCode2
    case 'json':
      return FileJson
    case 'js':
    case 'ts':
      return Braces
    case 'png':
    case 'jpg':
    case 'jpeg':
    case 'gif':
    case 'svg':
    case 'webp':
      return Image
    case 'zip':
      return FileArchive
    case 'txt':
    case 'md':
      return FileText
    default:
      return FileText
  }
}
