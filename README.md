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
7. [外部連携セットアップ (Wave 3)](#7-外部連携セットアップ-wave-3)
8. [トラブルシュート](#8-トラブルシュート)

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

## 7. 外部連携セットアップ (Wave 3)

Sales Board から新規テレアポ企業への SendGrid メール送信、Contact Form 7 経由の
資料DLリード受信、SendGrid Event Webhook による開封・クリック追跡を有効化する手順。

### 7-1. Supabase テーブル作成（初回のみ）

1. Supabase Dashboard を開く
2. **SQL Editor** → **New Query**
3. リポジトリの `supabase/schema.sql` を全文コピペして **Run**
4. Table Editor で以下6テーブルが作成されているか確認:
   `proposals` / `teleapo_items` / `users` / `download_leads` / `app_settings` / `email_events`

冪等な SQL なので、既にテーブルが存在していても安全に再実行できる（`IF NOT EXISTS` / `DROP POLICY IF EXISTS` で保護）。

### 7-2. Google Apps Script Web App のデプロイ

**専用の新規プロジェクトを作成**（既存のスプレッドシート同期 GAS とは分離）。責務が
3系統（メール送信トリガー・CF7受信・SendGrid event受信）に分かれるため。

1. https://script.google.com にアクセス → **新しいプロジェクト**
2. プロジェクト名を `worktalk-sales-gas` 等に設定
3. リポジトリの `gas/main.js` の内容を全文コピペ（デフォルトの `コード.gs` を置き換え）
4. 左サイドバー **設定 (⚙︎)** → **スクリプト プロパティ** に以下を追加:

   | プロパティ | 値 |
   | --- | --- |
   | `SUPABASE_URL` | `https://arhgxtdwnsciwmotvokl.supabase.co` |
   | `SUPABASE_ANON_KEY` | `sb_publishable_xxxxxxxx`（Sales Board で使っている anon key と同じ） |
   | `SENDGRID_API_KEY` | `SG.xxxxxxxxxxxx`（**SendGrid の実 API キー**） |
   | `FROM_EMAIL` | `noreply@work-talk.jp`（省略可、デフォルト同左） |
   | `FROM_NAME` | `WorkTalk営業チーム`（省略可、デフォルト同左） |

5. **デプロイ** → **新しいデプロイ** → 種類: **ウェブアプリ**
   - 説明: `Wave 3 initial deploy`
   - 次のユーザーとして実行: **自分**
   - アクセスできるユーザー: **全員**（匿名アクセス許可 ＝ SendGrid/CF7 からの POST を受けるため）
6. 発行された URL（例: `https://script.google.com/macros/s/AKfycbxxx.../exec`）を控える

### 7-3. Sales Board 設定画面に GAS URL を登録

1. Sales Board にログイン → ヘッダー右上 ⚙︎ → **設定**
2. **メール送信設定** セクションの **Sales Board メール送信用 GAS Web App URL** 欄に上記 URL を貼り付け
3. **保存** をクリック → トーストに「メール設定を保存しました」と出れば OK

### 7-4. SendGrid Event Webhook 設定

開封・クリック等のイベントを `email_events` テーブルに記録するため、SendGrid の
Event Webhook を有効化する。

1. SendGrid ダッシュボード → **Settings** → **Mail Settings** → **Event Webhooks** → **Create new webhook**
2. **HTTP Post URL** に:
   ```
   <GAS Web App URL>?action=sendgrid_event
   ```
   例: `https://script.google.com/macros/s/AKfycbxxx.../exec?action=sendgrid_event`
3. **Actions to be POSTed to your URL**: **全イベントを有効化**
   - Processed / Delivered / Opened / Clicked / Bounced / Dropped / Deferred / Spam Report / Group Resubscribe / Group Unsubscribe / Unsubscribe
4. **Enabled** を ON → **Save**
5. **Test Your Integration** で疎通確認（Apps Script → 実行数 タブで受信ログを見る）

### 7-5. WordPress Contact Form 7 の Webhook 設定

CF7（`media.work-talk.jp/lp/download/`）の資料DLフォーム送信を `download_leads`
テーブルに自動登録する。

#### 方法A: プラグイン `CF7 to Any API` を使う（推奨）

1. WordPress 管理画面 → プラグイン → 新規追加 → 「CF7 to Any API」を検索・インストール・有効化
2. Contact Form 7 → 対象フォームを編集 → **CF7 to API Settings** タブ
3. 設定:
   - **API URL**: `<GAS Web App URL>?action=cf7_lead`
   - **Method**: `POST`
   - **Content Type**: `application/x-www-form-urlencoded`
   - **Parameters**（CF7 のフィールド名をそのまま送る）:
     ```
     your-company=[your-company]
     your-name=[your-name]
     your-email=[your-email]
     your-tel=[your-tel]
     your-consent=[your-consent]
     ```
4. 保存 → 実フォーム送信テスト → Supabase の `download_leads` に行追加を確認

#### 方法B: functions.php で `wpcf7_before_send_mail` フック（プラグインなし）

`wp-content/themes/<active-theme>/functions.php` に追記:

```php
add_action('wpcf7_before_send_mail', function ($contact_form) {
    // 特定フォームだけ対象にしたい場合: if ($contact_form->id() != 1234) return;
    $submission = WPCF7_Submission::get_instance();
    if (!$submission) return;
    $d = $submission->get_posted_data();
    $body = http_build_query([
        'your-company' => $d['your-company'] ?? '',
        'your-name'    => $d['your-name'] ?? '',
        'your-email'   => $d['your-email'] ?? '',
        'your-tel'     => $d['your-tel'] ?? '',
        'your-consent' => is_array($d['your-consent'] ?? '') ? '1' : '0',
    ]);
    wp_remote_post('<GAS Web App URL>?action=cf7_lead', [
        'body'     => $body,
        'headers'  => ['Content-Type' => 'application/x-www-form-urlencoded'],
        'timeout'  => 5,
        'blocking' => false, // フォーム送信のレスポンスを待たせない
    ]);
});
```

### 7-6. 動作テスト手順

**⑥ CSV 自動送信テスト**
1. Sales Board → テレアポタブ → **CSVインポート**
2. `email` 列にテスト用アドレスを含むCSVをアップロード
3. プレビュー → **インポート実行** → 確認ダイアログで「◯件に送信」を選択
4. トーストに「◯件のメールを送信しました」→ SendGrid → Activity Feed で送信履歴を確認
5. Supabase Table Editor `email_events` に `event_type='processed'` レコード追加を確認

**⑦ CF7 リード受信テスト**
1. `media.work-talk.jp/lp/download/` でフォーム送信
2. Supabase Table Editor `download_leads` に行追加を確認
3. Sales Board → テレアポ → **ダウンロードリード** サブタブに表示されればOK

**⑧ SendGrid Event Webhook テスト**
1. ⑥で送信したテストメールを実際に **開封** / **リンククリック**
2. 数十秒〜数分後、Supabase Table Editor `email_events` に `event_type='open'`, `'click'` レコード追加を確認
3. Sales Board を再読み込み → テレアポリストのステータスバッジが自動で **開封済み** → **クリック済み** に更新

### 7-7. Wave 3 固有トラブルシュート

- **GAS 実行ログの確認**: Apps Script → **実行数** タブ、または各関数の `console.log` を実行数の詳細から見る
- **SendGrid 送信失敗**: SendGrid ダッシュボード → **Activity Feed** で失敗理由（bounce reason 等）確認
- **Supabase 401 が返る**: Script Properties の `SUPABASE_ANON_KEY` の値を再確認（先頭に空白が入っていないか）
- **CF7 Webhook が動かない**（プラグインなし方式）: `functions.php` 内の `wp_remote_post` のレスポンスを `error_log` に出して調べる
- **Event Webhook の重複エラー**: `email_events.sg_event_id` に UNIQUE INDEX を張ってあり、`Prefer: resolution=merge-duplicates` で自動上書きされるため通常はエラーにならない。もし ERROR が出たら重複ではなく別要因

---

## 8. トラブルシュート

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
├── App.jsx                    # ルート（タブ管理・Supabase起動同期・GAS同期・email_events集約）
├── main.jsx                   # エントリ（ToastProvider + ConfirmProvider）
├── constants.js               # 業種・企業規模・ステータス等の定義
├── storage.js                 # localStorage ラッパ
├── lib/
│   ├── db.js                  # Supabase CRUD (proposals/teleapo_items/users/download_leads/app_settings/email_events)
│   └── supabase.js            # Supabase client 初期化
└── components/
    ├── Dashboard.jsx          # KPI・グラフ（Recharts）
    ├── ProposalList.jsx       # 提案リスト（カンバン/テーブル切替）
    ├── KanbanBoard.jsx        # カンバンビュー（DnD）
    ├── TeleapoList.jsx        # テレアポリスト（架電記録・Zoom発信・優先スター）
    ├── SalesRepView.jsx       # 担当別集計
    ├── Settings.jsx           # 設定（ユーザー管理・GAS URL×2・メールテンプレ）
    ├── LoginScreen.jsx        # ログイン
    ├── ProposalModal.jsx      # 提案編集サイドパネル
    ├── CsvImportModal.jsx     # 提案CSVインポート
    ├── TeleapoCsvImport.jsx   # テレアポCSVインポート (Wave 3: 送信確認ダイアログ + GAS→SendGrid)
    ├── MultiSelect.jsx        # 複数選択セレクト
    ├── Toast.jsx              # トースト通知 (useToast)
    ├── ConfirmDialog.jsx      # カスタム確認ダイアログ (useConfirm)
    └── EmptyState.jsx         # 空状態
supabase/schema.sql            # Supabase テーブル定義（Wave 3で email_events 追加）
gas/main.js                    # Apps Script Web App コード（Wave 3: send_email / cf7_lead / sendgrid_event）
```

---

## リンク

- リポジトリ: https://github.com/ogisokeisuke-0113/worktalk-sales
- 本番運用URL（社内LAN）: http://<小木曽PCのIP>:4173
