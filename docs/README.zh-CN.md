# Vault Cloud Sync：从创建仓库到电脑手机同步

这是 Obsidian 插件与完整自部署后端。后端的 Worker、D1、私有 R2 都在**你自己的 Cloudflare 账号**中，笔记不会发给作者的服务。插件列表名称是 **Vault Cloud Sync**，设置页标题为「仓库云同步」，插件文件夹 ID 为 `ob-collector`。

2026-11-02：社区条目已公开，自动审核正在进行；尚未确认审核通过或能在 Obsidian 内安装。找不到市场安装入口时，使用下面的手动方式。[英文首页](../README.md) · [隐私说明](../PRIVACY.md)

## 先分清四件事

| 名称 | 是什么 | 是否每台设备都要做 |
| --- | --- | --- |
| Cloudflare 项目 | 保存云端文件和版本的后端服务 | 只部署一次，后续设备共用 |
| 本地笔记仓库 | Obsidian 打开的文件夹 | 电脑和手机各有一份本地副本 |
| 插件 | 安装在本地仓库中的三个文件 | 每个本地仓库分别安装、启用 |
| 设备配置 | 包含服务地址、设备令牌、云端仓库 ID 的 JSON | 每个安装独立一份，不能共用令牌 |

建议按顺序完成：**部署后端 → 电脑建测试仓库并添加插件 → 电脑首次上传 → 手机安装并下载 → 双向验证 → 再接入真实笔记**。

## 1. 准备电脑和 Cloudflare

