#!/usr/bin/env node
// skills 仓库校验器 —— spec/SKILL-SPEC.md 的机器实现。
//
// 用法：
//   node scripts/validate-skills.mjs            # 人读输出，有 error 时退出码 1
//   node scripts/validate-skills.mjs --json     # 机读输出（CI 汇总用）
//   node scripts/validate-skills.mjs --strict   # 把 warning 也当失败
//
// 设计原则：只依赖 Node 内置模块，不需要 pnpm install，CI 里跑得飞快。

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join, resolve, dirname, relative, extname } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const args = new Set(process.argv.slice(2))
const asJson = args.has('--json')
const strict = args.has('--strict')

const config = JSON.parse(readFileSync(join(repoRoot, 'skills.config.json'), 'utf8'))
const limits = config.limits
const scopes = config.scopes

const errors = []
const warnings = []
const info = []

const err = (file, message) => errors.push({ file, message })
const warn = (file, message) => warnings.push({ file, message })

const rel = (p) => relative(repoRoot, p).split('\\').join('/')
const isDir = (p) => existsSync(p) && statSync(p).isDirectory()
const isFile = (p) => existsSync(p) && statSync(p).isFile()
const byteSize = (p) => statSync(p).size

const NAME_RE = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/
const SEMVER_RE = /^\d+\.\d+\.\d+$/
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const REPO_RE = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/
const ALLOWED_KEYS = new Set([
  'name',
  'description',
  'scope',
  'version',
  'updated',
  'tags',
  'applies_to',
  'requires',
  'license',
  'source',
  'entry',
  'disable-model-invocation',
  'metadata',
])
const REQUIRED_KEYS = ['name', 'description', 'scope', 'version', 'updated', 'tags']
const ALLOWED_SUBDIRS = new Set(['references', 'scripts', 'agents', 'assets', 'templates'])

/** 极简 frontmatter 解析器：只支持本规范允许的 YAML 子集（标量 / 行内数组 / 块数组 / 一层以上的映射）。 */
function parseFrontmatter(text) {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/)
  if (!m) return null

  const unquote = (s) => s.trim().replace(/^['"]|['"]$/g, '')
  const lines = m[1].split(/\r?\n/).filter((l) => l.trim() && !l.trim().startsWith('#'))
  const data = {}
  const stack = [{ indent: -1, node: data }]

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const indent = line.length - line.trimStart().length
    const content = line.trim()

    while (stack.length > 1 && indent <= stack[stack.length - 1].indent) stack.pop()
    const top = stack[stack.length - 1]

    if (content.startsWith('- ')) {
      if (!Array.isArray(top.node)) return { __invalid: content }
      top.node.push(unquote(content.slice(2)))
      continue
    }

    const kv = content.match(/^([A-Za-z_][A-Za-z0-9_-]*):\s*(.*)$/)
    if (!kv) return { __invalid: content }
    const [, key, rawValue] = kv
    const value = rawValue.trim()

    if (value === '') {
      // 空值：看缩进更深的下一行决定子容器是数组还是映射
      const next = lines[i + 1]
      const nextIndent = next === undefined ? -1 : next.length - next.trimStart().length
      const isList = next !== undefined && nextIndent > indent && next.trim().startsWith('- ')
      const container = isList ? [] : {}
      top.node[key] = container
      stack.push({ indent, node: container })
      continue
    }

    if (value.startsWith('[') && value.endsWith(']')) {
      top.node[key] = value
        .slice(1, -1)
        .split(',')
        .map(unquote)
        .filter(Boolean)
      continue
    }

    top.node[key] = unquote(value)
  }

  return { data, body: text.slice(m[0].length) }
}

function collectMarkdownLinks(body) {
  const links = []
  const re = /\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g
  let match
  while ((match = re.exec(body))) links.push(match[1])
  return links
}

function checkLinks(file, body) {
  for (const link of collectMarkdownLinks(body)) {
    if (/^(https?:|mailto:|#)/.test(link)) continue
    const target = link.split('#')[0]
    if (!target) continue
    const abs = resolve(dirname(file), target)
    if (!abs.startsWith(repoRoot)) {
      // 指向消费方仓库的路径（如 ../.github/workflows/ci.yml）—— 在本仓库无法校验
      warnings.push({
        file: rel(file),
        message: `链接指向仓库外，无法校验（消费方仓库内有效）: ${link}`,
      })
      continue
    }
    if (!existsSync(abs)) {
      warnings.push({ file: rel(file), message: `相对链接目标不存在: ${link}` })
    }
  }
}

function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const abs = join(dir, entry.name)
    if (entry.isDirectory()) walk(abs, out)
    else out.push(abs)
  }
  return out
}

function skillByteSize(dir) {
  return walk(dir).reduce((sum, f) => sum + byteSize(f), 0)
}

// ---------- 1. 结构发现 ----------
const skillsRoot = join(repoRoot, 'skills')
const discovered = []
const seenNames = new Map()

