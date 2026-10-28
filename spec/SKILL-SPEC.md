# Skill 规范 v2

> 本文件是**规范本身**，`scripts/validate-skills.mjs` 是它的机器实现。
> 两者不一致时以本文件为准，并同步改脚本 —— CI 会跑脚本，改规范必须同 PR 改实现。
>
> 适用对象：本仓库 `skills/` 下的全部 skill。消费方仓库（如 `nivo-team/dashboard`）只负责
> 把它同步到 `.agents/skills/`，不参与定义。

## 0. 为什么重做

v1 的问题（继承自源仓库）：

| 问题 | 后果 |
| --- | --- |
| 存放位置与消费者耦合（`.agents/skills/` 躺在业务仓库里） | skill 无法跨仓库复用；每次改 skill 都和业务改动混在一个 PR 里 |
| 目录是扁平的，靠 `skills-lock.json` 外部记录来源 | 看不出哪些通用、哪些项目专属；升级上游时无法判断能不能覆盖 |
| frontmatter 只有 `name` / `description` | 没有版本、没有归属、没有适用范围、没有依赖声明，无法机器校验 |
| 没有校验 | 断链、超长索引、误提交本机路径和密钥都靠人眼 |
| 细节直接写进 `SKILL.md` | 会话启动就把几百 KB 灌进上下文 |

v2 的目标：**单一真值 + 可校验 + 可组合 + 渐进披露**。

## 1. 仓库布局

```
skills/
  engineering/          # scope（通用）
    code-review/
      SKILL.md          # 唯一入口，索引，≤ 20 KB
      references/       # 细节，按需加载
      scripts/          # 可执行辅助（可选）
      agents/           # 各 CLI 的适配配置（可选，如 openai.yaml）
  design/
  productivity/
  nivo/                 # scope（项目型，绑定具体仓库）
    verify/
```

- **第一层目录 = scope**，必须先在 `skills.config.json` 的 `scopes` 里声明，字段 `kind` 只能是 `generic` 或 `project`。
- **第二层目录 = skill**，名字全局唯一（跨 scope 也不能重名，否则调用方无法寻址）。
- 更深的目录只允许出现在 skill 内部，且限定在 `references/`、`scripts/`、`agents/`、`assets/`、`templates/` 五个白名单子目录里。

新增一个 scope 是**规范变更**，要在本文件 §3 补一行说明，而不是只改 JSON。

## 2. skill 名字

- 小写 kebab-case：`^[a-z][a-z0-9]*(-[a-z0-9]+)*$`，≤ 40 字符；
- 与目录名逐字一致；
- 表达「做什么」而不是「是什么」：`diagnosing-bugs` 优于 `debug-tools`；
- 名字一旦发布就不要改 —— 调用方、`requires`、文档链接都以它寻址。要改就是删一个、加一个，并在 CHANGELOG 里记一笔。

## 3. scope 一览

| scope | kind | 语义 | 是否必须 `applies_to` |
| --- | --- | --- | --- |
| `engineering` | generic | 与项目无关的工程方法：评审、调试、设计、调研、交付 | 否 |
| `design` | generic | 设计系统与视觉规范 | 否 |
| `productivity` | generic | 协作、提问、澄清类方法 | 否 |
| `nivo` | project | nivo-team 工作空间专属规范，绑定具体仓库 | 是 |

判定标准只有一条：**换一个仓库还能原样用吗？** 能 → `generic`；只能在一个仓库里用 → `project`，并写清 `applies_to`。

项目型 skill 里出现的路径、命令、模块名都是**消费方仓库**的，不是本仓库的（见 §7）。

## 4. frontmatter

