"""
既存の proposals に service: 'worktalk' をセットするマイグレーションスクリプト
service フィールドが空・未設定のレコードのみ更新する
"""

import json
import urllib.request

SUPABASE_URL = 'https://antqewvlzfonsakgndxt.supabase.co'
SUPABASE_KEY = 'sb_publishable__37RI5zv54AI023pjvFdbA_AUkoAme2'

def fetch_all_proposals():
    PAGE = 1000
    all_records = []
    offset = 0
    while True:
        url = f'{SUPABASE_URL}/rest/v1/proposals?select=id,data&limit={PAGE}&offset={offset}'
        req = urllib.request.Request(
            url,
            headers={
                'apikey': SUPABASE_KEY,
                'Authorization': 'Bearer ' + SUPABASE_KEY,
            }
        )
        res = urllib.request.urlopen(req)
        records = json.loads(res.read())
        all_records.extend(records)
        if len(records) < PAGE:
            break
        offset += PAGE
    return all_records

def upsert_proposals(items):
    payload = json.dumps([{'id': item['id'], 'data': item} for item in items]).encode()
    req = urllib.request.Request(
        SUPABASE_URL + '/rest/v1/proposals',
        data=payload,
        headers={
            'apikey': SUPABASE_KEY,
            'Authorization': 'Bearer ' + SUPABASE_KEY,
            'Content-Type': 'application/json',
            'Prefer': 'resolution=merge-duplicates,return=minimal',
        },
        method='POST'
    )
    urllib.request.urlopen(req)

def main():
    print("提案データを取得中...")
    records = fetch_all_proposals()
    print(f"取得: {len(records)}件")

    to_update = []
    for r in records:
        data = r['data'] if isinstance(r['data'], dict) else json.loads(r['data'])
        if not data.get('service'):
            data['service'] = 'worktalk'
            to_update.append(data)

    print(f"更新対象: {len(to_update)}件（service未設定）")
    if not to_update:
        print("更新対象なし。完了。")
        return

    confirm = input(f"{len(to_update)}件に service='worktalk' をセットします。続けますか？ (y/n): ")
    if confirm.lower() != 'y':
        print("キャンセルしました")
        return

    BATCH = 50
    success = 0
    for i in range(0, len(to_update), BATCH):
        batch = to_update[i:i + BATCH]
        upsert_proposals(batch)
        success += len(batch)
        print(f"  {success}/{len(to_update)}件完了...")

    print(f"\n✅ {success}件のマイグレーションが完了しました")

if __name__ == '__main__':
    main()