1. 在电脑安装 [Obsidian](https://obsidian.md/download)、[Node.js 22 或更新版本](https://nodejs.org/en/download) 和 [Git](https://git-scm.com/downloads)。Mac 使用「终端」，Windows 使用 PowerShell。手机不需要装 Node.js 或 Git。
2. 在终端依次运行以下命令，确认都显示版本号：

   ```sh
   node --version
   npm --version
   git --version
   ```

3. 登录自己的 [Cloudflare 控制台](https://dash.cloudflare.com/)，进入 **R2 Object Storage** 完成首次开通。可能需要填写付款方式并确认计费条款；费用按你自己的使用量和套餐计算。向导不购买付费 Workers 套餐或域名。
4. 给已有笔记保留独立备份。将准备同步的工作副本放在未被 iCloud、OneDrive 等管理的本地目录；Mac 的 Documents/Desktop 也可能已启用 iCloud，不能只凭名字判断。可以在用户主目录建立本地 `Vaults` 文件夹。

## 2. 一次部署：创建自己的云端服务

在电脑终端依次运行：

```sh
git clone https://github.com/javakenn/vault-cloud-sync.git
cd vault-cloud-sync
npm ci
npm run setup:cloudflare
```

接着按提示操作：

1. 如果浏览器打开 Cloudflare 授权页，登录并允许授权，再回终端。若多个账号可用，选择自己的目标账号。
2. 在 **New project name** 输入新项目名，例如 `my-vault-sync`。名称必须是 3–48 位小写字母、数字或连字符，并以字母开头；直接回车使用默认值 `vault-cloud-sync`。这是服务器资源名，不是 Obsidian 本地仓库名。
3. 等待向导完成数据库和存储创建、Worker 部署、密钥设置、健康检查及设备生成。无需手动填写 D1 UUID 或使用作者账号 ID。此时还不会上传你的原笔记。
4. 成功后终端会显示你的服务网址及 Mac、iPhone、安卓配置包路径。服务网址类似下面的示例，**实际请使用终端输出值**：

   ```text
   https://my-vault-sync.your-account.workers.dev
   ```

5. 保留项目文件夹。以后更新或管理仍在同一个文件夹操作。网络失败或 R2 未开通时，处理后重新运行 `npm run setup:cloudflare`；不要为了重试随意删除 `.data` 或已有数据库。部分创建冲突见[维护说明](SELF-HOSTING.md#retry-and-recovery)。

### 生成的配置在哪里

下面路径都相对于刚下载的 **vault-cloud-sync 项目文件夹**，不在你的 Obsidian 仓库中。Mac Finder 按 `Command+Shift+.` 显示隐藏文件；Windows 资源管理器开启「查看 → 显示 → 隐藏的项目」。

| 文件 | 用途 |
| --- | --- |
| `.data/devices/notes/mac-vault.zip` | 电脑新建测试仓库，已含插件和连接配置 |
| `.data/devices/notes/mac.json` | 给已有电脑仓库导入连接 |
| `.data/devices/notes/iphone-vault.zip`、`iphone.json` | 只发给 iPhone |
| `.data/devices/notes/android-vault.zip`、`android.json` | 只发给安卓 |
| `.data/admin-secret.json` | 管理网页使用，只复制其中 `ADMIN_TOKEN` 的值，不填进插件 |
| `.data/setup-state.json` | 初始化进度与实际服务地址 |
| `wrangler.local.jsonc` | 自己的 Cloudflare 绑定，后续部署使用 |

设备 JSON 和设备 ZIP 都包含访问令牌，只在自己的设备间私密传送，不要放到公开仓库、Issue 或 Release。`.data` 应私密备份。

## 3. 电脑：创建本地仓库并添加插件

### 方式 A：先用新的测试仓库

1. 找到 `mac-vault.zip` 并解压，得到 **Cloud Notes** 文件夹。将整个文件夹放入不参与其他云盘同步的本地位置，保留其中隐藏的 `.obsidian`。
2. 打开 Obsidian 仓库切换界面，选 **打开文件夹作为仓库 / Open folder as vault**，选择 **Cloud Notes 本身**，不要选 ZIP 或上一级文件夹。这就把该文件夹添加为了本地笔记仓库。
3. 如提示，信任你自己生成的仓库并启用第三方插件。在 **设置 → 第三方插件** 中开启 **Vault Cloud Sync**。
4. 进入插件设置「仓库云同步」。预装包已经填好本设备的连接，在 **保存并验证连接** 一行点击 **连接**。应看到「连接成功」和设备名、云端仓库 ID。
5. 开启 **启用仓库双向同步**，在 **立即同步** 一行点击 **同步**。状态应为「仓库云同步 · 已同步」。默认自动同步原本关闭，开启后每 60 秒检查一次。
6. 新建 `同步测试.md`，写几行文字并加一张小图片，再同步一次。等待完成后再接手机。

### 方式 B：把插件添加到已有仓库

先备份；若旧仓库在 iCloud 等同步目录中，先关闭各端 Obsidian，复制整份仓库到非同步本地目录，保留原件备份，之后打开本地副本。

**① 下载插件的三个文件**

从同一 [0.3.0 Release](https://github.com/javakenn/vault-cloud-sync/releases/tag/0.3.0) 下载附件 `main.js`、`manifest.json`、`styles.css`。不要把页面上的 **Source code ZIP** 当成安装包；它是源码。也不要把含凭据的完整 `mac-vault.zip` 覆盖解压到真实仓库。

**② 创建插件文件夹并放入文件**

关闭这个仓库，在文件管理器中建立以下目录：

```text
你的原笔记仓库/
├── 原来的笔记和附件
└── .obsidian/
    └── plugins/
        └── ob-collector/
            ├── main.js
            ├── manifest.json
            └── styles.css
```

只添加缺失的文件夹和这三个文件，不覆盖其他插件和整个 `.obsidian`。不要多套一层 `ob-collector/ob-collector/`。如果修改过 Obsidian 配置目录名，使用自己的配置目录代替 `.obsidian`。

插件按**仓库**独立安装：其他仓库装过，这个仓库仍需安装。可以从另一仓库复制这三个程序文件，但**不要复制 `data.json`**，它带有另一仓库的设备身份和同步基线。同一个仓库后续更新插件时则应保留它自己原有的 `data.json`。

**③ 启用、导入并首次同步**

1. 重新打开这个仓库，进入 **设置 → 第三方插件**，启用 **Vault Cloud Sync**。看不到时先检查文件层级、文件后缀并重启 Obsidian。
2. 用文本编辑器打开项目里的 `mac.json`，复制完整 JSON（包括大括号）。
3. 在插件设置 **导入设备连接配置** 中粘贴，点击 **导入**。应显示「已绑定」和设备名、云端仓库 ID。
4. 在 **保存并验证连接** 点击 **连接**，确认连接成功。这里不要使用管理员密钥。
5. 开启 **启用仓库双向同步**，点击 **立即同步 → 同步**，等待首次上传完成。

首次同步会合并本地与云端内容，不是单向覆盖。相同路径、不同内容可能产生冲突副本。两个不想合并的独立仓库应先创建不同云端仓库 ID，见第 6 节。

## 4. iPhone：添加插件并连接同一个云端仓库

手机不再部署后端，使用电脑同一服务网址和云端仓库 ID，但使用 **iphone** 配置，不能复制 Mac 的设备令牌。

### 市场安装可用时

1. 在手机 Obsidian 创建本地新仓库，关闭 **存储在 iCloud / Save in iCloud Drive**。
2. 进入 **设置 → 第三方插件 → 浏览**，搜索 **Vault Cloud Sync**。确认能安装后安装并启用；审核尚未通过或搜不到时使用下面手动路线。
3. 私密发送 `iphone.json` 到手机，作为文本打开，复制完整 JSON，在插件中通过 **导入设备连接配置 → 导入** 添加。
4. 验证连接、开启双向同步、立即同步。保持 Obsidian 打开，等待电脑的测试笔记和图片出现。

### 审核期间的手动路线

1. 先在 iPhone Obsidian 创建临时本地仓库，关闭 iCloud 存储，让「文件 → 我的 iPhone → Obsidian」目录出现。
2. 用 AirDrop 或其他私密传输将 `iphone-vault.zip` 发到手机，在「文件」解压，得到完整 **Cloud Notes**，保留其隐藏 `.obsidian`。
3. 完全关闭 Obsidian，把**整个新文件夹**放入「我的 iPhone → Obsidian」中，不覆盖任何已有仓库或同名文件夹。
4. 重开 Obsidian，若识别到该仓库，选择它，启用插件，验证预填的连接，开启同步。

**iOS 限制必须说明**：系统「文件」不能通用地操作 `.obsidian`，复制文件夹后的仓库识别也可能不同；此版本的实体 iPhone 安装尚未实测。未识别时请停止，不要覆盖真实笔记。可以用电脑在一次性 iCloud 空仓库中先安装插件、保持本插件同步关闭，再按 Obsidian 官方流程将整份仓库移到「我的 iPhone / 设备 → Obsidian」，确认已离开 iCloud 后才启用同步。这是安装中转，不是长期让两套同步同时运行。参考[配置目录](https://obsidian.md/help/configuration-folder)和[转为本地仓库](https://obsidian.md/help/sync/switch)。

## 5. 安卓：添加插件并首次下载

1. 将 `android-vault.zip` 私密传到手机，在本地 Documents 中解压为 **Cloud Notes**。
2. 文件管理器开启「显示隐藏文件」，确认 `.obsidian/plugins/ob-collector/` 及插件文件保留。
3. Obsidian 选择 **打开文件夹作为仓库**，选择 **Cloud Notes 本身**并授予目录权限，不选择 ZIP 或上级目录。
4. 在第三方插件中启用 **Vault Cloud Sync**，验证预填连接，开启双向同步，点击立即同步。
5. 保持 App 打开，确认电脑测试笔记和图片到达。手机修改一行后先同步手机，再同步电脑，验证修改也能传回。

若通过已获批的市场安装，则在手机本地仓库安装插件后导入完整 `android.json`。实体安卓首次安装仍需你自己验证。

## 6. 创建其他云端仓库或添加更多设备

### 新建独立云端仓库

初始配置的云端 ID 是 `notes`。同 ID 的设备共享并合并内容；不能拿同一套 `notes` 配置去连接两个本想独立的本地仓库。

例如另建一个独立的 `work` 云端仓库及电脑、手机配置，在原项目文件夹运行：

```sh
npm run devices -- --vault work --platform mac --name "工作电脑"
npm run devices -- --vault work --platform iphone --name "工作手机"
```

生成文件位于 `.data/devices/work/`。在对应本地仓库安装插件并导入新配置即可。第一个设备建立访问身份，首次文件提交建立云端版本记录，不需要手动改数据库。

### 管理网页添加设备

1. 浏览器打开初始化向导输出的**实际服务网址**。
2. 打开 `.data/admin-secret.json`，只复制 `ADMIN_TOKEN` 后面的**值**，不带引号、大括号或字段名。
3. 将值粘贴到网页 **管理员令牌**，填写 **云端仓库 ID**（如 `notes` 或 `work`），点击 **连接管理**。
4. 在 **新设备名称** 填入例如「第二台 Mac」，点击 **生成设备配置**。
5. 将生成的**完整设备 JSON**复制或私密传到对应设备，导入插件。这份原始令牌只在创建时返回，请妥善保存。
6. 用完管理页点击 **清除凭据**。设备丢失时可在列表点击 **撤销**；它只阻止后续云端访问，不会抹掉已下载的本地文件。

CLI 每个云端仓库/平台保留一套配置；同平台要添加更多设备时用管理网页生成新令牌，不要把同一份 JSON 发给多台设备。

## 7. 从源码创建插件安装包

面向想自己构建的用户：在下载的项目目录运行：

```sh
npm ci
npm run build
```

构建后得到根目录 `main.js`、`manifest.json`、`styles.css`，以及 `dist/ob-collector/` 和 `dist/ob-collector-0.3.0.zip`。将 `dist/ob-collector/` 的内容放到本地仓库配置目录的 `plugins/ob-collector/`，再按第 3 节启用和导入配置。

`npm run build` **只生成插件程序**；`npm run setup:cloudflare` 才会额外部署后端并生成 `.data` 中含凭据的设备仓库包。公开插件包可以分享，私密设备包不能公开。

## 8. 常见问题

- **命令找不到或 npm 报没有 package.json**：先确认 Node/Git 安装完成并重新打开终端，进入克隆的 `vault-cloud-sync` 文件夹再运行 npm 命令。
- **localhost 授权回调拒绝连接**：Wrangler 的登录等待可能超时。运行 `npx wrangler login`，及时完成新打开页面的授权，再运行初始化；刷新旧回调页面不会恢复监听。
- **R2 未开通或 10042**：先到自己的 Cloudflare 控制台开通 R2，再在同一目录重试向导。
- **找不到配置/插件目录**：`.data` 在项目目录，`.obsidian` 在笔记仓库，二者不同；先显示隐藏文件。iPhone 的隐藏目录限制见第 4 节。
- **插件未出现**：检查是不是放成了双层 `ob-collector`，是否缺少三个文件或被加上 `.txt`，以及是否启用了第三方插件。
- **连接失败**：确认使用实际服务地址和同一部署生成的设备 JSON；不要使用 README 示例地址、管理员 JSON 或另一服务的令牌。
- **之前能用，现在 401**：令牌可能已撤销。通过管理网页创建新设备并导入，向导不会自动替换已失效的旧令牌。
- **手机不同步**：保持 Obsidian 打开，确认已开启「启用仓库双向同步」，运行立即同步，等待首台设备完成上传。系统后台挂起不保证同步。
- **两个仓库内容混在一起**：立即暂停误连接的同步并备份，检查云端 ID 是否相同。先创建独立 ID 和配置，不要直接删云端文件来拆分，因为删除也会传播。
- **文件太大或云端域名不可达**：先用小笔记和图片确认连接，再查看[容量与网络说明](SELF-HOSTING.md#capacity-and-availability)。需要在自己的网络和设备上验证，协议上限不是免费套餐和所有手机的处理保证。

更多见[排错表](TROUBLESHOOTING.md)。提问时提供系统、Obsidian/插件版本、失败步骤和错误文字，先遮住所有令牌、私密配置和笔记内容。

## 日常使用与边界

开启后默认每 60 秒同步，也可运行命令「立即同步」「查看当前笔记历史 / 恢复」「查看云端回收站」。冲突副本需要自行合并；删除会传到其他设备，不能用同步代替独立备份。

隐藏目录、主题和插件设置不参与同步；每个仓库独立安装、配置。传输使用 HTTPS，没有端到端加密，后端管理员可以访问内容。历史逻辑配额 10 GiB（包含旧版本），没有自动清理；单文件协议上限 256 MiB，但手机内存或 Cloudflare 套餐可能更低。尚未进行 5 GB 首次全量传输验证。

项目 MIT 开源；代码免费，Cloudflare 账单由你自己的账号和用量决定。[隐私说明](../PRIVACY.md) · [维护、更新和备份](SELF-HOSTING.md)
