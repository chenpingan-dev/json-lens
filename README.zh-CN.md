# JSON Lens

一个在浏览器中运行的 JSON 数据工作台：看清结构，定位路径，比较变化。

[在线演示](https://honggege957-collab.github.io/json-lens/) · [English](README.md)

![项目实际运行截图](assets/screenshot.png)

## 功能

- 树形浏览：展开、折叠与搜索字段、路径和值。
- 路径定位：支持 RFC 6901 JSON Pointer，包括特殊字符转义。
- 结构比较：新增、删除和修改一目了然；对象字段顺序不影响结果，数组按索引比较。
- 实用操作：格式化、压缩、字段排序、本地文件导入、文档与差异导出。
- 中英切换：页面右上角切换语言，浏览器记住选择。处理过程不上传数据。

## 快速开始

需要 Node.js 22 或以上，无需外部运行时依赖。

```bash
git clone https://github.com/honggege957-collab/json-lens.git
cd json-lens
npm ci
npm start
```

浏览器访问 `http://127.0.0.1:4173`。请通过 HTTP 服务器运行，不要直接双击 HTML 文件。页面右上角可以切换中英文，默认中文，选择会在本地保存。数据字段、任务 ID 等原始内容不随语言改变。

## 试一试

加载示例后点击“比较”，会看到 8 处变化。回到浏览视图，输入 `/services/0/name` 并点击“定位”，结果为 `"gateway"`。

## 验证与部署

```bash
npm test
npm run build
```

包含 13 项测试，CI 在 Windows、Ubuntu 和 Node.js 22、24 上执行。浏览器验证覆盖主要交互、中英切换和 390 像素宽度的布局。构建产物位于 `dist/`，仓库附带 GitHub Pages 自动部署配置。

## 边界

最大输入 2 MiB，最大嵌套深度 160 层。树视图最多显示 1,500 个匹配节点，差异最多显示 2,000 处，并提供截断标记。差异导出不是 RFC 6902 补丁，不能直接当作修改指令执行。JSON 数字遵循 JavaScript 精度限制；未实现 JSON Schema 校验，也不保存粘贴的文档。

## 关于

这是新建的个人项目，使用 AI 辅助开发。代码和示例数据为此项目创建，示例均为虚构数据。项目定位是可以运行、阅读和继续扩展的小型开源工具。

MIT 开源协议，见 [LICENSE](LICENSE)。
