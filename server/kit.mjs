/**
 * What this laptop's Claude Code can actually do: the slash commands and skills installed
 * on it, read from disk at request time.
 *
 * Deliberately not a report file. Commands are edited by hand between sessions, so a
 * snapshot would be stale the moment it was written, and unlike Jira or GitHub the source
 * is a local directory that costs nothing to walk.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const HOME = os.homedir()
const CLAUDE = path.join(HOME, '.claude')

/** Only these roots are ever read, so a bug here cannot walk the whole disk. */
const ROOTS = {
  personalCommands: path.join(CLAUDE, 'commands'),
  personalSkills: path.join(CLAUDE, 'skills'),
  pluginCache: path.join(CLAUDE, 'plugins', 'cache'),
}

const MAX_DEPTH = 6

function walk(dir, match, depth = 0) {
  if (depth > MAX_DEPTH || !fs.existsSync(dir)) return []
  const out = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const at = path.join(dir, entry.name)
    if (entry.isDirectory()) out.push(...walk(at, match, depth + 1))
    else if (entry.isFile() && match(entry.name)) out.push(at)
  }
  return out
}

/**
 * The `---` block at the top of a command or skill file. Hand-rolled rather than pulling in
 * a YAML parser: the fields used here are flat `key: value` lines, and a malformed block
 * should cost that file's metadata, not the request.
 */
function frontmatter(text) {
  if (!text.startsWith('---')) return { meta: {}, body: text }
  const end = text.indexOf('\n---', 3)
  if (end === -1) return { meta: {}, body: text }
  const meta = {}
  const lines = text.slice(3, end).split('\n')
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]
    const at = line.indexOf(':')
    if (at === -1 || /^\s/.test(line)) continue
    const key = line.slice(0, at).trim()
    if (!key) continue
    let value = line.slice(at + 1).trim().replace(/^["']|["']$/g, '')

    // A folded or literal block (`description: >`) puts the text on the indented lines
    // that follow; without this the value reads as the fold marker itself.
    if (/^[>|][-+]?$/.test(value)) {
      const block = []
      while (i + 1 < lines.length && /^\s+\S/.test(lines[i + 1])) {
        block.push(lines[i + 1].trim())
        i += 1
      }
      value = block.join(' ')
    }
    meta[key] = value
  }
  return { meta, body: text.slice(end + 4) }
}

const list = (value) =>
  value
    ? value
        .split(',')
        .map((part) => part.trim())
        .filter(Boolean)
    : []

/** First non-empty prose line, for entries whose frontmatter carries no description. */
function firstLine(body) {
  for (const line of body.split('\n')) {
    const trimmed = line.trim()
    if (trimmed && !trimmed.startsWith('#') && !trimmed.startsWith('```')) {
      return trimmed.length > 200 ? `${trimmed.slice(0, 200)}…` : trimmed
    }
  }
  return ''
}

function read(file) {
  try {
    const text = fs.readFileSync(file, 'utf8')
    const { meta, body } = frontmatter(text)
    return { meta, body, lines: text.split('\n').length, modified: fs.statSync(file).mtime.toISOString() }
  } catch {
    return null
  }
}

/** `foo/bar.md` under a commands root is invoked as `/foo:bar`. */
const commandName = (root, file) =>
  path
    .relative(root, file)
    .replace(/\.md$/, '')
    .split(path.sep)
    .join(':')

function commandsIn(root, source, plugin) {
  return walk(root, (name) => name.endsWith('.md')).flatMap((file) => {
    const parsed = read(file)
    if (!parsed) return []
    const name = commandName(root, file)
    return [
      {
        kind: 'command',
        name: plugin ? `${plugin}:${name}` : name,
        source,
        plugin: plugin ?? null,
        description: parsed.meta.description || firstLine(parsed.body),
        argumentHint: parsed.meta['argument-hint'] ?? null,
        tools: list(parsed.meta['allowed-tools']),
        model: parsed.meta.model ?? null,
        path: file.replace(HOME, '~'),
        lines: parsed.lines,
        modified: parsed.modified,
      },
    ]
  })
}

/**
 * `<root>/<name>/SKILL.md` only. A recursive walk also finds the copies a plugin vendors
 * inside itself, which are not installed skills and show up as duplicates.
 */
