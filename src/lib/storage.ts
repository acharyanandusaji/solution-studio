import type { DeploymentProfile, VersionHistoryEntry } from '../types'

const HISTORY_KEY = 'solution-studio:version-history:v1'
const PROFILE_KEY = 'solution-studio:deployment-profiles:v1'
const HISTORY_LIMIT = 60

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) return fallback
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // localStorage can be unavailable or full. History is a convenience, never critical.
  }
}

export function getVersionHistory(uniqueName: string): VersionHistoryEntry[] {
  const all = readJson<VersionHistoryEntry[]>(HISTORY_KEY, [])
  return all
    .filter((entry) => entry.solutionUniqueName === uniqueName)
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
}

export function addVersionHistory(entry: VersionHistoryEntry): void {
  const all = readJson<VersionHistoryEntry[]>(HISTORY_KEY, [])
  const next = [entry, ...all.filter((item) => item.id !== entry.id)].slice(0, HISTORY_LIMIT)
  writeJson(HISTORY_KEY, next)
}

export function clearVersionHistory(uniqueName: string): void {
  const all = readJson<VersionHistoryEntry[]>(HISTORY_KEY, [])
  writeJson(
    HISTORY_KEY,
    all.filter((entry) => entry.solutionUniqueName !== uniqueName),
  )
}

export function getProfiles(uniqueName: string): DeploymentProfile[] {
  const all = readJson<Record<string, DeploymentProfile[]>>(PROFILE_KEY, {})
  return all[uniqueName] ?? []
}

export function saveProfile(uniqueName: string, profile: DeploymentProfile): DeploymentProfile[] {
  const all = readJson<Record<string, DeploymentProfile[]>>(PROFILE_KEY, {})
  const existing = all[uniqueName] ?? []
  const next = [profile, ...existing.filter((item) => item.id !== profile.id)]
  all[uniqueName] = next
  writeJson(PROFILE_KEY, all)
  return next
}

export function deleteProfile(uniqueName: string, profileId: string): DeploymentProfile[] {
  const all = readJson<Record<string, DeploymentProfile[]>>(PROFILE_KEY, {})
  const next = (all[uniqueName] ?? []).filter((item) => item.id !== profileId)
  all[uniqueName] = next
  writeJson(PROFILE_KEY, all)
  return next
}
