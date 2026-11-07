import { useRef, useState, type ReactNode } from 'react'
import {
  ArrowRight,
  Boxes,
  CheckCircle2,
  FileArchive,
  FileCode2,
  LockKeyhole,
  PackageCheck,
  ShieldCheck,
  Scale,
  SlidersHorizontal,
  Sparkles,
  UploadCloud,
  Variable,
  Workflow,
} from 'lucide-react'
import { cx } from '../lib/format'
import { Button } from './ui'

export function UploadScreen({
  onFile,
  onSample,
  sampleLoading,
  error,
}: {
  onFile: (file: File) => void
  onSample: () => void
  sampleLoading: boolean
  error?: string
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)

  const pick = (file: File | undefined) => {
    if (file) onFile(file)
  }

  return (
    <div className="upload-screen">
      <div className="upload-ambient" aria-hidden="true">
        <div className="orb orb-one" />
        <div className="orb orb-two" />
        <div className="grid-glow" />
      </div>

      <header className="upload-header">
        <div className="brand">
          <span className="brand-mark">
            <Boxes size={22} />
          </span>
          <span className="brand-copy">
            <strong>Solution Studio</strong>
            <span>Power Platform ALM utility</span>
          </span>
        </div>
        <div className="upload-header-meta">
          <span className="header-pill">
            <ShieldCheck size={14} /> Local-first
          </span>
          <span className="header-pill hide-sm">
            <Scale size={14} /> Open source · MIT
          </span>
        </div>
      </header>

      <main className="upload-main">
        <section className="hero-copy">
          <div className="eyebrow">
            <span className="eyebrow-dot" />
            Solution ZIP workbench
          </div>
          <h1>
            Ship Power Platform
            <br />
            solutions <span className="gradient-text">with confidence.</span>
          </h1>
          <p className="hero-lead">
            Inspect, fix and repackage solution ZIPs entirely in your browser. Update versions, clean up
            missing dependencies, tune environment variables and export deployment settings — without
            uploading a single byte.
          </p>

          <ul className="hero-points">
            <li>
              <CheckCircle2 size={17} />
              Edit <code>solution.xml</code> and <code>customizations.xml</code> safely
            </li>
            <li>
              <CheckCircle2 size={17} />
              Manage environment variables, connections and dependencies
            </li>
            <li>
              <CheckCircle2 size={17} />
              Download a ready-to-import ZIP with every change applied
            </li>
          </ul>

          <div className="privacy-strip">
            <LockKeyhole size={18} />
            <div>
              <strong>Your solution never leaves this device.</strong>
              <span>All extraction, XML editing and ZIP rebuilding happens locally in your browser.</span>
            </div>
          </div>
        </section>

        <section className="upload-panel-wrap">
          <div className="upload-panel">
            <div className="upload-panel-head">
              <div>
                <span className="panel-eyebrow">Start here</span>
                <h2>Upload a solution package</h2>
              </div>
              <FileArchive size={22} className="muted-icon" />
            </div>

            <div
              className={cx('dropzone', dragging && 'is-dragging')}
              onDragEnter={(event) => {
                event.preventDefault()
                setDragging(true)
              }}
              onDragOver={(event) => {
                event.preventDefault()
                setDragging(true)
              }}
              onDragLeave={(event) => {
                if (event.currentTarget === event.target) setDragging(false)
              }}
              onDrop={(event) => {
                event.preventDefault()
                setDragging(false)
                pick(event.dataTransfer.files[0])
              }}
            >
              <input
                ref={inputRef}
                type="file"
                accept=".zip,application/zip,application/x-zip-compressed"
                hidden
                onChange={(event) => {
                  pick(event.target.files?.[0])
                  event.target.value = ''
                }}
              />
              <div className="dropzone-icon">
                <UploadCloud size={30} />
              </div>
              <h3>{dragging ? 'Drop it — we have it from here' : 'Drop your solution ZIP here'}</h3>
              <p>Usually an unmanaged solution exported from Power Apps. Managed packages work too.</p>
              <div className="dropzone-actions">
                <Button
                  variant="primary"
                  size="lg"
                  icon={<FileArchive size={17} />}
                  onClick={() => inputRef.current?.click()}
                >
                  Choose ZIP file
                </Button>
                <Button
                  variant="ghost"
                  size="lg"
                  icon={<Sparkles size={16} />}
                  loading={sampleLoading}
                  onClick={onSample}
                >
                  Try a sample
                </Button>
              </div>
              <div className="dropzone-foot">
                <span className="format-pill">.zip</span>
                <span>Processed locally</span>
                <span className="dot-sep" />
                <span>Nothing uploaded</span>
              </div>
            </div>

            {error ? <div className="upload-error">{error}</div> : null}

            <div className="upload-panel-foot">
              <div className="mini-step">
                <span>1</span> Upload
              </div>
              <ArrowRight size={14} />
              <div className="mini-step">
                <span>2</span> Review &amp; edit
              </div>
              <ArrowRight size={14} />
              <div className="mini-step">
                <span>3</span> Download ZIP
              </div>
            </div>
          </div>

          <div className="upload-side-note">
            <Workflow size={18} />
            <p>
              <strong>Built for ALM admins.</strong> Pair the rebuilt ZIP with a generated{' '}
              <code>DeploymentSettings.json</code> for Dev, QA, UAT and Production.
            </p>
          </div>
        </section>
      </main>

      <section className="feature-row">
        <FeatureCard
          icon={<SlidersHorizontal size={20} />}
          title="Metadata control"
          copy="Version bumping, managed flag, publisher insights and missing dependency cleanup — all visible before you download."
          accent="cyan"
        />
        <FeatureCard
          icon={<Variable size={20} />}
          title="Environment variables"
          copy="See OOB and custom variable definitions, edit current values, and carry them into DeploymentSettings.json."
          accent="violet"
        />
        <FeatureCard
          icon={<PackageCheck size={20} />}
          title="Safe repackaging"
          copy="Every untouched file keeps its original content. Validate, review the change set and download a clean solution ZIP."
          accent="emerald"
        />
      </section>

      <footer className="upload-footer">
        <span>
          <Boxes size={14} /> Solution Studio
        </span>
        <span>Built with React + TypeScript · Runs 100% in your browser</span>
        <span className="footer-note">
          <FileCode2 size={14} /> XML-aware · ZIP-preserving
        </span>
      </footer>
    </div>
  )
}

function FeatureCard({
  icon,
  title,
  copy,
  accent,
}: {
  icon: ReactNode
  title: string
  copy: string
  accent: string
}) {
  return (
    <article className={cx('feature-card', `feature-${accent}`)}>
      <div className="feature-icon">{icon}</div>
      <h3>{title}</h3>
      <p>{copy}</p>
    </article>
  )
}