if (!isDir(skillsRoot)) {
  err('skills', '缺少 skills/ 目录')
} else {
  for (const scopeEntry of readdirSync(skillsRoot, { withFileTypes: true })) {
    if (!scopeEntry.isDirectory()) {
      err(`skills/${scopeEntry.name}`, 'skills/ 下只允许出现 scope 目录')
      continue
    }
    const scope = scopeEntry.name
    if (!scopes[scope]) {
      err(`skills/${scope}`, `未在 skills.config.json 的 scopes 中声明的 scope`)
      continue
    }
    const scopeDir = join(skillsRoot, scope)
    for (const skillEntry of readdirSync(scopeDir, { withFileTypes: true })) {
      const skillPath = join(scopeDir, skillEntry.name)
      if (!skillEntry.isDirectory()) {
        err(rel(skillPath), 'scope 目录下只允许出现 skill 目录')
        continue
      }
      if (seenNames.has(skillEntry.name)) {
        err(rel(skillPath), `skill 重名：与 ${seenNames.get(skillEntry.name)} 冲突（名字全局唯一）`)
      }
      seenNames.set(skillEntry.name, rel(skillPath))
      discovered.push({ scope, name: skillEntry.name, dir: skillPath })
    }
  }
}

if (discovered.length === 0) err('skills', '未发现任何 skill')

// ---------- 2. 逐个 skill 校验 ----------
const skillNames = new Set(discovered.map((s) => s.name))
const requiresGraph = new Map()

