# Lumina Note 启动指南

## 项目概述

Lumina Note 是一个基于 Tauri 框架的桌面笔记应用，需要 Rust 和 Node.js 环境才能运行。

## 系统要求

- **操作系统**: Windows 10/11
- **包管理器**: winget (Windows Package Manager)

## 依赖版本

### 必需依赖

| 组件 | 版本 | 说明 |
|------|------|------|
| **Rust** | 1.92.0 | Rust 编程语言和 Cargo 包管理器 |
| **Node.js** | 19.2.0 | JavaScript 运行时环境 |
| **LLVM** | 21.1.8 | Clang 编译器链接器 |

### 可选依赖

| 组件 | 版本 | 说明 |
|------|------|------|
| **Visual Studio Build Tools** | 17.14.23 | MSVC 链接器 (备用方案) |

## 遇到的问题及解决方案

### 问题 1: cargo 命令找不到

**错误信息**:
```
failed to run 'cargo metadata' command to get workspace directory: failed to run command cargo metadata --no-deps --format-version 1: program not found
```

**原因**: 系统未安装 Rust 工具链

**解决方案**:
```bash
winget install --id Rustlang.Rustup --accept-source-agreements --accept-package-agreements
```

**验证**:
```bash
cargo --version
# 应输出: cargo 1.92.0 (344c4567c 2025-10-21)
```

### 问题 2: Node.js 版本不支持现代语法

**错误信息**:
```
SyntaxError: Unexpected token '??='
(node:41772) UnhandledPromiseRejectionWarning: SyntaxError: Unexpected token '??='
```

**原因**: Node.js v14.21.2 版本过低，不支持空值合并赋值运算符 (`??=`)

**解决方案**:
```bash
# 使用 nvm-windows 切换版本 (推荐)
nvm use 19.2.0

# 或使用 winget 安装 (可能需要管理员权限)
winget install OpenJS.NodeJS.LTS
```

**验证**:
```bash
node --version
# 应输出: v19.2.0
```

### 问题 3: 缺少 MSVC 链接器

**错误信息**:
```
error: linker `link.exe` not found
note: the msvc targets depend on the msvc linker but `link.exe` was not found
note: please ensure that Visual Studio 2017 or later, or Build Tools for Visual Studio were installed with the Visual C++ option.
```

**原因**: Windows 上 Rust 默认使用 MSVC 目标，但缺少 Microsoft Visual C++ Build Tools

**解决方案选项**:

#### 方案 A: 安装 Visual Studio Build Tools (推荐)
```bash
winget install Microsoft.VisualStudio.2022.BuildTools --override "--passive --wait --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"
```

#### 方案 B: 使用 GNU 目标和 LLVM (已采用)
```bash
# 添加 GNU 目标
rustup target add x86_64-pc-windows-gnu

# 安装 LLVM 作为链接器
winget install LLVM.LLVM
```

## 安装步骤

### 步骤 1: 安装 Rust

```bash
# 安装 Rustup (Rust 安装器)
winget install --id Rustlang.Rustup --accept-source-agreements --accept-package-agreements

# 验证安装
cargo --version
```

### 步骤 2: 升级 Node.js

```bash
# 检查当前版本
node --version

# 如果版本低于 15.14.0，需要升级
# 方法 1: 使用 nvm-windows (推荐)
nvm use 19.2.0

# 方法 2: 使用 winget
winget install OpenJS.NodeJS.LTS
```

### 步骤 3: 配置 Rust 链接器

```bash
# 添加 GNU 目标 (避免 MSVC 依赖)
rustup target add x86_64-pc-windows-gnu

# 安装 LLVM 作为链接器
winget install LLVM.LLVM
```

### 步骤 4: 启动应用程序

```bash
# 进入项目目录
cd E:\ai\bj\Lumina-Note

# 添加 Rust 到 PATH (PowerShell)
$env:PATH = "$env:USERPROFILE\.cargo\bin;$env:PATH"

# 启动开发服务器
npm run tauri dev
```

## 验证安装

### 检查依赖版本

```bash
# Rust
cargo --version          # cargo 1.92.0
rustc --version          # rustc 1.92.0

# Node.js
node --version           # v19.2.0
npm --version            # 9.x.x

# LLVM
clang --version          # clang version 21.1.8
```

### 检查应用程序状态

```bash
# 检查端口占用
netstat -ano | findstr :1420

# 检查进程
tasklist | findstr lumina-note
```

## 故障排除

### 常见问题

1. **PATH 未更新**
   ```powershell
   # 临时添加 Rust 到 PATH
   $env:PATH = "$env:USERPROFILE\.cargo\bin;$env:PATH"
   ```

2. **端口冲突**
   ```bash
   # 停止占用端口的进程
   Stop-Process -Id <PID> -Force
   ```

3. **编译失败**
   ```bash
   # 清理构建缓存
   cargo clean

   # 重新编译
   npm run tauri dev
   ```

## 项目结构

```
Lumina-Note/
├── src/                    # 前端源代码 (React/TypeScript)
├── src-tauri/             # Tauri 后端源代码 (Rust)
├── package.json           # Node.js 依赖配置
├── Cargo.toml            # Rust 依赖配置
└── tauri.conf.json       # Tauri 配置
```

## 开发环境设置

### 永久添加 Rust 到 PATH

1. 打开系统环境变量设置
2. 在用户变量中找到 `Path`
3. 添加 `%USERPROFILE%\.cargo\bin`
4. 重启终端

### IDE 配置

推荐使用：
- **VS Code** + Rust 扩展
- **Cursor** (已配置)
- **IntelliJ IDEA** + Rust 插件

## 参考资料

- [Tauri 官方文档](https://tauri.app/)
- [Rust 安装指南](https://rustup.rs/)
- [Node.js 下载](https://nodejs.org/)
- [winget 包管理器](https://learn.microsoft.com/zh-cn/windows/package-manager/winget/)

---

**最后更新**: 2025年12月24日
**适用环境**: Windows 10/11 + PowerShell
