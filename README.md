# 🎬 DecoTV

<div align="center">

![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=nextdotjs)
![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?logo=typescript)
![ESLint](https://img.shields.io/badge/ESLint-pass-brightgreen?logo=eslint)
![Vercel](https://img.shields.io/badge/Deploy-Vercel-black?logo=vercel)

</div>

一个基于 `Next.js + TypeScript` 的影视聚合播放器项目，支持多源搜索、在线播放、管理后台配置。

## ✨ 本次更新重点

| 模块                | 状态    | 说明                                                        |
| ------------------- | ------- | ----------------------------------------------------------- |
| 🔎 源浏览器独立版   | ✅ 完成 | 新增独立页面，支持源聚合浏览与过滤。                        |
| ⬇️ 流媒体下载器     | ✅ 完成 | 支持任务管理、断点续传、进度状态与多任务控制。              |
| 💬 多源弹幕管理系统 | ✅ 完成 | 后台新增“自定义节点库”，支持节点 CRUD、延迟测试与一键应用。 |

## 🧩 多源弹幕管理（Admin）

后台 `弹幕配置` 现已支持：

- 添加节点：节点名称、服务地址 URL、API Token
- 节点列表：显示节点信息与连通延迟状态
- 编辑 / 删除：维护节点配置
- 使用此节点：一键写入当前弹幕配置并保存
- 持久化：优先保存到配置（后端 Config），并做 LocalStorage 兜底

## 🚀 快速开始

```bash
pnpm install
pnpm dev
```

打开：`http://localhost:3000`

## ✅ 代码健康检查

本次已完成：

- TypeScript 类型检查通过（`pnpm typecheck`）
- ESLint 严格检查通过（`pnpm lint:strict`）
- 关键下载/轮询逻辑完成清理，避免常见内存泄漏路径

## 🗂️ 关键目录

- `src/app/admin/page.tsx`：后台管理页（含弹幕节点管理）
- `src/app/api/admin/danmu/route.ts`：弹幕配置保存接口
- `src/lib/admin.types.ts`：后台配置与弹幕节点类型定义
- `src/contexts/DownloadManagerContext.tsx`：下载任务上下文

## 📄 License

MIT
