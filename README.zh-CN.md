# SmileDCA

<p align="center">
  <img src="assets/SmileDCA-logo.png" alt="SmileDCA logo" width="128">
</p>

[English](README.md)

SmileDCA 是一个轻量级、纯前端的多标的定投回测工具，适合用来测试 ETF / 指数基金定投计划。

> “业余投资者定期定投指数基金，往往能战胜绝大多数专业投资者”——沃伦·巴菲特

## 主要功能

SmileDCA 可以让你配置一个多 ETF 定投组合，运行历史回测，并在同一个交互式看板里查看结果。

核心功能：

- 从美股 ETF 标的池中搜索并选择标的。
- 每个 ETF 可以独立配置：
  - 定投开始日期
  - 定投结束日期
  - 定投频率：每日、每周、每月
  - 每期定投金额
  - 是否启用该标的
- 配置完成后，点击按钮运行组合回测。
- 查看组合总资产曲线。
- 每次选择一个 ETF，查看它的 K 线 / 净值图。
- 在 K 线图上标记定投买入位置和买入金额。
- 支持图表拖动、框选缩放、重置和全屏查看。
- 支持高亮最大回撤区间。
- 自动生成回测结果综述，包括投入、本金变化、最终资产、最大回撤体验，以及和 SPY 的对比。
- 支持英文 / 中文切换。
- 支持深色 / 明亮模式切换。

## 使用方式

1. 打开 SmileDCA 页面。
2. 在搜索框里输入你想测试的 ETF，例如 `QQQ`、`SPY`、`VOO`。
3. 点击搜索结果，把标的加入已选标的池。
4. 在每个标的卡片里设置：
   - 定投开始和结束日期
   - 每日、每周或每月定投
   - 每期投入金额
   - 是否启用该标的
5. 点击 **运行回测**。
6. 查看回测结果：
   - 结果综述
   - 总投入本金
   - 期末总资产
   - 累计收益率
   - 年化收益率
   - 最大回撤
   - 和 SPY 的对比
   - 组合走势图，以及可选的单 ETF K 线图

如果已经打开了某个 ETF 的 K 线图，再次点击这个 ETF，就会关闭 K 线图，只保留组合回测曲线。

## 本地运行

这个项目正常预览不需要安装前端依赖，也不需要构建步骤。

推荐环境：

- Node.js 22 或更新版本

启动本地预览：

```bash
node scripts/serve-local.mjs
```

然后打开：

```text
http://127.0.0.1:5173/
```

如果想使用其他端口：

```bash
node scripts/serve-local.mjs 5174
```

直接打开 `index.html` 可以用于简单查看页面，但推荐使用本地服务器，因为应用会从 `data/` 目录加载 JSON 行情数据。

## 回测逻辑

所有回测计算都在浏览器里完成。

应用运行时会：

1. 从 `data/manifest.json` 和 `data/etf-universe.json` 读取 ETF 元数据。
2. 从 `data/prices/{SYMBOL}.json` 读取每日行情数据。
3. 根据已选标的建立统一交易时间轴。
4. 按每个标的自己的配置生成定投计划。
5. 如果计划日期不是交易日，则在下一个可用交易日执行买入。
6. 持续跟踪：
   - 累计投入本金
   - 已执行买入金额
   - 每个 ETF 的持仓份额
   - 闲置现金
   - 持仓市值
   - 组合总资产
7. 计算组合层面的指标：
   - 总投入
   - 期末资产
   - 累计收益率
   - 年化收益率 / 近似 XIRR
   - 最大回撤
   - 和 SPY 的基准对比

无论组合里有多少 ETF，也无论每个 ETF 的定投时间、频率、金额是否相同，最终都会汇总成一条组合总资产曲线。

## 数据更新逻辑

SmileDCA 使用静态 JSON 数据来保证前端加载速度，同时也支持 Cloudflare 后端兜底获取缺失标的行情。

数据来源：

- ETF 标的池：Nasdaq Trader Symbol Directory
- 每日 OHLC 行情：Yahoo Finance Chart API

本地更新数据：

```bash
node scripts/update-data.mjs
```

刷新或新增指定标的：

```bash
node scripts/update-data.mjs --symbols=QQQ,SPY,TLT
```

这个脚本会更新：

- `data/etf-universe.json`
- `data/manifest.json`
- `data/prices/*.json`

`.github/workflows/smiledca-update-data.yml` 会在美股收盘后自动运行，也可以在 GitHub Actions 里手动触发，并传入需要刷新的 ETF 代码。

## 部署方式

SmileDCA 设计为静态站点，可以部署到 Cloudflare Pages 等静态托管平台。

当前部署链路：

- Cloudflare Pages 托管静态前端。
- GitHub Actions 将 `index.html`、`_headers`、`assets/`、`data/` 和 `pages/_worker.js` 部署到 Pages。
- Cloudflare Pages Functions 处理 `/api/price`。
- 可选使用 Cloudflare R2 存储没有提交到仓库里的行情 JSON。

Cloudflare 部署需要在 GitHub 仓库 Secrets 中配置：

```text
CLOUDFLARE_ACCOUNT_ID
CLOUDFLARE_API_TOKEN
```

如果启用 R2，还需要：

```text
CLOUDFLARE_R2_BUCKET
```

配置 R2 后，如果用户搜索的 ETF 没有本地静态行情文件，应用可以通过 `/api/price?symbol=SYMBOL` 获取并缓存行情。

## 技术框架

SmileDCA 故意保持简单：

- 单页应用：`index.html`
- 无前端框架
- 原生 HTML、CSS、JavaScript
- Canvas 2D 绘制图表
- `localStorage` 保存用户偏好和策略配置
- `IndexedDB` 缓存浏览器端 JSON 数据
- 静态 JSON 保存行情数据
- GitHub Actions 自动更新数据和部署
- Cloudflare Pages 托管前端
- Cloudflare Pages Functions / Worker 提供可选价格代理
- Cloudflare R2 提供可选对象存储

关键文件：

```text
index.html                              主应用界面、状态管理、图表和回测逻辑
assets/SmileDCA-logo.png                应用 Logo
data/manifest.json                      已缓存行情数据清单
data/etf-universe.json                  可搜索 ETF 标的池
data/prices/*.json                      ETF 每日 OHLC 行情
scripts/serve-local.mjs                 本地静态服务器
scripts/update-data.mjs                 行情数据更新脚本
pages/_worker.js                        Cloudflare Pages 的 /api/price 处理逻辑
workers/smiledca-price-worker.js        独立 Worker 版本的价格代理
.github/workflows/*.yml                 数据更新和 Cloudflare 部署流程
```

## 注意

SmileDCA 是一个用于学习和复盘的历史回测工具。历史收益不代表未来收益，本项目不构成任何投资建议。
