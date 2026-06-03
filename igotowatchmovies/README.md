# IGOTOWATCHMOVIES

> 豆瓣电影/图书一键同步至飞书多维表格的 Chrome 浏览器扩展

[![Version](https://img.shields.io/badge/version-1.8.1-blue)](https://github.com/Onetucenasshole/vibecoding-workspace)
[![Manifest](https://img.shields.io/badge/manifest-v3-green)](https://developer.chrome.com/docs/extensions/mv3/)
[![License](https://img.shields.io/badge/license-MIT-orange)](LICENSE)

## ✨ 功能

| 功能 | 说明 |
|------|------|
| 🔄 **单条导入** | 豆瓣详情页一键导入到飞书多维表格 |
| 📦 **批量同步** | 豆瓣个人列表页扫描，自动翻页批量导入 |
| 🎬 **自动分类** | 智能识别电影 / 电视剧 / 动漫 |
| 🖼️ **TMDB 封面** | 通过 TMDB API 获取高清海报 |
| 🧠 **智能去重** | 基于豆瓣 ID + 标题模糊匹配 |
| 📊 **完整度比较** | 字段填充率自动决定跳过或覆盖 |
| 🌙 **暗色/浅色双主题** | 玻璃拟态 UI，一键切换 |

### 支持同步的字段

基本信息、导演/编剧/主演、类型、制片国家、语言、上映日期、片长、
IMDb、豆瓣评分、评分人数、个人评分、打分日期、短评、种类、进度状态

## 📦 安装

1. 打开 Chrome 浏览器 → `chrome://extensions/`
2. 开启右上角「开发者模式」
3. 点击「加载已解压的扩展程序」
4. 选择插件目录
5. 插件图标出现在工具栏

## ⚙️ 飞书配置

### 1. 创建飞书应用

1. [飞书开放平台](https://open.feishu.cn/) → 创建企业自建应用
2. 获取 **App ID** 和 **App Secret**
3. 开通权限：`云文档 > 多维表格`（全部权限）

### 2. 创建多维表格

在飞书多维表格中创建以下字段（示例）：

| 字段名 | 类型 | 说明 |
|--------|------|------|
| 豆瓣ID | 文本 | 用于去重 |
| 影视标题 | 文本 | |
| 导演 | 文本 | |
| 主演 | 文本 | |
| 类型 | 文本 | |
| 条目链接 | URL | |
| 影视封面 | 附件 | |
| 豆瓣评分 | 数字 | |
| 个人评分 | 数字 | |
| 打分日期 | 日期 | |
| 我的短评 | 文本 | |
| 种类 | 多选 | 选项：电影、电视剧、动漫 |
| 进度状态 | 单选 | 选项：已看完、想看、正在看 |

### 3. 在插件中配置

1. 点击插件图标 → **设置** tab
2. 填入 App ID、App Secret
3. 粘贴「单条导入表格」飞书链接 → 单条同步写入此表
4. 粘贴「批量导入表格」飞书链接 → 批量同步写入此表（两个表可相同可不同）
5. 点击「验证连接」

### 4. TMDB 封面（可选）

1. [TMDB 官网](https://www.themoviedb.org/) 注册 → [API 设置](https://www.themoviedb.org/settings/api) 申请 Key
2. 填入插件设置页「TMDB API Key」

## 🚀 使用

### 单条导入

1. 打开豆瓣电影/图书详情页
2. 点击插件图标 → **同步** tab → 获取信息 → 保存到飞书

### 批量同步

1. 在浏览器中打开豆瓣个人列表页（仅支持 `movie.douban.com/people/xxx/collect|wish|do`）
2. 点击插件图标 → **批量** tab → 扫描 → 开始批量同步
3. 自动根据链接识别进度状态：`/collect`→已看完、`/wish`→想看、`/do`→正在看

## 🛠️ 技术栈

- Chrome Extension Manifest V3
- Service Worker (background.js)
- Content Script (content.js) - DOM 数据提取
- [飞书开放 API](https://open.feishu.cn/document/) - 多维表格读写
- [TMDB API](https://developers.themoviedb.org/) - 封面获取
- 玻璃拟态 UI（CSS backdrop-filter + 渐变）

## 📁 项目结构

```
├── manifest.json          # 扩展配置
├── background.js          # Service Worker（飞书 API、TMDB、批量逻辑）
├── content.js             # Content Script（豆瓣页面数据提取）
├── popup.html             # 弹窗 UI
├── popup.js               # 弹窗交互逻辑
├── styles.css             # 样式（玻璃拟态暗色主题）
├── rules.json             # 跨域请求头覆写规则
├── icons/                 # 图标资源
├── CHANGELOG.md           # 版本日志
└── 使用手册.md             # 用户手册
```

## 📄 License

MIT License

## 🔗 相关链接

- [飞书开放平台](https://open.feishu.cn/)
- [TMDB API](https://developers.themoviedb.org/)
- [豆瓣](https://movie.douban.com/)
