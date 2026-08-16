# 更新日志

> 面向后续维护者（人类或 AI）：先读「关键约定」再改代码，可避免几类静默失效。

## 2026-08-16 —— 爱听写深度联动 + 隐私治理 + 无障碍修正

本轮共 3 个功能提交（历史重写后 SHA：`04aa961` → `c0c53bf` → `a073d1b`），全部已部署上线并逐项验证。

### 1. 做题成绩自动同步（`04aa961`）

书签 bridge 从"只同步错题"升级为"错题 + 做题成绩"：

- 识别阅读结果页 URL（`/ielts/read-result/{type}/{id}`，type 覆盖剑雅/机经/G类 × 整卷/单篇，共 6 个 API 端点），抓取正确数/题数/提交时间
- **band 换算只在 app 侧做**：bridge 发送原始数据（`correctCount`/`questionCount`/`variant`/`scope`），`main.js` 复用 `js/ielts.js` 的权威换算表（`bandFromRaw`），仅整卷 40 题才给 band。bridge 里不复制换算表
- 题数推导链：显式字段 → 题目列表长度 → `正确数+错误数` → 正确率反推 → 考试格式默认（整卷恒 40；单篇兜底 13 时会在备注标注「题数估算」）
- API 响应有多层信封包裹（`{status,detail}/values`），`resultRoot()` 负责逐层剥壳
- `store.upsertIeltsPracticeRecords()` 按 `externalRef`（`idictation:reading:{scope}:{resultId}`）幂等合并，更新时保留已挂的错题

### 2. 隐私治理 + 听力同步 + 暗色对比度（`c0c53bf`）

- **个人数据出库**：`data/阅读错题本.json`（真实学习数据）从公开仓库移除，线上已 404；`data/` 整目录进 `.gitignore`；首次运行自动导入该文件的逻辑已删除（本地文件保留，仅不再分发）。随后用 `git filter-repo` 重写全部历史并 force push，main 历史中该文件 0 次出现
- **听力错题同步**：bridge 并行抓 `/api/study/zhenti/v2/errors-new`（v2，与阅读的 v1 并存），以独立字段 `listeningMistakes` 发送 —— 旧缓存页面自动忽略该字段，新页面按 `subject: 'listening'` 归入同试卷条目的听力区。听力接口失败不影响阅读同步（优雅降级）。题号解析支持 `Passage|Part|Section`
- **消息向后兼容**：消息类型定死为旧名 `study-tracker:reading-mistakes`，同时携带 `records` + `mistakes` + `practiceRecords` + `listeningMistakes` —— 一条消息，旧 SW 缓存页面（只认 `records`）和新页面（认全部字段）都能正确处理
- **暗色对比度**：实测文字对比度本已达标（6.86:1），真问题是交互边框仅 1.50:1。修复：结构边框/计时环 `#343b38→#414a46`；`btn-ghost`/输入框暗色边框 `#5f6a66`（卡片上 ≥3:1，WCAG 1.4.11）

### 3. 考试倒计时 + 同步历史（`a073d1b`）

- 设置 → 雅思目标分新增**考试日期**（`ieltsGoals.examDate`）；仪表盘问候行显示倒计时：7 天内用"仅剩 N 天"，当天"今天考试，加油！"，过期/未设置/非法日期自动隐藏
- 每次有实际变更的爱听写同步记入本地 meta（`meta.syncLog`，上限 20 条、新→旧；书签 3 次重发是无变更空操作，不入日志），展示在 **雅思 → 真题复盘 → 爱听写同步**卡片下（最近 10 条，空历史隐藏）

---

## 关键约定（改动前必读）

1. **改 `js/idictation-bridge.js` 必须同时升两个版本号**：`js/ui/review-view.js` 中书签地址的 `?v=N`（用户书签的浏览器缓存靠它击穿）和 `sw.js` 的 `CACHE`（PWA 缓存）。漏一个 = 用户拿到旧代码且无报错。
2. **消息类型不要改名**：保持 `study-tracker:reading-mistakes`（见上文兼容设计），新增数据放新字段而不是换类型。
3. **band 换算表只维护 `js/ielts.js` 一份**，bridge 永远只传原始计数。
4. **个人数据不入公开仓库**：`data/` 已 gitignore；新词库/数据文件先问"这是不是用户私人数据"。本地分支 `backup/pre-scrub-2026-08-16` 保留了含隐私数据的原始历史，**绝不可推送到远端**。
5. **爱听写端点是逆向的**，升级前对照其生产 bundle 验证：抓 `https://www.idictation.cn/home` → 找 `/assets/index-*.js` → 端点定义在共享 chunk（当前为 `index-ce218f30.js`，文件名带哈希会变）。字段名容错靠 bridge 里的中英文别名 walker。
6. 部署即 push main → Actions 自动发 Pages；改完用 `gh run watch` + curl 线上文件验证。

## 同步数据流（速览）

```
爱听写页面（登录态）
  └─ 书签加载 https://ecoreal.github.io/study-tracker/js/idictation-bridge.js?v=N
       ├─ POST errors-new (v1 阅读 / v2 听力)  ← 凭爱听写自身 cookie
       ├─ POST {type}/show/{id}  ← 仅结果页，取做题成绩
       └─ window.open(本站 #ielts=records) + postMessage(legacy 类型, 4 字段)
            └─ main.js: band 换算(仅40题整卷) → store 幂等合并 → toast + 同步日志
```

## 已知事项

- GitHub 侧重写前的旧提交对象在 GC 前仍可凭精确 SHA 访问（引用已断，浏览不可见）；如需立即物理删除可提工单请求 GC
- 书签依赖爱听写无 CSP（2026-08-16 验证属实）；若对方未来加 CSP，注入会被静默拦截
- 口语/写作暂无同步（爱听写有 `kouyu-zhenti`/`xiezuo-*` API 族，tracker 侧字段已就绪，缺 bridge 扩展）
