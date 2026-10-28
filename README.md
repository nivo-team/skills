# skills

nivo-team 工作空间的 **skill 单一真值仓库**。业务仓库不再各自维护 skill，只从这里同步。

## 用法（消费方仓库）

skill 不复制进业务仓库的 git 历史，而是同步到 `.agents/skills/` 并由 `.gitignore` 挡住：

```bash
pnpm skills:sync     # 拉取本仓库 main，落到 .agents/skills/
pnpm skills:check    # CI：本地 skill 是否与锁定版本一致（不一致就失败）
```

- 同步目标路径：`<repo>/.agents/skills/<name>/`（扁平挂载：名字全局唯一，所以不需要 scope 层）
- 拉取的是 `skills-lock.json` 里**锁定的 commit**（可重现），升级用 `pnpm skills:sync --latest`
- 锁定信息写在消费方仓库的 `skills-lock.json`（`commit` + `generatedAt`），升级 = 改那个 commit，**不是**改内容；
- `.claude/skills` 是指向 `../.agents/skills` 的符号链接，Claude Code 侧无需改动。

## 布局

```
skills/<scope>/<name>/SKILL.md     # 入口（索引，≤ 20 KB）
skills/<scope>/<name>/references/  # 细节，按需加载
skills/<scope>/<name>/scripts/     # 可执行辅助
spec/SKILL-SPEC.md                 # 规范（改 skill 前先读这份）
skills.config.json                 # scope 与预算的唯一真值
scripts/validate-skills.mjs        # 规范的机器实现
provenance/skills-lock.json        # 上游来源与内容哈希
```

## 现有 skill

| scope | skill | 说明 |
| --- | --- | --- |
| `engineering` | `ask-matt` | 按处境路由到合适的 skill |
| `engineering` | `code-review` | 双轴评审（标准 / 规格） |
| `engineering` | `codebase-design` | 代码库设计与加深 |
| `engineering` | `diagnosing-bugs` | 复现 → 定位 → 修复的闭环 |
| `engineering` | `grill-with-docs` | 用文档对方案施压 |
| `engineering` | `pr` | PR 正文模板 |
| `engineering` | `research` | 技术调研 |
| `design` | `kumo-design` | Kumo 设计系统用法 |
| `productivity` | `grill-me` | 反问式澄清 |
| `nivo` | `ai-development` | dashboard 的 AI 层 |
| `nivo` | `business-development` | dashboard 的业务页面 |
| `nivo` | `platform-development` | dashboard 的工程底座 |
| `nivo` | `platform-ops` | dashboard 的仓库运维 / CI / 发布流水线 |
| `nivo` | `verify` | dashboard 的校验总入口（默认关闭） |

`nivo` scope 的 skill 绑定 `nivo-team/dashboard`，其中的路径都指 dashboard 仓库。

## 增改 skill

1. 读 `spec/SKILL-SPEC.md`（尤其 §4 frontmatter 与 §5 预算）；
2. 新建/修改 `skills/<scope>/<name>/`；
3. 跑 `node scripts/validate-skills.mjs`，CI 也会跑；
4. PR 合入 `main` 后，消费方把 `skills-lock.json` 的 `commit` 指到新的 sha 并跑 `pnpm skills:sync`。

**不要在消费方仓库里直接改 skill** —— 下次同步会被覆盖，且本仓库看不到这次改动。