for (const skill of discovered) {
  const skillFile = join(skill.dir, 'SKILL.md')
  const label = rel(skill.dir)

  if (!isFile(skillFile)) {
    err(label, '缺少 SKILL.md')
    continue
  }

  const raw = readFileSync(skillFile, 'utf8')
  if (raw.includes('\r\n')) warn(`${label}/SKILL.md`, '含 CRLF 行尾，建议统一为 LF')

  const parsed = parseFrontmatter(raw)
  if (!parsed) {
    err(`${label}/SKILL.md`, '缺少 frontmatter（文件必须以 --- 开头、--- 结束）')
    continue
  }
  if (parsed.__invalid) {
    err(`${label}/SKILL.md`, `frontmatter 无法解析的行: ${parsed.__invalid}`)
    continue
  }

  const fm = parsed.data
  for (const key of Object.keys(fm)) {
    if (!ALLOWED_KEYS.has(key)) err(`${label}/SKILL.md`, `frontmatter 含未声明的键: ${key}`)
  }
  for (const key of REQUIRED_KEYS) {
    if (fm[key] === undefined || fm[key] === '') err(`${label}/SKILL.md`, `frontmatter 缺少必填键: ${key}`)
  }

  if (fm.name && fm.name !== skill.name) {
    err(`${label}/SKILL.md`, `name (${fm.name}) 必须与目录名 (${skill.name}) 一致`)
  }
  if (fm.name && !NAME_RE.test(fm.name)) {
    err(`${label}/SKILL.md`, `name 必须是小写 kebab-case: ${fm.name}`)
  }
  if (fm.name && fm.name.length > limits.maxNameLength) {
    err(`${label}/SKILL.md`, `name 超过 ${limits.maxNameLength} 字符`)
  }

  if (typeof fm.description === 'string') {
    const len = [...fm.description].length
    if (len < limits.minDescriptionLength) err(`${label}/SKILL.md`, `description 过短（${len} < ${limits.minDescriptionLength}）`)
    if (len > limits.maxDescriptionLength) err(`${label}/SKILL.md`, `description 过长（${len} > ${limits.maxDescriptionLength}）`)
    if (/[\r\n]/.test(fm.description)) err(`${label}/SKILL.md`, 'description 必须是单行（会话启动时要整段加载）')
  }

  if (fm.scope && fm.scope !== skill.scope) {
    err(`${label}/SKILL.md`, `scope (${fm.scope}) 必须与目录所属 scope (${skill.scope}) 一致`)
  }

  if (fm.version && !SEMVER_RE.test(fm.version)) {
    err(`${label}/SKILL.md`, `version 必须是 x.y.z: ${fm.version}`)
  }

  if (fm.updated) {
    if (!DATE_RE.test(fm.updated) || Number.isNaN(Date.parse(fm.updated))) {
      err(`${label}/SKILL.md`, `updated 必须是 YYYY-MM-DD: ${fm.updated}`)
    } else if (Date.parse(fm.updated) > Date.now() + 86400000) {
      err(`${label}/SKILL.md`, `updated 不能是未来日期: ${fm.updated}`)
    }
  }

  const tags = fm.tags
  if (!Array.isArray(tags) || tags.length === 0) {
    err(`${label}/SKILL.md`, 'tags 必须是非空数组')
  } else {
    if (tags.length > limits.maxTags) err(`${label}/SKILL.md`, `tags 最多 ${limits.maxTags} 个`)
    for (const tag of tags) if (!NAME_RE.test(tag)) err(`${label}/SKILL.md`, `tag 必须是 kebab-case: ${tag}`)
  }

  const appliesTo = fm.applies_to
  const scopeCfg = scopes[skill.scope]
  if (scopeCfg?.requiresAppliesTo) {
    if (!Array.isArray(appliesTo) || appliesTo.length === 0) {
      err(`${label}/SKILL.md`, `scope=${skill.scope} 是项目型 scope，必须声明 applies_to`)
    }
  }
  if (appliesTo !== undefined) {
    if (!Array.isArray(appliesTo)) err(`${label}/SKILL.md`, 'applies_to 必须是数组')
    else for (const repo of appliesTo) if (!REPO_RE.test(repo)) err(`${label}/SKILL.md`, `applies_to 必须是 owner/repo: ${repo}`)
  }

  const requires = fm.requires ?? []
  if (!Array.isArray(requires)) err(`${label}/SKILL.md`, 'requires 必须是数组')
  else {
    requiresGraph.set(skill.name, requires)
    for (const dep of requires) {
      if (dep === skill.name) err(`${label}/SKILL.md`, 'requires 不能引用自身')
      else if (!skillNames.has(dep)) err(`${label}/SKILL.md`, `requires 引用了不存在的 skill: ${dep}`)
    }
  }

  // 大小预算：SKILL.md 是索引，细节必须沉到 references/
  if (byteSize(skillFile) > limits.maxIndexBytes) {
    err(`${label}/SKILL.md`, `SKILL.md 超过 ${limits.maxIndexBytes} 字节，细节应下沉到 references/`)
  }
  const total = skillByteSize(skill.dir)
  if (total > limits.maxSkillBytes) err(label, `skill 总体积 ${total} 超过 ${limits.maxSkillBytes} 字节`)

  // 内容卫生：不得出现本机绝对路径或明文密钥
  const forbidden = [
    { re: /\b[A-Za-z]:\\Users\\/g, why: 'Windows 本机绝对路径' },
    { re: /\/Users\/[A-Za-z0-9._-]+\//g, why: 'macOS 本机绝对路径' },
    { re: /\bgh[pousr]_[A-Za-z0-9]{20,}/g, why: '疑似 GitHub token' },
    { re: /\bsk-[A-Za-z0-9]{20,}/g, why: '疑似 API key' },
  ]
  for (const f of forbidden) {
    if (f.re.test(raw)) err(`${label}/SKILL.md`, `疑似包含${f.why}（禁止入库）`)
    f.re.lastIndex = 0
  }

  // 项目型 scope 的链接指向消费方仓库（挂载点为 <repo>/.agents/skills/<scope>/<name>/），
  // 本仓库里注定解析不到 —— 不参与链接校验，见 spec/SKILL-SPEC.md §7。
  const genericScope = scopes[skill.scope]?.kind === 'generic'
  if (genericScope) checkLinks(skillFile, raw)

  // 文件布局：只允许白名单子目录
  for (const entry of readdirSync(skill.dir, { withFileTypes: true })) {
    if (entry.isDirectory() && !ALLOWED_SUBDIRS.has(entry.name)) {
      err(`${label}/${entry.name}`, `未声明的子目录（允许: ${[...ALLOWED_SUBDIRS].join(', ')}）`)
    }
    // 根目录允许附加的 markdown（渐进披露的第二层文档），但非 md 文件必须有归属
    if (entry.isFile() && extname(entry.name) !== '.md') {
      err(`${label}/${entry.name}`, 'skill 根目录只允许 markdown；其余文件归入 references/ 或 scripts/')
    }
  }

  // references/ 内的 markdown 也要检查链接
  const refsDir = join(skill.dir, 'references')
  if (isDir(refsDir)) {
    for (const file of walk(refsDir)) {
      if (extname(file) === '.md' && genericScope) checkLinks(file, readFileSync(file, 'utf8'))
    }
  }

  info.push({ skill: `${skill.scope}/${skill.name}`, files: walk(skill.dir).length, bytes: total })
}

// ---------- 3. requires 环路检测 ----------
const state = new Map()
function visit(name, stack) {
  if (state.get(name) === 'done') return
  if (state.get(name) === 'visiting') {
    err(`skills/*/${name}/SKILL.md`, `requires 存在环: ${[...stack, name].join(' -> ')}`)
    return
  }
  state.set(name, 'visiting')
  for (const dep of requiresGraph.get(name) ?? []) visit(dep, [...stack, name])
  state.set(name, 'done')
}
for (const name of requiresGraph.keys()) visit(name, [])

// ---------- 4. 汇总 ----------
const report = {
  ok: errors.length === 0 && (!strict || warnings.length === 0),
  specVersion: config.specVersion,
  skills: discovered.length,
  errors,
  warnings,
  info: info.sort((a, b) => a.skill.localeCompare(b.skill)),
}

if (asJson) {
  process.stdout.write(JSON.stringify(report, null, 2) + '\n')
} else {
  for (const i of report.info) console.log(`  ok  ${i.skill.padEnd(32)} ${i.files} files, ${i.bytes} bytes`)
  for (const w of warnings) console.log(`  warn ${w.file}: ${w.message}`)
  for (const e of errors) console.log(`  FAIL ${e.file}: ${e.message}`)
  console.log(
    `\n${report.skills} skills · ${errors.length} error · ${warnings.length} warning` +
      (strict ? ' (strict)' : ''),
  )
}
process.exit(report.ok ? 0 : 1)
