# 華雄天地 CRM 前端

正式入口：https://sunny780901.github.io/huaxiong-crm/

## 開發與檢查

使用 Node.js 24 與 pnpm 11.25.0。

```sh
pnpm install --frozen-lockfile --ignore-scripts
pnpm build
pnpm test
```

Tailwind CSS 3.4.17 編譯至 `assets/crm.css`；修改 HTML 後必須重新編譯並一起提交 CSS。套件版本與外部前端資源版本固定於 `package.json`、`pnpm-lock.yaml`、`external-assets.json`。

`pnpm check` 會重新建置、執行測試，再核對提交的 CSS 是否與建置結果相符。GitHub Actions 對 PR 與 main 執行相同檢查。

## 價目管理

專案經理且具有「現場價目表」權限的登入者，可在價目表新增或修改房屋、車位、實品屋、COPY 與選配價格。金額單位為萬，保留最多兩位小數。修改紀錄顯示操作人、時間、修改前後內容。

後端在既有私人 CRM 資料庫保留覆寫資料與異動紀錄；第一次真正修改才建立工作表。重送同一筆儲存不會重複新增紀錄；其他管理者已更新時，須重新載入後再編輯。

後端程式、私人資料與登入資訊不得提交到此公開 repository。後端版本另行保存於私人本機 Git。

## 發布流程

1. 從 main 建立功能分支；依需要使用 Git worktree 隔離工作。
2. 完成前後端測試與隔離流程驗收，核對目前雲端後端原始碼。
3. 先更新既有 Apps Script 部署，保留部署網址與原有存取設定。
4. 前端 PR 檢查通過後合併至 main；GitHub Pages 發布 HTML 與已編譯 CSS。
5. 核對該次 Pages 部署成功，正式頁面與 CSS 符合發布版本，並補上真實裝置驗收。

隔離測試與桌面手機尺寸測試不等於實際 iPhone／LINE 驗收。真機驗收須確認登入、客戶新增／修改、預約時間、已購客交屋後移出、首頁計數及登出。任何會改變真實交屋狀態的測試，須使用事先指定的驗收資料。

## 回復

前端透過回復對應的發布 commit 建立 PR，通過檢查再發布。回復前端時需一併回復 HTML、CSS 與版本設定。

後端在 Apps Script 管理部署中改回已核對的前一版本，保留同一部署 ID。保留價目資料與異動紀錄，不因回復程式刪除工作表。若回到不支援價目管理的舊後端，前端會隱藏管理按鈕；舊後端也不會讀取新的價目覆寫，因此需事先評估價目一致性。
