# Study Tracker

个人学习面板：每日任务 / 学习日志 / 番茄钟 / 雅思真题得分 / 统计打卡。  
数据默认存在浏览器 `localStorage`，可选同步到 **私有 GitHub Gist**。

**在线地址：** https://ecoreal.github.io/study-tracker/

## 功能

- **今日看板**：番茄数、专注分钟、待办完成率、连续学习天数
- **番茄钟**：专注 / 短休 / 长休，环形倒计时，桌面通知与提示音，标题栏显示剩余时间
- **任务**：按日待办，结转到今天，一键关联番茄钟
- **学习日志**：科目、内容、时长
- **雅思得分**：四科 band + Overall（可自动计算），历史列表与趋势图
- **统计**：连续打卡、近 7 日专注柱状图、近 12 周热力图
- **Gist 同步**：多设备通过 PAT 读写同一私有 Gist
- **导入 / 导出 JSON** 备份

## 本地预览

```bash
# 任意静态服务器即可（ES modules 需要 http 而非 file://）
python3 -m http.server 5173
# 浏览器打开 http://127.0.0.1:5173/
```

## 启用 Gist 同步

1. 打开 [创建 Classic Token](https://github.com/settings/tokens/new?scopes=gist&description=study-tracker)，**只勾选 `gist`**。
2. 在网站 **设置 → GitHub Gist 同步** 粘贴 Token，点 **连接 / 创建 Gist**。
3. 应用会创建（或复用）描述为 `study-tracker-data` 的私有 Gist，文件名为 `study-data.json`。
4. 换设备时：打开同一网址 → 填入同一 Token → 连接即可拉取。

> Token 只保存在你的浏览器本地，不会进入本仓库。请勿在公共电脑登录；泄露后请立即在 GitHub 撤销 Token。

## 部署（GitHub Pages）

仓库：`ecoreal/study-tracker`，Pages 源为 `main` 分支根目录。

```bash
gh repo create ecoreal/study-tracker --public --source=. --remote=origin --push
gh api -X POST repos/ecoreal/study-tracker/pages -f build_type=legacy -f source[branch]=main -f source[path]=/
# 或在 GitHub 网页：Settings → Pages → Deploy from branch → main / root
```

数分钟后访问：https://ecoreal.github.io/study-tracker/

## 技术说明

- 纯静态：HTML + CSS + 原生 ES Modules，无构建步骤、无依赖
- 冲突策略：整包按 `updatedAt` 取较新一方；建议单主设备编辑
- 雅思 Overall：四科平均后按常见 0.5 分段规则取整（`.25`→`.5`，`.75`→进位）

## License

MIT
