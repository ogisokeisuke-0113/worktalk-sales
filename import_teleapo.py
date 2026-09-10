"""
テレアポリストCSVインポートスクリプト
Google Sheets からエクスポートした CSV を Supabase にインポートする
"""

import csv
import json
import sys
import uuid
import urllib.request
from datetime import datetime

SUPABASE_URL = 'https://antqewvlzfonsakgndxt.supabase.co'
SUPABASE_KEY = 'sb_publishable__37RI5zv54AI023pjvFdbA_AUkoAme2'

# ステータスマッピング（スプレッドシート → システム）
STATUS_MAP = {
    '受けブロ': '受付ブロック',
    '受付ブロック': '受付ブロック',
    '不在': '担当者不在',
    '担当者不在': '担当者不在',
    '不通': '不通',
    '担当者接触': '担当者接触',
    '担当者お断り': '断り',
    '断り': '断り',
    '番号不明/間違い': '不通',
    '番号不明': '不通',
    '折り返し待ち': '折り返し依頼',
    '折り返し依頼': '折り返し依頼',
    'アポ取得': 'アポ獲得',
    'アポ獲得': 'アポ獲得',
    '問い合わせ': '資料送付',
    '資料送付': '資料送付',
}

# 従業員規模マッピング
SCALE_MAP = {
    '1〜30名未満': '1〜30名',
    '30名〜100名未満': '31〜100名',
    '100名〜300名未満': '101〜300名',
    '300名〜500名未満': '301〜500名',
    '500名〜1000名未満': '501〜1000名',
    '1000名〜3000名未満': '1001〜3000名',
    '3000名〜': '3001名〜',
}

def normalize_scale(val):
    if not val:
        return ''
    return SCALE_MAP.get(val.strip(), val.strip())

def normalize_phone(val):
    if not val:
        return ''
    return val.replace('-', '').replace('ー', '').replace('−', '').replace(' ', '').replace('　', '')

def parse_datetime(val):
    if not val:
        return ''
    val = val.strip()
    for fmt in ['%Y/%m/%d %H:%M:%S', '%Y/%m/%d %H:%M', '%Y/%m/%d', '%Y-%m-%d %H:%M:%S', '%Y-%m-%d']:
        try:
            return datetime.strptime(val, fmt).isoformat()
        except ValueError:
            continue
    return val

def find_header_row(rows):
    for i, row in enumerate(rows):
        if '企業名' in row:
            return i
    return 0

def build_call_history(row, headers):
    """各回の架電情報を callHistory 配列に変換"""
    history = []
    # 1〜11回目を探す
    call_groups = []
    i = 0
    while i < len(headers):
        h = headers[i].strip()
        if '回目' in h or h == '1回目':
            # result列のインデックス
            result_idx = i
            caller_idx = i + 1 if i + 1 < len(headers) else None
            date_idx = None
            # 次の列が架電者で、その次が日程かチェック
            if caller_idx and i + 2 < len(headers):
                next_h = headers[i + 2].strip()
                if next_h == '日程' or next_h == '':
                    date_idx = i + 2
            call_groups.append((result_idx, caller_idx, date_idx))
        i += 1

    # シンプルな固定インデックス方式（ヘッダー解析が難しい場合のフォールバック）
    # 列構造: 重複(0) 企業名(1) 業種(2) 従業員規模(3) 番号(4) 担当者名(5) ステータス(6) メモ(7)
    # 1回目(8) 架電者(9) 日程(10)
    # 2回目(11) 架電者(12) 日程(13)
    # 3回目(14) 架電者(15) 日程(16)
    # 4回目(17) 架電者(18) 日程(19)
    # 5回目(20) 架電者(21) [空](22)
    # 6回目(23) 架電者(24) [空](25)
    # ...

    CALL_COLS = [
        (8, 9, 10),   # 1回目: result, 架電者, 日程
        (11, 12, 13), # 2回目
        (14, 15, 16), # 3回目
        (17, 18, 19), # 4回目
        (20, 21, None), # 5回目（日程なし）
        (23, 24, None), # 6回目
        (26, 27, None), # 7回目
        (29, 30, None), # 8回目
        (32, 33, None), # 9回目
        (35, 36, None), # 10回目
        (38, 39, None), # 11回目
    ]

    for (ri, ci, di) in CALL_COLS:
        result_val = row[ri].strip() if ri < len(row) else ''
        caller_val = row[ci].strip() if ci and ci < len(row) else ''
        date_val = row[di].strip() if di and di < len(row) else ''

        # TRUE/FALSE の場合は「架電あり/なし」のチェックボックス
        if result_val.upper() == 'FALSE' or result_val == '':
            continue
        if result_val.upper() == 'TRUE':
            result_val = ''  # 結果不明として記録

        history.append({
            'id': str(uuid.uuid4()),
            'result': STATUS_MAP.get(result_val, result_val),
            'calledBy': caller_val,
            'calledAt': parse_datetime(date_val),
            'callType': '',
            'callContent': '',
            'rejectionReason': '',
            'note': '',
        })

    return history

