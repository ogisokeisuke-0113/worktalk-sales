/* 新しい版が出たことを、配信経路を待たずに知る。
   GitHub Pages は index.html を10分キャッシュし、クエリを足しても
   キャッシュを返すため、配信を見に行く方法だけだと最大10分かかる。
   新しい版を開いた画面が Supabase に版を書き、他の画面はそれを見る。 */
import { open, company, makeReporter } from './harness.mjs'

const { check, done } = makeReporter('新しい版をすぐ知らせる')
const allErrs = []

/* ① 起動すると、自分の版を Supabase に登録する */
{
  const store = { rows: [] }
  const { page, errs, close } = await open('dist', [company('a', 'A社')], { appSettings: store })
  await page.waitForTimeout(6000)
  const row = store.rows.find(r => r.id === 'app_version')
  check('自分の版を登録する', !!row && Number(row.data?.buildId) > 0, row ? `buildId=${row.data?.buildId}` : 'なし')
  check('読み込んだファイル名も記録する', !!row?.data?.asset && /^index-/.test(row.data.asset), String(row?.data?.asset))
  allErrs.push(...errs)
  await close()
}

/* ② 自分より新しい版が登録されていたら、配信を見に行かずに気づく */
{
  const store = { rows: [{ id: 'app_version', data: { buildId: 9999999999, asset: 'index-NEWBUILD.js' } }] }
  const { page, errs, close } = await open('dist', [company('a', 'A社')], { appSettings: store })
  let reloaded = 0
  page.on('framenavigated', f => { if (f === page.mainFrame()) reloaded++ })
  await page.waitForTimeout(10000)
  check('新しい版に気づいて自動で再読み込みする', reloaded > 0, `${reloaded}回`)
  check('古い版で上書きしない', Number(store.rows[0].data.buildId) === 9999999999,
    String(store.rows[0].data.buildId))
  // 登録がおかしくて新しい版が実在しない場合、往復し続けてはいけない
  await page.waitForTimeout(12000)
  check('目的の版が来なければ往復を止める', reloaded <= 3, `${reloaded}回`)
  check('止まったら手動の案内に変わる',
    (await page.getByText('「今すぐ更新」を押してください').count()) > 0)
  allErrs.push(...errs)
  await close()
}

/* ③ 自分より古い版が登録されていても、更新を促さない（往復しない） */
{
  const store = { rows: [{ id: 'app_version', data: { buildId: 1, asset: 'index-OLD.js' } }] }
  const { page, errs, close } = await open('dist', [company('a', 'A社')], { appSettings: store })
  await page.waitForTimeout(8000)
  check('古い登録ではバナーを出さない', (await page.getByText('新しい版があります').count()) === 0)
  check('自分の版で上書きする', Number(store.rows[0].data.buildId) > 1, String(store.rows[0].data.buildId))
  allErrs.push(...errs)
  await close()
}

done(allErrs)
