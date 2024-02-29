# 日誌收容平台：
* 目的: Windows原生事件日誌檢視器功能有限，不方便瀏覽跟進行日誌的深入分析，所以我們就開發了這個平台，來解決這個問題。此平台可以協助管理員更有效率的瀏覽以及分析日誌內容，以及排查問題。

* 主要功能：
  1.  登入功能
  2.	透過首頁dashboard知道主機log的大致情況
  3.	可以在首頁選擇時間來查看該時段的日誌圖表
  4.	透過首頁可以查看有多少筆異樣log
  5.	在log查詢頁面使用查詢器，例如時間區別、屬性、哪台主機來過濾，以幫助快速定位特定log
  6.	在異樣log查詢頁面使用查詢器，例如時間區別、屬性、哪台主機來過濾，以幫助快速定位特定log
  7.	在log詳細訊息頁面中查看log的屬性、來源、時間等訊息

* 使用工具：
  * 網頁設計：HTML、CSS、JavaScript
  * 前端框架：Bootstrap
  * 後端程式語言：Node.js
  * 後端框架 : Express.js
  * 渲染模板 : EJS
  * 資料庫 : Elasticsearch

* 背後技術解析 : 我們用Sysmon在Windows系統上生成詳細的事件日誌，透過Winlogbeat將這些事件日誌收集並傳送到Elasticsearch中，再用網頁方式呈現資料。
* Demo影片：<a href="https://www.youtube.com/watch?v=wJC7EeIhK9o">https://www.youtube.com/watch?v=wJC7EeIhK9o</a>
