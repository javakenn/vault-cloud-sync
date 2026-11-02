# 自己部署 Cloudflare，再让 Obsidian 同步

这是完整开源项目：Obsidian 插件 + Cloudflare Workers、D1、私有 R2。所有资源都建在你自己的账号里，不使用作者的服务或密钥。插件界面目前是中文，市场名称为 **Vault Cloud Sync**，安装目录 ID 保留 `ob-collector`。

## 1. 准备

- Node.js 22 或更新版本。
- 一个 Cloudflare 账号，先在控制台开通 R2。可能需要填写付款方式，请自行查看当前价格；向导不会购买付费 Workers 套餐或域名。
- 给原笔记仓库保留独立备份，不要让同一目录同时运行 iCloud 和本插件同步。

## 2. 一次初始化

```sh
git clone https://github.com/javakenn/vault-cloud-sync.git
cd vault-cloud-sync
npm ci
npm run setup:cloudflare
```

按提示在浏览器授权 Cloudflare，选择自己的账号，输入一个新的项目名。向导会创建专属 Worker、D1、私有 R2，生成管理员密钥，部署并校验服务，再生成 Mac、iPhone、安卓独立的设备配置和空仓库包。无需手改数据库 UUID 或复制作者账号 ID。

网络中断或 R2 尚未开通时，处理后在同一目录重新运行即可。已有进度会保存；不自动接管不属于此次初始化的同名 D1。不要丢失 `.data` 或把它公开，它包含密钥和恢复初始化需要的信息。

## 3. 电脑使用

在 `.data/devices/notes/` 找到 `mac-vault.zip`，解压后用 Obsidian 打开 `Cloud Notes`，启用第三方插件 **Vault Cloud Sync**。在插件设置中验证连接，然后开启双向同步，执行立即同步。

要接入已有仓库，把构建后的 `main.js`、根目录 `manifest.json`、`styles.css` 放入该仓库配置目录下的 `plugins/ob-collector/`。默认配置目录是 `.obsidian`。只安装这三个文件，勿复制其他仓库的 `data.json`；然后在插件设置导入 `mac.json`。先等待电脑首次上传完成，再接手机。

## 4. iPhone 和安卓

- **iPhone**：私密传输 `iphone-vault.zip`，在「文件」中解压，保留完整 `Cloud Notes` 和隐藏 `.obsidian`。先在 Obsidian 建立本地仓库，让「我的 iPhone → Obsidian」出现；关闭 App，把完整新文件夹放进去，再打开选择仓库。启用插件、验证连接、开启同步。iOS 若未识别复制的目录，不要覆盖已有笔记，请按 Obsidian 支持的仓库导入方式处理。
- **安卓**：传输 `android-vault.zip`，解压到本地 Documents，确认隐藏 `.obsidian` 保留。在 Obsidian 打开该目录并授权，启用插件、验证连接、开启同步。
- 两端都先用测试笔记和图片验证双向修改，再使用真实笔记。手机须保持 Obsidian 打开，系统后台挂起时无法保证同步。

插件尚未在社区市场上架，上面是手动安装方式；实体手机首次安装仍需你自己验证。

## 5. 多仓库与设备管理

所有 `notes` 设备连接相同的云端仓库，内容会合并。两个独立的本地仓库应使用不同的云端仓库 ID，例如：

```sh
npm run devices -- --vault work --platform mac --name "工作电脑"
npm run devices -- --vault work --platform iphone --name "工作手机"
```

同平台的更多设备可在服务管理网页创建新设备，勿共用令牌。向导输出的服务网址就是管理页；管理员密钥保存在 `.data/admin-secret.json`，不要填到插件中。

## 6. 边界

传输使用 HTTPS，没有端到端加密；后端管理员可以访问内容。隐藏目录和插件设置不参与同步。删除会传播到其他设备，历史和回收站仍保留云端旧块，没有自动历史清理。逻辑历史配额 10 GiB（包含旧版本）；单文件协议上限 256 MiB，但手机内存和 Cloudflare 免费套餐限制可能更低。尚未进行 5 GB 首次上传压测。

详情见 [英文说明](../README.md)、[隐私说明](../PRIVACY.md)、[自部署维护](SELF-HOSTING.md)。MIT 开源，免费提供代码；Cloudflare 费用由你自己的使用量和套餐决定。
