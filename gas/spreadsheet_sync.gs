/**
 * Sales Board スプレッドシート同期スクリプト
 * スプレッドシートID: 1AOHOsTQoGK5TfcM8uQzxru39ElWgm8VGC4_K31pZVhg
 * シート名: 直提案リスト
 *
 * デプロイ手順:
 * 1. script.google.com で新規プロジェクト作成
 * 2. このコードを貼り付け
 * 3. 「デプロイ」→「新しいデプロイ」
 * 4. 種類: ウェブアプリ
 * 5. 次のユーザーとして実行: 自分
 * 6. アクセスできるユーザー: 全員
 * 7. デプロイ → 発行URLをコピー → Sales Board設定画面に貼る
 */

const SPREADSHEET_ID = '1AOHOsTQoGK5TfcM8uQzxru39ElWgm8VGC4_K31pZVhg';
const SHEET_NAME = '直提案リスト';

function doGet(e) {
  try {
    const type = e && e.parameter && e.parameter.type;

    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);

    if (type === 'downloads') {
      // ダウンロード履歴シート（あれば）
      const dlSheet = ss.getSheetByName('ダウンロード履歴');
      if (!dlSheet) {
        return jsonResponse([]);
      }
      const dlRows = dlSheet.getDataRange().getValues();
      const dlHeaders = dlRows[0];
      const dlData = dlRows.slice(1).map((row, i) => {
        const obj = { _rowIndex: i + 2 };
        dlHeaders.forEach((h, j) => { obj[String(h)] = row[j]; });
        return obj;
      });
      return jsonResponse(dlData);
    }

    // 通常: 直提案リストを返す
    const sheet = ss.getSheetByName(SHEET_NAME);
    if (!sheet) {
      return jsonResponse({ error: `シート "${SHEET_NAME}" が見つかりません` });
    }

    const rows = sheet.getDataRange().getValues();
    if (rows.length < 4) {
      return jsonResponse([]);
    }

    // 1行目=タイトル行、2行目=空行、3行目=ヘッダー、4行目以降=データ
    const HEADER_ROW = 2; // 0-indexed: rows[2] = 3行目
    const DATA_START = 3; // 0-indexed: rows[3] = 4行目

    const headers = rows[HEADER_ROW].map(h => String(h).trim());
    const data = rows.slice(DATA_START).map((row, i) => {
      const obj = { _rowIndex: i + DATA_START + 1 }; // 実際のシート行番号
      headers.forEach((h, j) => {
        let val = row[j];
        // Date オブジェクトを文字列に変換
        if (val instanceof Date) {
          if (val.getTime() === 0) {
            val = '';
          } else {
            const y = val.getFullYear();
            const m = String(val.getMonth() + 1).padStart(2, '0');
            const d = String(val.getDate()).padStart(2, '0');
            val = `${y}/${m}/${d}`;
          }
        }
        obj[h] = val;
      });
      return obj;
    });

    return jsonResponse(data);

  } catch (err) {
    return jsonResponse({ error: err.message });
  }
}

function jsonResponse(data) {
  const output = ContentService.createTextOutput(JSON.stringify(data));
  output.setMimeType(ContentService.MimeType.JSON);
  return output;
}
