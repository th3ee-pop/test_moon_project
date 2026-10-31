# 月相观察实验室 · Moon Phase Lab

面向小学科学的月相变化探究工具：学生拖动日期观察月相、完成 5 道探究题，
所有观察与答题行为实时写入 **CloudBase PostgreSQL**，教师在应用内看板查看班级学习过程数据。

- 线上地址：`https://moon-phase-lab-zdv3m7uy.edgeone.cool`（部署于 EdgeOne Makers）
- 技术栈：Next.js 16（App Router）+ CloudBase PostgreSQL + EdgeOne Makers

## 三维观察台

观察台的月亮用 three.js 实时渲染（`components/MoonScene3D.tsx`），支持两个视角：

- **从地球看**：相机就在地球位置看向月球，就是学生抬头看到的样子；
- **从太空看**：相机退到系统外俯视，地球、月球、光线同框，能直接看出「被照亮的一半始终朝向太阳」。

物理模型（两个视图共用，保证切换时月相一致）：

```
太阳方向固定 → 地球在原点 → 月球沿轨道公转，公转角 = 2π × phase
月球永远只有朝太阳的一半被照亮；月相是「从地球看这颗球」的视觉结果
```

三个关键处理：

1. **月相由定向光算出**，不是贴阴影图，明暗交界线在任何相位都自然正确；
2. **潮汐锁定**：月球随公转同步调整朝向，始终以同一面（月海丰富的正面）朝地球；
3. **太空视角的机位垂直于阳光方向**，月球永远呈半明半暗。若用固定机位，月球会随日期忽明忽暗，
   学生容易误读成「月球自己在变」——那正是本节课要破除的错误概念。

为了让「地球、太阳、月球同框」的画面被读成「阳光照到月球」，而不是「地球挡住了光」，
太空视角做了这样几件事：

- 太阳画成一颗看得见的发光球体，光线束**从太阳表面出发、收敛到月球受光面**，
  避免出现「光线从地球冒出来」的误读；
- 机位垂直于阳光方向，因此太阳—地球—月球这条轴线恒在画面水平方向上，构图稳定；
- 注视点取在月球轨道最远端与太阳的中点，保证满月（月球在最右）与新月（月球紧邻太阳）都不出画；
- 地球夜半球保持暗，月球暗面只留极弱自发光（地照），新月时「几乎看不见但仍有轮廓」；
- 画面上注明「天体大小与距离未按真实比例」——月球轨道半径与太阳距离都被大幅压缩，否则无法同框。

降级路径：贴图加载完成前显示原 SVG 月亮；WebGL 不可用或贴图加载失败时永久回退 SVG，学生端不会白屏。
（组件在创建 WebGL 上下文前会先用临时 canvas 探测一次，不支持的设备直接走回退，控制台不报错。）
three.js 只在观察台按需加载，首屏（封面 / 完成页）仍是纯 SVG，不增加首屏体积。

