# SNETS Circuit Studio

SNETS 是一个在浏览器中运行的 IC 原理图编辑器，可手动绘制电路，也可将 Spectre 结构网表导入为可编辑的分层原理图工程。

在线使用：[https://y523742204.github.io/SNETS/](https://y523742204.github.io/SNETS/)

详细操作说明：[SNETS 操作者使用手册](MANUAL.md)

## 主要功能

- 放置、移动、旋转和镜像元件，支持连线、框选、撤销与重做。
- 标准元件库包含电阻、电容、电感、二极管、电压源、电流源、电源、地、端口、MOS、运放、反相器、变压器和 NPORT 等符号。
- 基础元件和引脚统一落在 20 px 网格上；MOS 保留标准矢量图，并使用 80×120 外框和偏移的 D/G/S/B 端点。
- 自动生成避障正交连线，默认沿端点所在外边框的法向出线。
- 多端网络可合并为共享干线和 T 形分支；不同网络的弯点与重叠线段会主动避让。
- “整理连线”保持全部元件的位置、旋转和镜像状态，只重新规划线路径。
- 支持手动指定关键导线通道；手动连线允许覆盖默认出线方向。
- 工程自动保存到 IndexedDB，也可导出 JSON 或当前层 SVG。

## Spectre 网表导入

文件面板中的“导入 Spectre 网表”接受 `.scs`、`.net`、`.cir` 和无扩展名文件。可以同时选择依赖文件或整个依赖文件夹。

当前导入器支持：

- 注释、续行、转义名称和括号端子列表。
- `subckt/ends`、`global`、`parameters`、`model` 和 `include`。
- 参数原文及表达式保留，不执行表达式。
- 相对依赖解析、同名文件选择、缺失依赖及循环引用报告。
- 前向子电路引用和严格按声明顺序映射的子电路端口。
- 分层电路树、面包屑导航和子电路定义复用。
- 按模型名称和端子数推测标准符号，并允许修改模型映射。
- 动态子电路和 NPORT 引脚，包括多端 NPORT 的全部信号端和参考端。
- 模型、参数和有序端子完全相同的重复实例折叠显示；实例数据仍逐个保存。
- Touchstone 文件作为本地工程附件保存。
- 仿真及分析语句作为元数据保留，不会误识别为器件。

导入前会显示层级、实例统计和问题报告。无法确定连接关系的语法错误会阻止创建工程；模型无法识别但端子明确的实例会使用通用方框，不会被静默丢弃。

## 工程格式

SNETS 支持两种 JSON 格式：

- `version: 1`：普通平面原理图，包含 `components` 和 `wires`。
- `version: 2`：Spectre 分层工程，保存顶层电路、子电路定义、有序端口、实例、网络、模型映射、来源、附件及各层绘图状态。

旧版工程仍可打开和编辑。分层工程导出后重新导入，会保留层级、连接、参数、附件、折叠成员和布局。

## 本地运行

项目是无构建步骤的静态站点。使用任意静态文件服务器提供 `dist` 目录即可，例如：

```bash
python -m http.server 8000 --directory dist
```

然后访问 [http://localhost:8000](http://localhost:8000)。直接双击 `index.html` 可能受到浏览器 Worker 和本地文件访问策略限制，因此建议使用 HTTP 服务器。

## 测试

需要 Node.js。运行：

```bash
node tests/spectre-parser.test.js
```

测试覆盖解析、依赖处理、分层端口、标准符号映射、动态 NPORT、JSON 往返、镜像、折叠分组、避障布线、端点法向、T 形干线以及“整理连线”保持元件位置等行为。

## 目录结构

```text
dist/
  index.html             应用入口
  app.js                 编辑器界面和交互
  component-library.js   标准元件库
  model.js               工程校验、几何和布线
  spectre-parser.js      Spectre 解析与分层工程生成
  layout-worker.js       后台整理连线
  spectre-worker.js      后台网表解析
  styles.css             页面样式
tests/
  spectre-parser.test.js 回归测试
```

## 部署

推送到 `main` 后，[GitHub Actions](.github/workflows/deploy-pages.yml) 会将 `dist` 目录发布到 GitHub Pages。

## 当前边界

- 面向 Spectre 原生结构网表，不承诺完整兼容混合 SPICE 方言。
- 不解析 Verilog-A，不执行参数表达式，也不进行电路仿真。
- 导入器不会还原原始 Cadence 图纸坐标，而是生成确定性的可编辑布局。
- 网表、工艺文件、Touchstone 附件和自动保存内容均留在本地浏览器，不会随网站上传或公开。
