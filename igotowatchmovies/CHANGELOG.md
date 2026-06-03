# IGOTOWATCHMOVIES Changelog

## [1.8.3] - 2026-06-03

### UI 重构
- **扫描结果固定卡片**：蓝色边框固定高度（120-220px），标题栏粘顶不滚动，条目列表在框内独立滚动
- **同步按钮集成进度条**：点击"开始批量同步"后按钮自身变形为进度条，蓝绿渐变从左填满 + 文字显示 `🔄 同步中 5/15`
- **批量面板布局重构**：按钮固定底部，卡片+结果区居中，统一由 panel 管理滚动

### UI 精简
- 移除底部绿色状态栏（batchStatusBar），中间阶段实时文本不再单独显示
- 移除同步完成后更新/失败逐条详情（resultsList），只保留摘要统计标签

## [1.8.2] - 2026-06-03

### 性能优化
- **并发批量同步**：串行处理改为 5 条并发，15 条数据从 ~110s 降至 ~15s
- **TMDB 超时缩短**：8s → 4s，减少单条导入等待时间
- **默认速率优化**：默认 1s/条 → 0.1s/条

### 兼容性
- 批量同步支持字母用户名（如 `/people/chenzilian/collect`），之前仅支持数字 ID

## [1.8.1] - 2026-06-03

### UI 修复
- **固定悬浮布局**：顶部/底部栏 fix 在视口，中间内容区独立滚动，不再整体滑动
- **整体圆角**：body 加 border-radius: 12px，外方内圆问题修复
- **完全隐藏滚动条**：全局 `::-webkit-scrollbar { display: none }`，所有区域滚动但不显示滚动条

### Bug 修复
- **单条同步 TMDB 超时**：`searchTmdbPoster` 加 AbortController 8 秒超时，避免网络不通时永久挂起导致同步卡死
- 修复 `release_date_raw` / `release_date` 字段名不一致
- **动漫分类检测改进**：content.js 的 `detectCategoryForContent` 改用 `querySelectorAll` 取全部 genre 元素，新增新版豆瓣布局 fallback（`.attrs` + 正则匹配 `类型:`），加 `console.log` 辅助调试

## [1.8.0] - 2026-06-03

### UI 全面重构
- **底部导航栏**：Header tab 按钮移至底部浮动导航（图标 + 文字），iOS 风格
- **极简顶栏**：Logo 简化为 IGTM + 主题切换 + 版本号
- **玻璃拟态主题**：暗色默认主题，半透明毛玻璃面板（backdrop-filter blur），荧光蓝渐变按钮
- **暗色/浅色双主题**：CSS 变量系统支持 `[data-theme="light"]` 和默认暗色
- **可滚动信息卡**：电影详情卡片支持滚动查看，高度自适应
- **全局样式变量化**：所有硬编码颜色改为 CSS 变量，彻底解决浅色模式下颜色不匹配
- **弹窗宽度**：从 440px 缩至 380px，更紧凑

## [1.7.1] - 2026-06-03

### UI
- **黑暗模式**：新增主题切换按钮（header 右侧 🌙/☀️），支持浅色/深色一键切换，偏好自动保存到 storage
- **版本号修复**：弹窗底部版本号改为从 manifest.json 动态读取，不再写死

### 性能优化
- **核心瓶颈修复**：`findExistingRecords` 不再每条都调用 `getAllRecords()` 拉全表数据。批量同步开始时预拉取一次，15 条场景下减少 14 次飞书 API 调用
- **批量同步速率提升**：默认速率限制从 3 秒/条降为 1 秒/条，最小值从 0.5 秒降为 0.2 秒，步长改为 0.1 秒
- 15 条数据同步时间从约 60-90 秒缩短至约 20-30 秒

## [1.7.0] - 2026-06-02

### 功能架构
- **双向表格分离**：设置页新增「批量导入表格（影视）」独立链接，单条导入和批量同步分别写入不同的飞书多维表格
- **飞书链接严格校验**：`extractFeishuInfo()` 强制匹配 `https://*.feishu.cn/base/{appToken}?table={tableId}` 完整格式，域名或路径不对直接拒绝
- **批量链接限制**：`scanListPage()` 检查当前标签页 URL，仅放行 `/people/xxx/collect|wish|do`，TOP250/豆列/排行榜直接拦截并提示
- **进度状态自动识别**：从当前标签页 URL 自动解析 `/collect`→已看完、`/wish`→想看、`/do`→正在看，写入飞书「进度状态」多选/单选字段
- **`isListPage()` 精简**：从 8 个 pattern 砍到 1 个正则

### Bug 修复
- **修复批量和单条写同一表格**：`getSettings()` 缺失 `batchMovieTableId` 和 `batchMovieTableUrl` 加载，导致批量同步永远回退到 `movieTableId`，现已补全

## [1.6.0] - 2026-06-02

### 架构重构：个人数据来源切换
- **个人数据改为列表页 DOM 提取**：`getListItems()` 中新增评分（`ratingN-t` class）、日期（`.date` 元素）、短评（`.comment` 元素）的 DOM 提取，利用列表页的登录态 DOM 获取真实个人数据
- **删除无效解析代码**：移除 `parseDetailPageHtml()` 中 ~50 行对评分/日期/短评的 HTML 解析逻辑（fetch 无登录态，返回游客页面，无法获取个人数据）

### 封面策略
- **豆瓣封面 + TMDB 双重保障**：批量同步恢复豆瓣封面提取（3 种正则回退），TMDB API 作为优先覆盖源；无 TMDB Key 时使用豆瓣封面

### 字段提取修复
- **修复 `extractInfoField` 字段边界失效**：`\\s{2,}` → `\\s`，清洗后单空格不再匹配失败
- **修复 `interest_sect_level` 嵌套 div**：改用深度计数法替代 lazy 正则

### 种类判断优化
- **重写 `detectCategory()` / `detectCategoryForContent()`**：仅限 runtime 字段匹配「集」，移除「全集」「单集」等误判词，新增「集数:」「首播:」等字段级强指标
- **单独导入支持种类**：`getMovieInfo()` 返回 `category` 字段

### 多选/单选/日期字段支持
- `mapDataToFeishuFields()` / `mapDataForBatch()` 新增 type 3（单选）、type 4（多选）、type 5（日期）字段处理
- type 4 之前被错误归入数字类型（`parseFloat("电影")` → NaN），现已独立处理传数组 `["电影"]`

### 其他
- 批量同步不再提取 IMDb 编号

## [1.5.0] - 2026-06-02

### 新增功能
- 自动种类判断（电影/电视剧/动漫）
- 批量同步字段增强：编剧、制片国家、语言、上映日期、片长、出品方、简介、标签、评分人数
- 多值字段支持：导演/演员/编剧等多人名

### 变更
- 品牌名称：`IGOTOWATCHMOVIES`（全大写）
- 版本号：1.4.3 → 1.5.0

### 技术改进
- `parseDetailPageHtml()` 重写
- 新增 `detectCategory()` / `detectCategoryForContent()`
- movieMapping 新增 `category` / `progress_status` 字段映射