**素材许可**：月球 / 地球 / 银河贴图来自 [Solar System Scope](https://www.solarsystemscope.com/textures/)，
基于 NASA 影像与高程数据，采用 **CC BY 4.0**（允许商用与修改，需署名），页面页脚已标注。
贴图统一转为 WebP 存放于 `public/textures/`，2K 分辨率共约 1.3 MB。

## 架构

```
浏览器（学生端 / 教师看板）
   │  前端埋点队列，5s 批量 / 离开页面 sendBeacon
   ▼
Next.js Route Handler  /api/track  ·  /api/stats      ← 运行在 EdgeOne ssr-node 云函数
   │  服务端持有 API Key（next build 不内联，运行时由平台注入环境变量）
   ▼
CloudBase PG HTTP 接口  https://<envId>.api.tcloudbasegateway.com/v1/rdb/rest
   ▼
PostgreSQL：三张明细表（写入）+ 五个聚合视图（只读）
```

密钥只在服务端；`grep` 过 `.next/static` 与 `.next/server`，API Key 均未出现在构建产物中。

## 数据模型

| 表 / 视图 | 作用 |
|---|---|
| `moonlab_sessions` | 一次探究会话：学生名、班级、起止时间、用时、得分、是否完成 |
| `moonlab_events` | 行为事件流：`event_type` + `payload(jsonb)` + `seq` + `client_ts` |
| `moonlab_answers` | 答题明细：题目、作答、正确答案、对错、第几次尝试、耗时 |
| `moonlab_overview` | 汇总：人次、完成率、平均分、平均用时 |
| `moonlab_question_stats` | 每题：尝试次数、参与人数、正确率、平均耗时 |
| `moonlab_event_stats` | 每种行为的事件数与人次 |
| `moonlab_daily` | 按天聚合的参与与得分 |
| `moonlab_wrong_patterns` | 错答分布（用于定位共性迷思概念） |

权限：`anon` / `authenticated` 只被授予三张表的 `INSERT`，**没有** `SELECT` 权限；
看板读取的是聚合视图，因此单个学生的明细无法从客户端读到。RLS 对三张表开启，插入策略为 `WITH CHECK (true)`。

### 埋点事件

`session_start` · `moon_date_change`（日期、月龄、相位、照亮比例）· `phase_name_reveal` ·
`question_view` · `option_select` · `option_toggle` · `order_pick` · `order_reset` ·
`hint_open` · `answer_correct` / `answer_wrong` · `answer_retry` · `open_submit` · `session_complete`

## 本地开发

```bash
npm install
# .env.local
#   CB_ENV_ID=<cloudbase env id>
#   CB_API_KEY=<cloudbase 环境 API Key，server 端专用>
npm run build && npx edgeone makers dev -n moon-phase-lab --skip-env-sync
# 预览 http://127.0.0.1:8088/
```

端到端自测（需要本机 Chrome）：

```bash
node scripts/e2e.mjs http://127.0.0.1:8088/
node scripts/e2e.mjs "https://<你的部署地址>?eo_token=..."
```

其余调试脚本，第一个参数都是目标地址：

```bash
node scripts/shots3d.mjs <url>         # 3D 观察台多相位截图
node scripts/shots-extremes.mjs <url>  # 新月 / 满月极值相位截图
```

## 部署

```bash
npx edgeone makers deploy -n moon-phase-lab --json
```

环境变量的实际生效路径是**部署时打包的 `.edgeone/cloud-functions/ssr-node/.env.local`**，
内容来自项目根目录的 `.env.local`。所以**更换数据库环境时只改根 `.env.local` 并重新部署即可**；
`edgeone makers env set` 可以执行成功，但 `env ls` 读不到，也不影响上面这个打包文件，不要指望它切库。

两个注意点：

- 构建时若清理 `.edgeone/cloud-functions/ssr-node`，部分本地防误删策略会拦截，必要时对该次命令单独放开
  （`CODEBUDDY_SAFE_DELETE_ENABLED=0`）。
- 打包钩子要读 `.env.local`，需要一次文件读取授权，因此**必须在可交互的前台执行部署**；
  放到后台任务里会因无法弹授权而失败（`refused by file policy: prompt`），与沙箱开关无关。

### 换库

数据库换过一次环境：全部表结构、会话、事件与答题从早期环境整体搬到了当前生产库。
旧环境原样保留、不再写入，可作冷备份。环境 ID 不写进仓库，见本地 `.env.local`。

换库三步：

1. 目标环境用同一份 migration 建表：`managePgDatabase applyMigration`，
   **复用同一个 `migrationVersion`**（如 `cloudbase/migrations/` 里的文件名前缀），
   返回 `verified: true` 且 `localFileAction: "matched"` 才算成功，这样不会产生重复的迁移文件；
2. 迁数据：`python3 scripts/migrate_moonlab.py --source <旧环境> --target <新环境>`，
   先用 `--dry-run` 看行数再实际写入。写入统一 `on conflict (id) do nothing`，中断后直接重跑即可；
3. 改根 `.env.local` 的 `CB_ENV_ID` / `CB_API_KEY`，前台重新部署，再验证 `/api/stats` 与 `/api/track`。

迁移后建议做一次一致性核对：三张表行数一致、`moonlab_overview` 数值一致，
再用 `md5(string_agg(... order by id))` 逐表比对内容指纹。

`moonlab_sessions.id` 是 **uuid** 类型，手工造测试数据时记得用 uuid，字符串会被库拒。

## 查数据

```sql
-- 最近 10 次探究
select student_name, score, total_questions, duration_ms, completed, started_at
from moonlab_sessions order by started_at desc limit 10;

-- 某次探究的完整操作序列
select seq, event_type, phase, payload, client_ts
from moonlab_events where session_id = '<uuid>' order by seq;
```

DDL 与授权语句在 `cloudbase/migrations/`（若本地未生成，可参考本文档的建表说明重建）。

## 已知限制

- 埋点为前端上报，理论上可被篡改；用于课堂教学分析足够，不适合做测评结论。
- 月相由朔望月周期推算（误差 < 0.5 天），不做天文历表校正。
- 默认无登录，学生以名字标识；如需分班对比，可扩展 `class_name` 过滤。
