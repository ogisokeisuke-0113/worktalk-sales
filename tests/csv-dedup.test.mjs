/* CSVインポートの重複チェック。
   2026-10-06 の報告：企業名と電話番号の「両方」が一致したときだけ重複としていたため、
   同じ会社でも番号が違えば登録できてしまっていた。
   どちらか一方が一致したら重複として除外する。 */
import fs from 'fs'
import path from 'path'
import { open, company, makeReporter } from './harness.mjs'

const ITEMS = [
  company('a', 'マイキャリア株式会社', { phone: '06-6318-5577' }),
  company('b', '既存ホーム株式会社', { phone: '03-1111-2222' }),
]

const CSV = [
  '企業名,代表電話番号,業種,従業員規模',
  // 社名が同じで番号が違う（今回の報告そのもの）→ 除外されるべき
  'マイキャリア株式会社,050-5497-5819,人材,1〜30名',
  // 番号が同じで社名が違う → 除外されるべき
  '別名カンパニー株式会社,03-1111-2222,人材,1〜30名',
  // 全角・空白違いの同名 → 除外されるべき
  'マイキャリア　株式会社,099-999-9999,人材,1〜30名',
  // どちらも新規 → 登録される
  '新規サンプル株式会社,045-333-4444,人材,1〜30名',
  // CSV内で先の行と社名が重複 → 除外されるべき
  '新規サンプル株式会社,045-555-6666,人材,1〜30名',
].join('\n')

const { page, errs, close } = await open('dist', ITEMS)
const { check, done } = makeReporter('CSVインポートの重複チェック')

const file = path.join(fs.mkdtempSync('/tmp/csv-'), 'list.csv')
fs.writeFileSync(file, '﻿' + CSV, 'utf8')

await page.getByRole('button', { name: /CSVインポート/ }).first().click()
await page.waitForTimeout(2000)
check('説明がどちらか一致になっている',
  (await page.getByText(/企業名か電話番号のどちらかが一致/).count()) > 0)

await page.locator('input[type=file]').first().setInputFiles(file)
await page.waitForTimeout(2500)

// カラムマッピング画面を進める
await page.getByRole('button', { name: /プレビュー/ }).first().click()
await page.waitForTimeout(2000)

const nums = await page.evaluate(() => {
  const t = (document.body.textContent || '').replace(/\s+/g, ' ')
  const take = re => { const m = t.match(re); return m ? Number(m[1]) : null }
  return {
    dup: take(/重複データの詳細を表示 \((\d+)件\)/),
    body: t.slice(0, 0),
  }
})
check('重複として除外された件数', nums.dup === 4, `${nums.dup}件（期待4）`)

await page.getByText(/重複データの詳細を表示/).first().click()
await page.waitForTimeout(400)
const dupText = (await page.locator('details').filter({ hasText: '重複データの詳細' }).first().innerText()).replace(/\s+/g, ' ')
check('社名一致で除外される（番号違い）', dupText.includes('マイキャリア株式会社') && /企業名が一致/.test(dupText), dupText.slice(0, 80))
check('番号一致で除外される（社名違い）', dupText.includes('別名カンパニー株式会社') && /電話番号が一致/.test(dupText))
check('全角・空白違いの同名も除外される', dupText.includes('マイキャリア　株式会社') || dupText.includes('マイキャリア 株式会社'))
check('CSV内の重複も除外される', (dupText.match(/新規サンプル株式会社/g) || []).length === 1, dupText.slice(0, 120))
check('重複していない行は残る', !/新規サンプル株式会社,045-333/.test(dupText))

done(errs)
await close()
