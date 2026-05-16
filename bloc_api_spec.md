# BLOC 系統 API 端點規格文件

## 背景說明

BLOC 是一個抱石比賽計分系統。本文件說明需要新增的 API 端點，用途是讓外部的直播字卡網頁可以即時抓取選手成績，顯示在直播畫面上。

---

## 需要新增的端點

### 端點一：排名 / 成績（必要）

```
GET /api/events/:event_id/categories/:category_id/ranking
```

**用途：**
直播字卡網頁每 3 秒輪詢一次，取得目前所有選手的即時成績。

**路徑參數：**

| 參數 | 型別 | 說明 |
|---|---|---|
| event_id | integer | 賽事 ID |
| category_id | integer | 組別 ID（例如男子組、女子組）|

**回傳格式：**

```json
[
  {
    "number": "M01",
    "name": "陳建宏",
    "tops": 3,
    "attempts": 7
  },
  {
    "number": "M02",
    "name": "林志偉",
    "tops": 2,
    "attempts": 5
  }
]
```

**回傳欄位說明：**

| 欄位 | 型別 | 說明 |
|---|---|---|
| number | string | 選手背號（例如 M01）|
| name | string | 選手姓名 |
| tops | integer | 完成頂點數 |
| attempts | integer | 總嘗試次數 |

**排序：**
依照排名由高到低排序（tops 多的排前面，tops 相同則 attempts 少的排前面）。

**錯誤處理：**

| 情況 | HTTP 狀態碼 | 回傳內容 |
|---|---|---|
| 正常 | 200 | JSON 陣列 |
| 找不到賽事 | 404 | `{ "error": "event not found" }` |
| 找不到組別 | 404 | `{ "error": "category not found" }` |
| 伺服器錯誤 | 500 | `{ "error": "server error" }` |

---

### 端點二：目前出賽選手（選填，未來擴充用）

```
GET /api/events/:event_id/current_climber
```

**用途：**
未來讓 BLOC 系統可以主動標記目前出賽的選手，字卡自動切換。目前階段可以先不實作。

**回傳格式：**

```json
{
  "number": "M01",
  "name": "陳建宏",
  "tops": 3,
  "attempts": 7
}
```

---

## CORS 設定（重要）

字卡網頁是從本地 HTML 檔案發出 HTTP 請求，瀏覽器的安全限制會擋掉跨來源請求，因此 BLOC 後端必須開啟 CORS。

所有 `/api/*` 的 Response Header 需要加入：

```
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET, OPTIONS
Access-Control-Allow-Headers: Content-Type
```

---

## 測試方式

API 開發完成後，用瀏覽器直接開啟以下網址確認回傳格式是否正確：

```
https://boulder-scoring-system-production.up.railway.app/api/events/2/categories/5/ranking
```

應該回傳 JSON 格式的選手成績陣列。

---

## 備註

- API 不需要驗證（Token 或登入），開放讀取即可
- 字卡網頁在收到非 200 狀態碼時，會保持顯示上一次成功的資料，不清空畫面
- 回傳的 `number` 欄位會用來比對 `rounds.json` 裡的選手背號，欄位名稱和格式必須一致