def import_csv(filepath):
    with open(filepath, encoding='utf-8-sig') as f:
        reader = csv.reader(f)
        rows = list(reader)

    header_idx = find_header_row(rows)
    headers = rows[header_idx]
    data_rows = [r for r in rows[header_idx + 1:] if any(c.strip() for c in r)]

    print(f"ヘッダー行: {header_idx + 1}行目")
    print(f"データ行数: {len(data_rows)}")

    # 既存レコードを取得（重複チェック用）
    req = urllib.request.Request(
        SUPABASE_URL + '/rest/v1/teleapo_items?select=id,data',
        headers={'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY}
    )
    res = urllib.request.urlopen(req)
    existing = json.loads(res.read())
    existing_names = set()
    existing_phones = set()
    for e in existing:
        d = e['data'] if isinstance(e['data'], dict) else json.loads(e['data'])
        if d.get('companyName'):
            existing_names.add(d['companyName'].strip().lower())
        if d.get('phone'):
            existing_phones.add(normalize_phone(d['phone']))

    new_items = []
    skipped = []

    for row in data_rows:
        def get(idx, default=''):
            return row[idx].strip() if idx < len(row) else default

        company = get(2)  # 企業名（0=重複フラグ, 1=番号, 2=企業名）
        if not company:
            continue

        phone = normalize_phone(get(5))  # 番号
        status_raw = get(7)              # ステータス
        memo = get(8)                    # メモ

        # 重複チェック
        if company.strip().lower() in existing_names or (phone and phone in existing_phones):
            skipped.append(company)
            continue

        call_history = build_call_history(row, headers)

        # アイテムステータスの決定
        item_status = '未架電'
        if call_history:
            last_result = call_history[-1].get('result', '')
            if last_result == 'アポ獲得':
                item_status = 'アポ確定'
            elif last_result == '折り返し依頼':
                item_status = '折り返し待ち'
            else:
                item_status = '架電済'
        elif status_raw:
            mapped = STATUS_MAP.get(status_raw, '')
            if mapped == 'アポ獲得':
                item_status = 'アポ確定'
            elif mapped == '折り返し依頼':
                item_status = '折り返し待ち'
            elif mapped:
                item_status = '架電済'

        item = {
            'id': str(uuid.uuid4()),
            'companyName': company,
            'industry': get(3),
            'employeeScale': normalize_scale(get(4)),
            'phone': phone,
            'contactName': get(6),
            'status': item_status,
            'memo': memo,
            'callHistory': call_history,
            'keepHistory': [],
            'isKept': False,
            'keptBy': '',
            'keptAt': '',
            'salesRep': '未確定',
            'email': '',
            'emailStatus': '未送信',
            'companyUrl': '',
            'prefecture': '',
            'listingStatus': '',
            'recruitmentPhone': '',
            'recruitmentAdSpend': '',
            'recruitmentJobType': '',
            'salesScale': '',
            'employeeGrowth': '',
            'nextCallDate': '',
            'listSource': '',
        }
        new_items.append(item)

    print(f"インポート対象: {len(new_items)}件 / スキップ（重複）: {len(skipped)}件")
    if skipped:
        print(f"スキップ: {skipped[:10]}{'...' if len(skipped) > 10 else ''}")

    if not new_items:
        print("インポートするデータがありません")
        return

    confirm = input(f"\n{len(new_items)}件をインポートしますか？ (y/n): ")
    if confirm.lower() != 'y':
        print("キャンセルしました")
        return

    # バッチ挿入（50件ずつ）
    BATCH = 50
    success = 0
    for i in range(0, len(new_items), BATCH):
        batch = new_items[i:i + BATCH]
        payload = json.dumps([{'data': item} for item in batch]).encode()
        req = urllib.request.Request(
            SUPABASE_URL + '/rest/v1/teleapo_items',
            data=payload,
            headers={
                'apikey': SUPABASE_KEY,
                'Authorization': 'Bearer ' + SUPABASE_KEY,
                'Content-Type': 'application/json',
                'Prefer': 'return=minimal',
            },
            method='POST'
        )
        urllib.request.urlopen(req)
        success += len(batch)
        print(f"  {success}/{len(new_items)}件完了...")

    print(f"\n✅ {success}件のインポートが完了しました")

if __name__ == '__main__':
    if len(sys.argv) < 2:
        print("使い方: python3 import_teleapo.py <CSVファイルパス>")
        sys.exit(1)
    import_csv(sys.argv[1])
