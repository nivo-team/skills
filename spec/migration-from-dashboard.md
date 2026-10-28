# 迁移记录：dashboard → skills

**时间**：2026-10-28
**来源**：`nivo-team/dashboard` @ `8a748ed`（`Merge pull request #9 from nivo-team/feat/ui-update`）
**源路径**：`.agents/skills/**`（14 个 skill）、`skills-lock.json`（上游来源清单）

## 迁移做了什么

| 动作 | 说明 |
| --- | --- |
| 结构 | 扁平 `skills/<name>/` → 分 scope 的 `skills/<scope>/<name>/`（见 `skill-spec.md` §1） |
| frontmatter | 补齐 `scope` / `version` / `updated` / `tags`，项目型补 `applies_to` |
| 路径 | 项目型 skill 中指向 dashboard 的链接统一为 `../../../../`（references）与 `../../../`（SKILL.md），与 `<repo>/.agents/skills/<scope>/<name>/` 挂载点对齐 |
| 行尾 | 全部 LF |
| 归属 | 上游引入的 9 个记入 `provenance/upstream-skills-lock.json`（原路径 + 哈希），自建的 5 个记入 `provenance/skills-lock.json` |
| 规范 | 新增 `spec/SKILL-SPEC.md` v2 与机器校验 `scripts/validate-skills.mjs` |

## 归属对照

| skill | 新位置 | 来源 |
| --- | --- | --- |
| ask-matt | `skills/engineering/ask-matt` | mattpocock/skills |
| code-review | `skills/engineering/code-review` | mattpocock/skills |
| codebase-design | `skills/engineering/codebase-design` | mattpocock/skills |
| diagnosing-bugs | `skills/engineering/diagnosing-bugs` | mattpocock/skills |
| grill-with-docs | `skills/engineering/grill-with-docs` | mattpocock/skills |
| pr | `skills/engineering/pr` | mattpocock/skills |
| research | `skills/engineering/research` | mattpocock/skills |
| grill-me | `skills/productivity/grill-me` | mattpocock/skills |
| kumo-design | `skills/design/kumo-design` | cloudflare/kumo |
| ai-development | `skills/nivo/ai-development` | nivo-team/dashboard（自建） |
| business-development | `skills/nivo/business-development` | nivo-team/dashboard（自建） |
| platform-development | `skills/nivo/platform-development` | nivo-team/dashboard（自建） |
| platform-ops | `skills/nivo/platform-ops` | nivo-team/dashboard（自建） |
| verify | `skills/nivo/verify` | nivo-team/dashboard（自建） |

## 迁移时发现并保留的已知问题

1. `platform-ops/references/ai-dev-pipeline.md`、`repo-configuration.md` 描述的仍是**旧** dashboard CI 拓扑
   （`ci.yml` / `translate.yml` / `ai-implement.yml` / `code-authorship.yml` / `desktop.yml` / `labels.yml`）。
   dashboard 的 CI 正在重做，这份 reference 需要跟随新流水线更新 —— 属于跟进项，不阻塞本次迁移。
2. `verify` skill 里写死了「必须用系统 node」与本机路径示例，属于项目型内容，保留在 `nivo` scope 内合理。
3. `pr` skill 的 `metadata.credits` 指向上游 Humanlayer 的 show-me skill，保留署名。

## 回滚

dashboard 侧被删掉的内容在本次 PR 里完整可见；需要恢复时 `git revert` 那个 commit，
skill 原文仍在 Git 历史里（`.agents/skills/` 路径）。