function skillFiles(root) {
  if (!fs.existsSync(root)) return []
  return fs
    .readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(root, entry.name, 'SKILL.md'))
    .filter((file) => fs.existsSync(file))
}

function skillsIn(root, source, plugin) {
  return skillFiles(root).flatMap((file) => {
    const parsed = read(file)
    if (!parsed) return []
    const name = parsed.meta.name || path.basename(path.dirname(file))
    return [
      {
        kind: 'skill',
        name: plugin ? `${plugin}:${name}` : name,
        source,
        plugin: plugin ?? null,
        description: parsed.meta.description || firstLine(parsed.body),
        argumentHint: null,
        tools: list(parsed.meta['allowed-tools']),
        model: parsed.meta.model ?? null,
        path: file.replace(HOME, '~'),
        lines: parsed.lines,
        modified: parsed.modified,
      },
    ]
  })
}

/**
 * Where each installed plugin's files actually are.
 *
 * The cache layout (`cache/<marketplace>/<plugin>/<version>`) only holds plugins fetched
 * from a remote marketplace. A marketplace whose source is a local directory — a checkout,
 * or an org-managed seed — is installed *in place*, so its plugins never appear in the
 * cache and guessing the layout silently loses them. The manifests say where to look, so
 * ask them: `installed_plugins.json` for the install path, `known_marketplaces.json` for
 * the fallback, and `settings.json` for whether the plugin is switched on at all.
 */
function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch {
    return null
  }
}

function pluginRoots() {
  const installed = readJson(path.join(CLAUDE, 'plugins', 'installed_plugins.json'))?.plugins ?? {}
  const markets = readJson(path.join(CLAUDE, 'plugins', 'known_marketplaces.json')) ?? {}
  const enabled = readJson(path.join(CLAUDE, 'settings.json'))?.enabledPlugins ?? {}

  const roots = []
  for (const [key, installs] of Object.entries(installed)) {
    if (enabled[key] === false) continue
    const [plugin, marketplace] = key.split('@')
    if (!plugin) continue

    const candidates = [
      ...installs.map((install) => install.installPath).filter(Boolean),
      // A local-directory marketplace keeps its plugins beside its own manifest.
      ...['', 'plugins'].map((mid) =>
        path.join(markets[marketplace]?.installLocation ?? '', mid, plugin),
      ),
    ]
    const dir = candidates.find(
      (candidate) => candidate && fs.existsSync(candidate) && fs.statSync(candidate).isDirectory(),
    )
    if (!dir) continue

    roots.push({
      marketplace: marketplace ?? 'unknown',
      plugin,
      version: installs[0]?.version ?? 'unknown',
      dir,
    })
  }
  return roots
}

export function readKit({ projectDir } = {}) {
  const entries = [
    ...commandsIn(ROOTS.personalCommands, 'personal'),
    ...skillsIn(ROOTS.personalSkills, 'personal'),
  ]

  if (projectDir) {
    entries.push(
      ...commandsIn(path.join(projectDir, '.claude', 'commands'), 'project'),
      ...skillsIn(path.join(projectDir, '.claude', 'skills'), 'project'),
    )
  }

  const plugins = []
  for (const root of pluginRoots()) {
    const commands = commandsIn(path.join(root.dir, 'commands'), 'plugin', root.plugin)
    const skills = skillsIn(path.join(root.dir, 'skills'), 'plugin', root.plugin)
    if (commands.length === 0 && skills.length === 0) continue
    plugins.push({
      name: root.plugin,
      marketplace: root.marketplace,
      version: root.version,
      commands: commands.length,
      skills: skills.length,
    })
    entries.push(...commands, ...skills)
  }

  // A plugin may ship a command and a skill under one name — that is two entries, not a
  // duplicate — so the key includes the kind.
  const seen = new Set()
  const unique = entries.filter((entry) => {
    const key = `${entry.kind}:${entry.source}:${entry.name}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  unique.sort((a, b) => a.name.localeCompare(b.name))

  return {
    generatedAt: new Date().toISOString(),
    entries: unique,
    plugins: plugins.sort((a, b) => a.name.localeCompare(b.name)),
  }
}
