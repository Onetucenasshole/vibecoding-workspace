# IGOTOWATCHMOVIES 协作规范

## 1. 版本号管理

- **版本号由你决定，AI 不自行递增**
- 改完代码后版本号不变，你说"push"或指定版本号后才统一同步
- 同步位置：`manifest.json` / `popup.html` / `CHANGELOG.md`

## 2. Push 流程

说"push"时，AI 自动执行：

1. 同步版本号到所有文件
2. 合并 CHANGELOG（多条目 → 单条目）
3. 复制文件到 git 仓库 (`D:\AI\vibecoding-workspace\igotowatchmovies\`)
4. commit + tag + push（tag 格式见下）

## 3. Tag 命名

```
igotowatchmovies-v1.8.1
igotowatchmovies-v1.8.2
<项目名>-v<版本号>
```

同一仓库多项目，用项目名前缀区分。

## 4. 使用手册

- UI 重构/样式调整 → 不需要写手册
- 新功能/逻辑变更 → 需要写/更新手册

## 5. 路径

| 用途 | 路径 |
|------|------|
| 插件源文件 | `C:\Users\Administrator\Desktop\同步插件更新程序\igotowatchmovies-v1.4.2\igotowatchmovies-v1.4.2\` |
| Git 仓库 | `D:\AI\vibecoding-workspace\` |
| 插件子目录 | `igotowatchmovies/` |
| GitHub | `https://github.com/Onetucenasshole/vibecoding-workspace` |
| 分支 | `master` |