```yaml
---
name: verify                # 必填，= 目录名
description: 一句话说明做什么、什么时候用。单行，16–512 字符。
scope: nivo                 # 必填，= 所在 scope 目录
version: 1.0.0              # 必填，语义化版本 x.y.z
updated: 2026-10-28         # 必填，最后实质修改日期
tags: [quality, project]    # 必填，1–6 个，kebab-case
applies_to:                 # 项目型 scope 必填；owner/repo 形式
  - nivo-team/dashboard
requires: [code-review]     # 可选，依赖其它 skill（必须存在、不能成环、不能自引）
disable-model-invocation: true   # 可选，禁止模型主动调用（仅人工 / 斜杠触发）
metadata:                   # 可选，自由键值（上游署名、来源 URL 等）
  credits:
    skill: show-me
---
```

未知键**直接报错**（不是警告）：注释掉的、写错的键会让「按规范生成的」和「实际生效的」悄悄分叉。

`description` 是唯一会被所有消费方在会话启动时全量加载的字段，所以要**自解释**：做什么 + 什么时候用。不要写「见下文」。不要换行。

## 5. 渐进披露：`SKILL.md` 是索引，不是手册

| 层 | 载体 | 加载时机 | 预算 |
| --- | --- | --- | --- |
| 1 | `description` | 每会话自动 | ≤ 512 字符 |
| 2 | `SKILL.md` 正文 | 调用该 skill 时 | ≤ 20 KB（校验器强制） |
| 3 | `references/*.md` | `SKILL.md` 里的 §0 路由表按需指向 | 单 skill 总体积 ≤ 1 MB |

硬性要求：

- `SKILL.md` **必须**有一张「你要做什么 → 读哪份」的表（§0 或等价物），否则 references 就是死文件；
- 不要把整份文档复制进 `SKILL.md`；超预算必须下沉；
- references 只增索引、不增层级：`references/` 下不再建子目录（子目录白名单已隐含限制了层级）。

## 6. 内容规则

- **可执行的东西放 `scripts/`**，不要把长脚本粘进 markdown。
- **不要写死随着时间腐烂的事实**：语言清单、端口、模型名、成员名单 —— 指向唯一真值文件（如消费方的 `i18n.config.json`）并说「现读现用」。
- **禁止入库**：本机绝对路径（`C:\Users\…`、`/Users/…`）、明文密钥（`ghp_…`、`sk-…`）。校验器会拦。
- 面向人和面向模型的措辞都要**命令式**：写「改 X 前先读 Y」，不写「我们希望大概……」。
- 单文件行尾统一 LF（`.gitattributes` 已固定）。

## 7. 项目型 skill 的路径约定

项目型 skill 会被同步到消费方仓库的 **`<repo>/.agents/skills/<scope>/<name>/`**，因此它内部指向消费方仓库的链接深度是固定的：

| 所在文件 | 指向消费方仓库根 | 指向同 scope 的兄弟 skill |
| --- | --- | --- |
| `SKILL.md` | `../../../` | `../<name>/SKILL.md` |
| `references/*.md` | `../../../../` | `../../<name>/SKILL.md` |

这类链接在本仓库里**必然解析不到**，所以校验器对 `kind: project` 的 scope **跳过链接校验** —— 它们由消费方仓库的链接检查负责（`nivo-team/dashboard` 的 `pnpm skills:check` 会在挂载后的真实路径上验证）。

## 8. 版本与变更

- `version` 只在这一项**实质**变化时 +1：改流程、改硬约束、改错误判断。
- `updated` 跟着 `version` 走，不要为改错别字单独动版本。
- 破坏性变更（改名字、删 references、改挂载约定）= major。
- 上游引入的 skill 保留 `metadata.source`，并在 `provenance/skills-lock.json` 里记录上游路径与内容哈希；升级上游时按哈希判断本地是否改过。

## 9. 校验

```bash
node scripts/validate-skills.mjs           # 人读
node scripts/validate-skills.mjs --json    # CI / 工具消费
node scripts/validate-skills.mjs --strict  # warning 也算失败
```

只依赖 Node 内置模块，**不需要安装依赖**，因此可以在任何仓库里直接跑（消费方的 `pnpm skills:check` 就是复用同一份规则）。
