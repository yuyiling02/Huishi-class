# 恢复 PNG 图片到 public/images/

## Context
之前将 `public/images/` 下的 6 个 PNG 结构图移到了 `output/` 文件夹，导致 App.tsx 中引用的 `/images/xxx.png` 路径失效，图片无法正常展示。

已经修复：6 个 PNG 文件已从 `output/` 复制回 `public/images/`。

## Git 结构说明
`d082c6d` 是 `ac9f9df` 的子 commit（parent 指向 ac9f9df），两者实际 tree 几乎相同（仅有 README.md 不同）。图片文件在 ac9f9df 和 d082c6d 的 tree 中都存在。

图片无法自动回来的原因可能是：移动图片到 output/ 后，deletion 被 staged 了（git add），此时做 `git checkout -- public/images/` 会从 index（已被标记删除）恢复，而非从 commit tree 恢复。需要使用 `git checkout d082c6d -- public/images/` 或 `git restore --source=HEAD -- public/images/` 才能从 commit 中找回。
