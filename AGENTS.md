# AGENTS.md

> 本仓库是 **skill 的唯一真值**。这里的文件会被同步进消费方仓库的 `.agents/skills/`，
> 所以**本文件里的相对路径按「已挂载」形态书写**（见 `spec/SKILL-SPEC.md` §7）。

## 这是什么

`nivo-team` 的 skill 仓库。通用工程方法（`engineering` / `design` / `productivity`）
与项目专属规范（`nivo`）共存，靠 scope 目录区分，靠 `applies_to` 声明适用范围。

## 要做什么 → 读哪份

| 要做什么 | 读 |
| --- | --- |
| 新增 / 修改一个 skill | `spec/SKILL-SPEC.md`（规范，含 frontmatter 与预算） |
| 改 scope、改预算 | `skills.config.json` + 本文件 §3 |
| 校验 | `node scripts/validate-skills.mjs`（CI 同款，无需安装依赖） |
| 看某个 skill 怎么用 | `skills/<scope>/<name>/SKILL.md` 的 §0 路由表 |
| 上游来源 / 是否被本地改过 | `provenance/skills-lock.json` 的内容哈希 |

## 三条铁律

1. **`SKILL.md` 是索引**：超 20 KB 会被校验拦下，细节下沉到 `references/`。
2. **不要写会腐烂的事实**：语言清单、端口、模型名、成员名单一律指向唯一真值文件。
3. **不要在消费方仓库里改 skill**：同步会覆盖，改动必须在 PR 里落到本仓库。

## 与消费方的关系

| 消费方 | 用途 | 同步方式 |
| --- | --- | --- |
| `nivo-team/dashboard` | `nivo` scope 的宿主仓库 | `pnpm skills:sync` 拉取本仓库锁定 commit，扁平挂载到 `.agents/skills/<name>/` |

消费方的 CI 用 `pnpm skills:check` 保证「本地生成的 skill 树 == 锁定 commit 的 skill 树」，
所以**改 skill 必须走本仓库的 PR**，否则 CI 红。
