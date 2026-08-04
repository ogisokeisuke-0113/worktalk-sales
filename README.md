# Sales Board (worktalk-sales)

worktalk 直接採用支援サービスの営業管理システム。
React 19 + Vite 8 + Tailwind CSS v4 + Recharts で構築。
データは **localStorage（即時）** + **Supabase PostgreSQL（共有永続化）** の二層保存、
スプレッドシートは Google Apps Script Web App 経由で同期する。

---

## 目次

1. [開発者向けセットアップ（小野さんPC）](#1-開発者向けセットアップ小野さんpc)
2. [常時起動運用（小木曽さんPC）](#2-常時起動運用小木曽さんpc)
3. [自動起動: PM2（推奨）](#3-自動起動-pm2推奨)
4. [自動起動: launchd（macOSネイティブ）](#4-自動起動-launchdmacosネイティブ)
5. [リモート勤務用: Tailscale（オプション）](#5-リモート勤務用-tailscaleオプション)
6. [アップデート手順](#6-アップデート手順)
7. [トラブルシュート](#7-トラブルシュート)

---

## 1. 開発者向けセットアップ（小野さんPC）

### 前提

- Node.js **v20 以上**（推奨: v22 LTS）
- Git

### 初回

```bash
git clone https://github.com/ogisokeisuke-0113/worktalk-sales.git
cd worktalk-sales
npm install --legacy-peer-deps
```

> `--legacy-peer-deps` は必須。Vite 8 と `@tailwindcss/vite@4` の peer dependency が
> 衝突するため（動作には支障なし）。

### 環境変数

`.env.local` に以下を記述（未設定でもアプリは動作、Supabase 同期のみ無効になる）。

```env
VITE_SUPABASE_URL=https://xxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOi...
```

Supabase スキーマは `supabase/schema.sql` にある（初回は Supabase Dashboard の SQL Editor で実行）。

### 開発サーバー

```bash
npm run dev
# → http://localhost:5173
```

### 本番ビルド + ローカル確認

```bash
npm run build            # dist/ に本番ビルド
npm run preview          # http://localhost:4173（localhost のみ）
```

### npm scripts 一覧

| スクリプト | 用途 |
| --- | --- |
| `npm run dev` | 開発用サーバー（HMR あり）|
| `npm run build` | 本番ビルド（`dist/`）|
| `npm run preview` | 本番ビルドを localhost で確認 |
| `npm start` | 本番ビルドを **LAN 公開**（0.0.0.0 バインド、ポート 4173）|
| `npm run lint` | ESLint 実行 |

---

## 2. 常時起動運用（小木曽さんPC）

**方針**: 情報漏洩リスクを避けるため Vercel 等の外部公開は行わない。
社員1名（小木曽さん）のPCで `npm start` を常時起動し、他社員は同じ社内LANから
`http://<小木曽PCのローカルIP>:4173` でアクセスする。

### 初回セットアップ（小木曽PCで一度だけ）

```bash
# 1. Git / Node.js v20+ をインストール
#    macOS なら Homebrew: brew install git node

# 2. リポジトリ clone
git clone https://github.com/ogisokeisuke-0113/worktalk-sales.git ~/worktalk-sales
cd ~/worktalk-sales

# 3. 依存インストール
npm install --legacy-peer-deps

# 4. 環境変数を設定
cat > .env.local <<'EOF'
VITE_SUPABASE_URL=<小野さんから受領>
VITE_SUPABASE_ANON_KEY=<小野さんから受領>
EOF

# 5. 本番ビルド
npm run build

# 6. LAN 公開で起動
npm start
# → Local:   http://localhost:4173/
# → Network: http://192.168.x.x:4173/
```

### 小木曽PCのローカルIPを確認

```bash
# macOS
ifconfig | grep "inet " | grep -v 127.0.0.1
# 例: inet 192.168.10.42 netmask 0xffffff00 broadcast 192.168.10.255

# Windows
ipconfig | findstr IPv4
```

他社員は `http://192.168.10.42:4173` にブラウザからアクセス。

### 動作確認

- 小木曽PC 本人: http://localhost:4173/ でログイン画面が出れば OK
- 他社員: 同じ社内LAN から http://<小木曽PCのローカルIP>:4173/ で同じ画面が出れば OK

---

## 3. 自動起動: PM2（推奨）

PM2 は Node.js の常駐化ツール。プロセス監視・自動再起動・OS起動時の起動を一括管理できる。

### PM2 インストール（小木曽PCで一度だけ）

```bash
sudo npm install -g pm2
```

### アプリを PM2 に登録して起動

```bash
cd ~/worktalk-sales
npm run build                              # 事前に本番ビルドを作成
pm2 start npm --name worktalk-sales -- start
pm2 save                                    # 現在の起動リストを保存
pm2 startup                                 # 表示されたコマンドを sudo で実行
```

`pm2 startup` はOSに合った launchd/systemd の登録コマンドを表示するので、
表示された通りに sudo で実行すればOS再起動後も自動で立ち上がる。

### PM2 よくあるコマンド

```bash
pm2 list                        # 起動中プロセス一覧
pm2 logs worktalk-sales         # ログをリアルタイム表示
pm2 logs worktalk-sales --lines 100
pm2 restart worktalk-sales      # 再起動
pm2 stop worktalk-sales         # 停止
pm2 delete worktalk-sales       # 登録解除
pm2 monit                       # CPU/メモリ監視
```

---

## 4. 自動起動: launchd（macOSネイティブ）

PM2 を入れたくない場合の代替。macOS 標準の launchd で常駐化する。

### plist ファイルを作成

`~/Library/LaunchAgents/com.worktalk.sales.plist` に以下を保存
（`ogiso` と `/usr/local/bin/npm` のパスは環境に合わせて置き換え、
Apple Silicon なら `/opt/homebrew/bin/npm`）。

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.worktalk.sales</string>
  <key>WorkingDirectory</key>
  <string>/Users/ogiso/worktalk-sales</string>
  <key>ProgramArguments</key>
  <array>
    <string>/opt/homebrew/bin/npm</string>
    <string>start</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>/tmp/worktalk-sales.log</string>
  <key>StandardErrorPath</key>
  <string>/tmp/worktalk-sales.err</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string>
  </dict>
</dict>
</plist>
```

### 登録・起動

```bash
launchctl load ~/Library/LaunchAgents/com.worktalk.sales.plist
tail -f /tmp/worktalk-sales.log            # 起動ログを確認
```

### 停止・解除

```bash
launchctl unload ~/Library/LaunchAgents/com.worktalk.sales.plist
```

---

## 5. リモート勤務用: Tailscale（オプション）

社外からもアクセスさせたい場合、VPN より導入が簡単な Tailscale を使うと安全。
社内 LAN と同じ URL 感覚で外出先からもアクセス可能になる。

### 導入手順

1. 小木曽PC と 利用する各社員PC に Tailscale インストール
   - https://tailscale.com/download
2. 全員が **同じ Tailscale アカウント**（Google/Microsoft SSO で組織単位）でログイン
3. 小木曽PC の Tailscale IP を確認（`100.x.y.z` 形式）
   ```bash
   tailscale ip -4
   ```
4. 各社員は `http://100.x.y.z:4173` でアクセス

### メモ

- Tailscale の **Free プラン** は 100 デバイスまで無料
- MagicDNS を有効化すると `http://ogiso-mbp:4173` のようなホスト名アクセスも可能
- ACL で「社員だけ Sales Board にアクセス」等の制御も可能（Admin Console）

---

## 6. アップデート手順

小野さんが GitHub main ブランチに push した後、小木曽PCで:

```bash
cd ~/worktalk-sales
git pull origin main
npm install --legacy-peer-deps   # package.json が変わっていたら
npm run build                    # 必ずビルド（vite preview は dist/ が必要）

# PM2 運用の場合
pm2 restart worktalk-sales

# launchd 運用の場合
launchctl unload ~/Library/LaunchAgents/com.worktalk.sales.plist
launchctl load ~/Library/LaunchAgents/com.worktalk.sales.plist

# 手動運用の場合は Ctrl+C で止めて npm start を再実行
```

Slackで「Sales Board を反映しました。ブラウザをリロードしてください」と告知。

---

## 7. トラブルシュート

### `npm install` が peer dep エラーで失敗する

```
npm error ERESOLVE
npm error Conflicting peer dependency: vite@7.x
```

Vite 8 と `@tailwindcss/vite@4` の peer dep 衝突。`--legacy-peer-deps` を付ける。

```bash
npm install --legacy-peer-deps
```

### 他社員から http://<小木曽IP>:4173 にアクセスできない

- **ファイアウォール**: macOS システム環境設定 → ネットワーク → ファイアウォール →
  `node` プロセスを許可
- **同一ネットワークか**: 小木曽PC と接続元PC が同じ Wi-Fi/LAN にいるか確認
- **ポート**: 別プロセスが 4173 を使っていないか。`lsof -i :4173`

### PM2 で起動しない

- `npm run build` を事前に実行しているか確認（`vite preview` は `dist/` が無いとエラー）
- Node.js のパスが PM2 に見えているか。`which node` の結果を PM2 に環境変数として渡す
- ログ確認: `pm2 logs worktalk-sales --err`

### Supabase 同期が動かない

- `.env.local` の `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` が設定されているか
- 環境変数を変えた後は `npm run build` を再実行（Vite はビルド時にインライン化）
- ブラウザの DevTools → Console で `[db:xxx]` の警告を確認

### スプレッドシート同期が動かない

- 設定画面で GAS Web App URL が保存されているか
- GAS のデプロイ設定が「アクセス: 全員」になっているか
- ブラウザ DevTools → Network で GAS URL への GET が 200 か

---

## ディレクトリ構成

```
src/
├── App.jsx                    # ルート（タブ管理・Supabase起動同期・GAS同期）
├── main.jsx                   # エントリ（ToastProvider + ConfirmProvider）
├── constants.js               # 業種・企業規模・ステータス等の定義
├── storage.js                 # localStorage ラッパ
├── lib/
│   ├── db.js                  # Supabase CRUD
│   └── supabase.js            # Supabase client 初期化
└── components/
    ├── Dashboard.jsx          # KPI・グラフ（Recharts）
    ├── ProposalList.jsx       # 提案リスト（カンバン/テーブル切替）
    ├── KanbanBoard.jsx        # カンバンビュー（DnD）
    ├── TeleapoList.jsx        # テレアポリスト（架電記録・Zoom発信・優先スター）
    ├── SalesRepView.jsx       # 担当別集計
    ├── Settings.jsx           # 設定（ユーザー管理・GAS URL・メールテンプレ）
    ├── LoginScreen.jsx        # ログイン
    ├── ProposalModal.jsx      # 提案編集サイドパネル
    ├── CsvImportModal.jsx     # 提案CSVインポート
    ├── TeleapoCsvImport.jsx   # テレアポCSVインポート
    ├── MultiSelect.jsx        # 複数選択セレクト
    ├── Toast.jsx              # トースト通知 (useToast)
    ├── ConfirmDialog.jsx      # カスタム確認ダイアログ (useConfirm)
    └── EmptyState.jsx         # 空状態
supabase/schema.sql            # Supabase テーブル定義
```

---

## リンク

- リポジトリ: https://github.com/ogisokeisuke-0113/worktalk-sales
- 本番運用URL（社内LAN）: http://<小木曽PCのIP>:4173
